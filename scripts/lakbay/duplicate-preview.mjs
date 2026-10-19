
/**
 * Lakbay Duplicate Detection Preview
 * READ ONLY - No database modifications.
 */

import { getAdmin } from "./_core.mjs";

const db = getAdmin();

const PAGE_SIZE = 750;
const MAX_DISTANCE_METERS = 250;

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function distanceMeters(a, b) {
  const toRad = Math.PI / 180;
  const lat1 = a.latitude * toRad;
  const lat2 = b.latitude * toRad;
  const deltaLat = (b.latitude - a.latitude) * toRad;
  const deltaLon = (b.longitude - a.longitude) * toRad;

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(deltaLon / 2) ** 2;

  return 6371000 * 2 *
    Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function loadDestinations() {
  const all = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("lakbay_destinations")
      .select(
        "id,source_key,name,province,latitude,longitude,review_status"
      )
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    all.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) break;
  }

  return all;
}

async function main() {
  console.log("LAKBAY DUPLICATE AUDIT");
  console.log("Database mode: READ ONLY\n");

  const destinations = await loadDestinations();

  console.log("Records scanned:", destinations.length);

  const groups = new Map();

  for (const place of destinations) {
    const name = normalizeName(place.name);
    const province = normalizeName(place.province);

    if (!name || !province) continue;

    const key = `${province}|${name}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(place);
  }

  const matches = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        if (a.source_key === b.source_key) continue;

        if (
          a.review_status !== "pending" &&
          b.review_status !== "pending"
        ) continue;

        if (
          !Number.isFinite(a.latitude) ||
          !Number.isFinite(a.longitude) ||
          !Number.isFinite(b.latitude) ||
          !Number.isFinite(b.longitude)
        ) continue;

        const meters = distanceMeters(a, b);

        if (meters <= MAX_DISTANCE_METERS) {
          matches.push({
            name: a.name,
            province: a.province,
            distance_m: Math.round(meters),
            status_a: a.review_status,
            status_b: b.review_status,
            source_a: a.source_key,
            source_b: b.source_key,
          });
        }
      }
    }
  }

  matches.sort((a, b) => a.distance_m - b.distance_m);

  console.log("\nPOTENTIAL DUPLICATE PAIRS:");
  console.log(matches.length);

  console.log("\nFIRST 20 MATCHES:");
  console.table(matches.slice(0, 20));

  console.log("\nAudit completed.");
  console.log("Database records modified: 0");
  console.log("No destinations were merged or deleted.");
}

main().catch(error => {
  console.error("Duplicate audit failed:", error.message);
  process.exitCode = 1;
});
