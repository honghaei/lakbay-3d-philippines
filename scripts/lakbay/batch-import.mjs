/**
 * LAKBAY: Conservative, resumable nationwide OSM import batches.
 *
 * Usage (from exploreph-3d project root):
 *   node scripts/lakbay/batch-import.mjs --plan
 *   node scripts/lakbay/batch-import.mjs --batches=2 --per-batch=1
 *
 * Reuses your existing import-osm.mjs and its .osm-cache / import state.
 * Never calls --force or --refresh. Automatically pauses once for 15 min
 * after a recoverable Overpass error; rate limits (429) and non-network
 * errors stop immediately. No progress or cached tiles are discarded.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const importer = path.join(root, "scripts", "lakbay", "import-osm.mjs");
const envFile = path.join(root, ".env.local");
const provincesFile = path.join(root, "public", "data", "philippines-provinces.geojson");
const stateFile = path.join(root, "scripts", "lakbay", ".lakbay-import-state.json");
const failureFile = path.join(root, "scripts", "lakbay", ".lakbay-import-last-error.json");

function option(name, fallback) {
  const value = process.argv.find(value => value.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : String(fallback);
}
function integer(name, fallback, low, high) {
  const raw = option(name, fallback);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < low || n > high) {
    throw new Error(`--${name} must be an integer between ${low} and ${high}.`);
  }
  return n;
}
function mustExist(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

function provinceNames() {
  const geo = JSON.parse(fs.readFileSync(provincesFile, "utf8"));
  if (geo.type !== "FeatureCollection" || !Array.isArray(geo.features)) {
    throw new Error("Province GeoJSON is not a FeatureCollection.");
  }
  const list = geo.features
    .filter(f => f.geometry && f.properties?.shapeName)
    .map(f => String(f.properties.shapeName))
    .filter(name => !/district/i.test(name));
  const unique = [...new Set(list)];
  if (!unique.includes("Metro Manila")) unique.push("Metro Manila");
  return unique;
}
function completedNames() {
  if (!fs.existsSync(stateFile)) return new Set();
  const data = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const completed = data.completed || {};
  return new Set(Object.keys(completed).filter(name => completed[name] && !completed[name].truncated));
}
function pendingNames(names, complete) {
  return names.filter(name => !complete.has(name));
}
function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
function lastFailure() {
  try {
    return JSON.parse(fs.readFileSync(failureFile, "utf8"));
  } catch { return null; }
}
function runImporter(perBatch) {
  return new Promise((resolve, reject) => {
    // Prevent an earlier run's failure report from causing a false retry.
    if (fs.existsSync(failureFile)) fs.unlinkSync(failureFile);
    const child = spawn(process.execPath, [
      "--env-file=.env.local",
      "scripts/lakbay/import-osm.mjs",
      "--all",
      `--max-provinces=${perBatch}`,
    ], { cwd: root, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) reject(new Error(`Importer stopped by signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

async function main() {
  mustExist(importer);
  mustExist(provincesFile);
  const provinces = provinceNames();
  const before = completedNames();
  const left = pendingNames(provinces, before);
  console.log(`Lakbay import status: ${provinces.length - left.length}/${provinces.length} geographic provinces/areas completed.`);
  console.log(`Remaining: ${left.length}. Next up: ${left.slice(0, 5).join(", ") || "none"}`);

  if (process.argv.includes("--plan")) {
    console.log("Plan mode only. No requests made, no database writes.");
    return;
  }
  if (!left.length) {
    console.log("All listed provinces/areas already completed. No import required.");
    return;
  }
  mustExist(envFile);
  const batches = integer("batches", 2, 1, 4);
  const perBatch = integer("per-batch", 1, 1, 2);
  const pause = integer("pause-seconds", 120, 60, 600);
  const recoveries = integer("max-recoveries", 1, 0, 2);
  const cooldown = integer("recovery-seconds", 900, 300, 3600);
  console.log(`Processing up to ${batches} batches × ${perBatch} province(s), pausing ${pause}s between batches.`);
  console.log(`Recoverable Overpass failures: up to ${recoveries} session retry/retries after at least ${cooldown}s cooldown.`);
  console.log("A 429 rate limit or non-Overpass error stops immediately; Ctrl+C stops the session.");

  let completedBefore = before.size;
  for (let step = 1; step <= batches; step++) {
    console.log(`\n========== Lakbay batch ${step}/${batches} ==========`);
    let exitCode = 1;
    for (let recoveryAttempt = 0; recoveryAttempt <= recoveries; recoveryAttempt++) {
      exitCode = await runImporter(perBatch);
      if (exitCode === 0) break;
      const failure = lastFailure();
      if (!failure?.retryable || recoveryAttempt === recoveries) {
        console.error(`Importer stopped${failure?.province ? ` at ${failure.province}` : ""}. Cached tiles and completed areas are preserved.`);
        if (failure?.status === 429) {
          console.error("Rate limit or long server cooldown: stop and respect the provider's wait time.");
        } else if (!failure?.retryable) {
          console.error("Not a recoverable Overpass error; inspect the previous error before restarting.");
        } else {
          console.error("Automatic recovery limit reached. Try again later without --force.");
        }
        process.exitCode = 1;
        return;
      }
      const cooldownSeconds = Math.max(cooldown, Math.ceil(failure.retryAfterSeconds || 0));
      if (cooldownSeconds > 3600) {
        console.error("Server requested over one hour cooldown. Stopping for manual resumption.");
        process.exitCode = 1;
        return;
      }
      console.warn(`Pausing ${cooldownSeconds}s after ${failure.province || "Overpass"} HTTP ${failure.status || "network"} before ONE safe resume attempt (${recoveryAttempt + 1}/${recoveries}).`);
      console.warn("Previously completed provinces and cached tiles will be reused.");
      await sleep(cooldownSeconds * 1000);
    }
    const complete = completedNames();
    const remaining = pendingNames(provinces, complete);
    const newlyDone = complete.size - completedBefore;
    console.log(`Batch finished: +${newlyDone} completed provinces/areas; ${remaining.length} remaining.`);
    if (!remaining.length) {
      console.log("Nationwide import queue completed. Review destinations before publishing.");
      return;
    }
    if (newlyDone <= 0) {
      console.warn("No new province marked complete. Stopping to avoid an endless/repeated import.");
      return;
    }
    completedBefore = complete.size;
    if (step !== batches) {
      console.log(`Waiting ${pause} seconds to avoid overloading public Overpass servers...`);
      await sleep(pause * 1000);
    }
  }
  console.log("\nBatch session complete. Rerun the same command later to continue.");
  console.log("To verify Supabase totals: node --env-file=.env.local scripts/lakbay/check.mjs");
}

main().catch(error => {
  console.error(`Lakbay batch runner: ${error.message}`);
  process.exitCode = 1;
});
