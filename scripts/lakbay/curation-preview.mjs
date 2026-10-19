
/**
 * Lakbay Destination Curation Preview
 * Read-only: does not modify Supabase records.
 */

import { getAdmin } from "./_core.mjs";

const db = getAdmin();

const categories = [
  "Nature",
  "Adventure",
  "Beach",
  "History",
  "Culture",
  "Food",
];

function classify(place) {
  const tags = place.source_tags || {};
  const name = (place.name || "").trim();
  const access = String(tags.access || "").toLowerCase();
  const reasons = [];

  if (["private", "no"].includes(access)) {
    reasons.push("Restricted access");
    return { priority: "Access review", reasons };
  }

  if (
    tags.barrier === "gate" ||
    /^(north |south |east |west )?(entrance|exit)$/i.test(name)
  ) {
    reasons.push("Possible non-destination");
    return { priority: "Quality review", reasons };
  }

  if (
    /^[a-z]{1,3}\d+-\d+$/i.test(name) ||
    ["unknown", "unnamed"].includes(name.toLowerCase())
  ) {
    reasons.push("Suspicious destination name");
    return { priority: "Quality review", reasons };
  }

  if (place.category === "Food" ||
      tags.amenity === "marketplace") {
    reasons.push("Excluded from default tourist map");
    return { priority: "Food excluded", reasons };
  }

  if (
    tags.waterway === "waterfall" ||
    ["beach", "cave_entrance", "hot_spring", "volcano"]
      .includes(tags.natural) ||
    ["museum", "viewpoint"].includes(tags.tourism) ||
    ["ruins", "fort", "archaeological_site"]
      .includes(tags.historic)
  ) {
    reasons.push("Strong attraction-related OSM tags");
    return { priority: "Priority review", reasons };
  }

  reasons.push("Requires tourism relevance verification");
  return { priority: "Standard review", reasons };
}

async function main() {
  console.log("LAKBAY CURATION PREVIEW");
  console.log("Database mode: READ ONLY\n");

  const samples = [];

  for (const category of categories) {
    const { data, error } = await db
      .from("lakbay_destinations")
      .select(
        "id,name,province,category,source_tags,review_status"
      )
      .eq("review_status", "pending")
      .eq("category", category)
      .order("id")
      .limit(50);

    if (error) throw new Error(error.message);

    for (const place of data || []) {
      samples.push({
        name: place.name,
        province: place.province,
        category: place.category,
        ...classify(place),
      });
    }
  }

  const counts = {};

  for (const place of samples) {
    counts[place.priority] =
      (counts[place.priority] || 0) + 1;
  }

  console.log("SAMPLE CLASSIFICATION");
  console.table(
    Object.entries(counts).map(([priority, count]) => ({
      priority,
      count,
    }))
  );

  console.log("\nEXAMPLE DESTINATIONS");

  for (const priority of Object.keys(counts)) {
    console.log(`\n${priority}`);

    console.table(
      samples
        .filter(p => p.priority === priority)
        .slice(0, 5)
        .map(p => ({
          name: p.name,
          province: p.province,
          category: p.category,
          reason: p.reasons.join("; "),
        }))
    );
  }

  console.log("\nPreview completed.");
  console.log("Records sampled:", samples.length);
  console.log("Database records modified: 0");
  console.log("No destinations were approved or rejected.");
}

main().catch(error => {
  console.error("Curation preview failed:", error.message);
  process.exitCode = 1;
});
