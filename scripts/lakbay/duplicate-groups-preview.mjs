
/**
 * Lakbay Duplicate Group Analysis
 * Supabase READ ONLY
 * Groups potential duplicates without merging records.
 */

import { getAdmin } from "./_core.mjs";

const db = getAdmin();
const PAGE_SIZE = 750;
const MAX_DISTANCE = 250;

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function distance(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;

  return 6371000 * 2 *
    Math.asin(Math.sqrt(Math.min(1, h)));
}

async function loadAll() {
  const records = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("lakbay_destinations")
      .select(
        "id,name,province,category,latitude,longitude,source_key,review_status"
      )
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    records.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) break;
  }

  return records;
}

async function main() {
  console.log("LAKBAY DUPLICATE GROUP PREVIEW");
  console.log("Supabase: READ ONLY\n");

  const records = await loadAll();
  const buckets = new Map();

  for (const place of records) {
    const key =
      `${normalize(place.province)}|${normalize(place.name)}`;

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(place);
  }

  const clusters = [];
  let totalPairs = 0;

  for (const places of buckets.values()) {
    if (places.length < 2) continue;

    const parent = places.map((_, i) => i);

    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }

    function unite(a, b) {
      parent[find(a)] = find(b);
    }

    const matches = [];

    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const a = places[i];
        const b = places[j];

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

        const meters = distance(a, b);

        if (meters <= MAX_DISTANCE) {
          unite(i, j);
          matches.push({ i, j, meters });
          totalPairs++;
        }
      }
    }

    if (!matches.length) continue;

    const components = new Map();

    for (let i = 0; i < places.length; i++) {
      const root = find(i);
      if (!components.has(root)) components.set(root, []);
      components.get(root).push(i);
    }

    for (const indices of components.values()) {
      if (indices.length < 2) continue;

      const members = indices.map(i => places[i]);
      const memberIndices = new Set(indices);

      const evidence = matches.filter(
        m => memberIndices.has(m.i) &&
             memberIndices.has(m.j)
      );

      clusters.push({
        name: members[0].name,
        province: members[0].province,
        records: members.length,
        pairs: evidence.length,
        zero_meter_pairs: evidence.filter(
          m => m.meters < 0.5
        ).length,
        approved: members.filter(
          m => m.review_status === "approved"
        ).length,
        food_only: members.every(
          m => m.category === "Food"
        ),
        members,
      });
    }
  }

  clusters.sort(
    (a, b) =>
      Number(a.food_only) - Number(b.food_only) ||
      b.records - a.records ||
      b.pairs - a.pairs
  );

  console.log("AUDIT SUMMARY");
  console.table({
    records_scanned: records.length,
    potential_pairs: totalPairs,
    duplicate_clusters: clusters.length,
    records_in_clusters: clusters.reduce(
      (n, c) => n + c.records, 0
    ),
    non_food_clusters: clusters.filter(
      c => !c.food_only
    ).length,
    food_only_clusters: clusters.filter(
      c => c.food_only
    ).length,
  });

  console.log("\nTOP 20 CLUSTERS");
  console.table(
    clusters.slice(0, 20).map(c => ({
      name: c.name,
      province: c.province,
      records: c.records,
      pairs: c.pairs,
      zero_meter_pairs: c.zero_meter_pairs,
      approved: c.approved,
      food_only: c.food_only,
    }))
  );

  console.log("\nFIRST 3 CLUSTER DETAILS");

  for (const cluster of clusters.slice(0, 3)) {
    console.log(`\n${cluster.name} - ${cluster.province}`);

    console.table(
      cluster.members.map(m => ({
        name: m.name,
        status: m.review_status,
        source: m.source_key,
        latitude: m.latitude,
        longitude: m.longitude,
      }))
    );
  }

  console.log("\nAudit completed.");
  console.log("Database records modified: 0");
  console.log("No records were merged, hidden or deleted.");
}

main().catch(error => {
  console.error("Duplicate group audit failed:", error.message);
  process.exitCode = 1;
});
