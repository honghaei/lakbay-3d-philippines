/**
 * Lakbay OpenStreetMap / Overpass importer (resumable, cached).
 *
 * Recommended workflow:
 *   node --env-file=.env.local scripts/lakbay/import-osm.mjs --province=Bulacan --download-only
 *   node --env-file=.env.local scripts/lakbay/import-osm.mjs --province=Bulacan --import-only
 *   node --env-file=.env.local scripts/lakbay/check.mjs
 *
 * Other flags: --dry-run, --all --max-provinces=2, --grid=2, --force,
 * --refresh, --limit=2500, --print-query.
 *
 * Cached Overpass tiles are saved in scripts/lakbay/.osm-cache/.
 * Transient Overpass errors use bounded exponential backoff. HTTP 429
 * is never retried automatically. Only explicitly configured fallback
 * endpoints may be used (never silently rotate public services).
 * A failed tile never replaces a successfully cached tile. Imported OSM sites
 * remain PENDING; existing records are preserved using ignoreDuplicates.
 *
 * Respect shared Overpass service capacity. For large-scale national imports,
 * use a locally downloaded Philippines OSM PBF extract instead.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  argValue, hasFlag, normalize, slug, geoRecord, readGeo, NCR_CITIES,
  provinceFeatures, insideGeometry, inPhilippines, getAdmin, sleep,
} from "./_core.mjs";

const primary = process.env.LAKBAY_OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const fallback = process.env.LAKBAY_OVERPASS_FALLBACK_URL || "";
const retryLimit = 3; // Total attempts per uncached tile, including the first.
const backoffBaseSeconds = 60; // 60s, 120s. Helps avoid hammering shared servers.
const maxRetryAfterSeconds = 240; // Longer provider cooldowns require manual resume.
const contact = process.env.LAKBAY_CONTACT_EMAIL;
const requested = normalize(argValue("province"));
const all = hasFlag("all");
const dryRun = hasFlag("dry-run");
const downloadOnly = hasFlag("download-only");
const importOnly = hasFlag("import-only");
const printQuery = hasFlag("print-query");
const force = hasFlag("force");
const refresh = hasFlag("refresh");
const limit = Math.max(1, Math.min(10000, Number(argValue("limit", "2500")) || 2500));
const grid = Math.max(1, Math.min(4, Number(argValue("grid", "2")) || 2));
const maxProvinces = Math.max(1, Math.min(10, Number(argValue("max-provinces", "2")) || 2));

if (!requested && !all) throw new Error("Choose --province=Bulacan or --all --max-provinces=2.");
if (downloadOnly && importOnly) throw new Error("Use --download-only and --import-only in separate commands.");
if (refresh && importOnly) throw new Error("--refresh requires a download mode.");
if (!importOnly && !printQuery && (!contact || !contact.includes("@"))) {
  throw new Error("Set LAKBAY_CONTACT_EMAIL in .env.local for an identifiable importer.");
}
for (const endpoint of [primary, fallback].filter(Boolean)) {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw new Error("Overpass API endpoints must use HTTPS (except localhost for testing).");
  }
}

const provinces = [...provinceFeatures(), {
  properties: { shapeName: "Metro Manila" },
  ncr: true,
  box: { south: 14.3, west: 120.85, north: 14.9, east: 121.25 },
}];
const ncrCities = readGeo(NCR_CITIES);
const chosen = all ? provinces : provinces.filter(f => normalize(f.properties.shapeName) === requested);
if (!chosen.length) throw new Error(`Province not found: ${requested}`);

// Restrict selectors to meaningful named attractions (not every building).
const osmTags = {
  tourism: "^(attraction|museum|viewpoint|gallery|zoo|aquarium|theme_park|artwork)$",
  natural: "^(beach|waterfall|cave_entrance|peak|volcano|hot_spring)$",
  historic: "^(monument|memorial|archaeological_site|ruins|castle|fort|church)$",
  heritage: "^.+$",
  amenity: "^(marketplace|arts_centre)$",
  leisure: "^(nature_reserve|park)$",
  waterway: "^waterfall$",
};
const signature = crypto.createHash("sha256").update(JSON.stringify({
  version: 4, osmTags, grid, timeout: 65,
})).digest("hex").slice(0, 16);

function makeQuery(b) {
  const bbox = [b.south, b.west, b.north, b.east].map(n => n.toFixed(5)).join(",");
  const clauses = Object.entries(osmTags).map(([key, val]) =>
    `  nwr["${key}"~"${val}"]["name"](${bbox});`);
  return `[out:json][timeout:65];\n(\n${clauses.join("\n")}\n);\nout center;`;
}

function tilesFor(b) {
  const tiles = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      tiles.push({
        south: b.south + (b.north - b.south) * row / grid,
        north: b.south + (b.north - b.south) * (row + 1) / grid,
        west: b.west + (b.east - b.west) * col / grid,
        east: b.west + (b.east - b.west) * (col + 1) / grid,
      });
    }
  }
  return tiles;
}
const cacheRoot = path.resolve("scripts/lakbay/.osm-cache");
const statePath = path.resolve("scripts/lakbay/.lakbay-import-state.json");
const lastErrorPath = path.resolve("scripts/lakbay/.lakbay-import-last-error.json");
// Clear stale diagnostics, but leave all tile caches and import checkpoints untouched.
if (fs.existsSync(lastErrorPath)) fs.unlinkSync(lastErrorPath);
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { completed: {} };
state.completed ||= {};

function cachePath(name, tileIndex) {
  return path.join(cacheRoot, slug(name), `${signature}-tile-${tileIndex + 1}.json`);
}
function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temp = `${filename}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value), "utf8");
    fs.renameSync(temp, filename);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function readCached(filename, b) {
  if (!fs.existsSync(filename)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (data.signature !== signature || JSON.stringify(data.bounds) !== JSON.stringify(b)
      || !Array.isArray(data.elements) || data.complete !== true) return null;
    return data.elements;
  } catch {
    console.warn(`  Invalid cached tile ignored: ${filename}`);
    return null;
  }
}

function overpassError(message, status = 0, retryAfter = 0) {
  const error = new Error(message);
  error.status = status;
  error.retryAfter = retryAfter;
  error.overpassFailure = true;
  return error;
}
function shortText(content) {
  return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}
function secondsForRetry(header) {
  if (!header) return 0;
  const n = Number(header);
  if (Number.isFinite(n)) return Math.max(0, n);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1000) : 0;
}

// At most 3 total requests per uncached tile. Do not retry/reroute HTTP 429.
// The fallback endpoint is used ONLY when its URL was deliberately configured.
// A failed tile is never cached as successful and never advances the province state.
async function requestOverpass(bounds) {
  const payload = new URLSearchParams({ data: makeQuery(bounds) }).toString();
  for (let attempt = 0; attempt < retryLimit; attempt++) {
    const endpoint = attempt > 0 && fallback && fallback !== primary ? fallback : primary;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
          "User-Agent": `LakbayTourismImporter/2.1 (${contact})`,
        },
        body: payload,
        signal: AbortSignal.timeout(85000),
      });
      const raw = await res.text();
      if (!res.ok) {
        throw overpassError(`Overpass HTTP ${res.status}: ${shortText(raw)}`,
          res.status, secondsForRetry(res.headers.get("Retry-After")));
      }
      let result;
      try { result = JSON.parse(raw); }
      catch { throw overpassError(`Overpass returned non-JSON data: ${shortText(raw)}`, 502); }
      if (!Array.isArray(result.elements)) {
        throw overpassError("Overpass response did not contain an elements array.", 502);
      }
      if (result.remark) throw overpassError(`Overpass: ${shortText(result.remark)}`, 504);
      return { elements: result.elements, endpoint };
    } catch (caught) {
      const error = caught?.name === "TimeoutError" || caught?.name === "AbortError"
        ? overpassError("Overpass request timed out.", 504)
        : caught;
      // Only network/HTTP errors from this request path are recoverable.
      error.overpassFailure = true;
      const status = Number.isInteger(error.status) ? error.status : 0;
      const transient = [0, 500, 502, 503, 504].includes(status);
      if (status === 429) {
        console.error("  HTTP 429: provider rate limit. Stop and respect its cooldown; no automatic retry or fallback.");
        throw error;
      }
      if (!transient || attempt === retryLimit - 1) throw error;
      const delay = Math.max(backoffBaseSeconds * 2 ** attempt, error.retryAfter || 0);
      if (delay > maxRetryAfterSeconds) {
        throw overpassError(`Provider requested ${Math.ceil(delay)}s of cooldown. Stop and retry later.`, 429, delay);
      }
      const nextEndpoint = fallback && fallback !== primary ? fallback : primary;
      console.warn(`  Overpass unavailable (${status || "network"}). Retry ${attempt + 2}/${retryLimit} in ${Math.ceil(delay)}s${nextEndpoint !== primary ? " using your configured fallback" : ""}...`);
      await sleep(delay * 1000);
    }
  }
}

async function readOrDownload(name, index, bounds) {
  const file = cachePath(name, index);
  const cached = !refresh && readCached(file, bounds);
  if (cached) {
    console.log(`  Tile ${index + 1}/${grid * grid}: using ${cached.length} cached features.`);
    return { elements: cached, fetched: false };
  }
  if (importOnly) throw new Error(`Missing complete cached tile ${index + 1}/${grid * grid}. Run --download-only first.`);
  console.log(`  Tile ${index + 1}/${grid * grid}: downloading...`);
  const response = await requestOverpass(bounds);
  // Atomically checkpoint *each successful tile* before requesting the next.
  writeJsonAtomic(file, {
    signature, complete: true, bounds, fetchedAt: new Date().toISOString(),
    endpoint: response.endpoint, elements: response.elements,
  });
  console.log(`  Tile ${index + 1}/${grid * grid}: saved ${response.elements.length} features.`);
  return { elements: response.elements, fetched: true };
}

function getCoords(element) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
}
function category(t) {
  if (t.amenity === "marketplace") return "Food";
  if (t.natural === "beach") return "Beach";
  if (t.natural === "waterfall" || t.waterway === "waterfall") return "Adventure";
  if (["zoo", "aquarium", "theme_park"].includes(t.tourism)) return "Adventure";
  if (t.historic || t.heritage) return "History";
  if (["museum", "gallery", "artwork"].includes(t.tourism)) return "Culture";
  if (t.natural || t.leisure === "nature_reserve") return "Nature";
  return "Culture";
}
function reasonableName(value) {
  return typeof value === "string" && value.trim().length >= 3 && value.trim().length <= 140
    && !/^(unnamed.*|viewpoint|park|beach|museum)$/i.test(value.trim());
}
function asRows(elements, feature, unique) {
  const name = feature.properties.shapeName;
  const localSeen = new Set();
  const result = [];
  for (const element of elements) {
    const coords = getCoords(element);
    const tags = element.tags || {};
    const title = tags["name:en"] || tags.name;
    if (!coords || !inPhilippines(coords) || !reasonableName(title)) continue;
    const matches = feature.ncr
      ? ncrCities.some(city => insideGeometry(coords, city.geometry))
      : insideGeometry(coords, feature.geometry);
    if (!matches) continue;
    const sourceKey = `osm:${element.type}/${element.id}`;
    if (unique.has(sourceKey) || localSeen.has(sourceKey)) continue;
    localSeen.add(sourceKey);
    result.push({
      source_key: sourceKey,
      slug: `${slug(title) || "place"}-${element.type[0]}${element.id}`,
      name: title,
      alternate_names: [...new Set([tags.name, tags["name:en"], tags.alt_name]
        .filter(Boolean))].filter(v => v !== title).slice(0, 8),
      province: name,
      city: tags["addr:city"] || tags["addr:municipality"] || null,
      category: category(tags),
      description: (tags["description:en"] || tags.description || "").slice(0, 1200) || null,
      longitude: coords[0], latitude: coords[1],
      wikidata_id: /^Q\d+$/.test(tags.wikidata || "") ? tags.wikidata : null,
      osm_type: element.type, osm_id: element.id,
      source_name: "OpenStreetMap contributors",
      source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      source_license: "ODbL 1.0", source_tags: tags,
      review_status: "pending",
    });
    if (result.length >= limit) break;
  }
  return result;
}

if (printQuery) {
  for (const feature of chosen) {
    const box = feature.ncr ? feature.box : geoRecord(feature);
    for (const tile of tilesFor(box)) {
      console.log(`--- ${feature.properties.shapeName} ---`);
      console.log(makeQuery(tile));
    }
  }
  process.exit(0);
}

const db = dryRun || downloadOnly ? null : getAdmin();
const unique = new Set();
let total = 0;
let processed = 0;
let failed = false;
let skipped = 0;
const work = chosen;
for (let i = 0; i < work.length; i++) {
  const feature = work[i];
  const name = feature.properties.shapeName;
  if (all && !force && !refresh && !dryRun
    && state.completed[name] && !state.completed[name].truncated) {
    console.log(`[${i + 1}/${work.length}] ${name}: already imported, skipping.`);
    skipped++;
    continue;
  }
  if (all && processed >= maxProvinces) {
    console.log(`Batch limit reached (${maxProvinces} provinces). Rerun to continue.`);
    break;
  }
  processed++;
  console.log(`[${i + 1}/${work.length}] Discovering ${name} (${grid * grid} resumable tiles)...`);
  try {
    const box = feature.ncr ? feature.box : geoRecord(feature);
    const pieces = [];
    const tiles = tilesFor(box);
    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
      const { elements, fetched } = await readOrDownload(name, tileIndex, tiles[tileIndex]);
      pieces.push(...elements);
      if (fetched && tileIndex < tiles.length - 1) await sleep(12000);
    }
    const rows = asRows(pieces, feature, unique);
    console.log(`  ${rows.length} province-assigned candidates (${pieces.length} raw tile features).`);
    if (downloadOnly) {
      console.log("  All tiles cached; now run --import-only to store these candidates.");
    } else if (dryRun) {
      console.log("  Preview only: Supabase was not changed. Successful downloads remain cached.");
    } else {
      for (let start = 0; start < rows.length; start += 100) {
        const { error } = await db.from("lakbay_destinations")
          .upsert(rows.slice(start, start + 100), { onConflict: "source_key", ignoreDuplicates: true });
        if (error) throw new Error(`Supabase: ${error.message}`);
      }
      state.completed[name] = {
        count: rows.length,
        truncated: rows.length >= limit,
        signature,
        date: new Date().toISOString(),
      };
      writeJsonAtomic(statePath, state);
      console.log(`  ${rows.length} candidates processed as pending (existing rows kept).`);
      if (rows.length >= limit) {
        console.warn(`  --limit=${limit} reached. Province not marked complete.`);
      }
    }
    for (const row of rows) unique.add(row.source_key);
    total += rows.length;
  } catch (error) {
    failed = true;
    const status = Number.isInteger(error.status) ? error.status : 0;
    const retryable = error.overpassFailure === true && [0, 500, 502, 503, 504].includes(status);
    writeJsonAtomic(lastErrorPath, {
      province: name,
      timestamp: new Date().toISOString(),
      status,
      retryable,
      retryAfterSeconds: Number(error.retryAfter) || 0,
      // Do not record credentials, environment variables or query payloads.
      summary: String(error.message || "Unknown error").slice(0, 400),
    });
    console.error(`  Failed ${name}: ${error.message}`);
    console.error("  Previously downloaded tiles are saved. Run this command again later to resume.");
    console.error("  Stopping instead of repeatedly contacting overloaded public servers.");
    break;
  }
  if (all && i < work.length - 1) await sleep(20000);
}
console.log(`Finished: ${total} candidates ${dryRun ? "previewed" : downloadOnly ? "cached" : "processed"}; ${skipped} completed provinces skipped.`);
console.log("OpenStreetMap attribution: © OpenStreetMap contributors (ODbL 1.0) https://www.openstreetmap.org/copyright");
console.log("New sites remain pending review; existing approved destinations are not overwritten.");
if (failed) process.exitCode = 1;
