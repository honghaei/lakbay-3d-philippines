
/**
 * Lakbay Beta Photo Preview
 *
 * Searches Wikimedia Commons for photo candidates
 * for the initial 12 tourist attractions.
 *
 * Supabase: READ ONLY
 * Output: Local CSV for manual review
 */

import fs from "node:fs";
import {
  getAdmin,
  fetchJson,
  sleep,
  safeUrl
} from "./_core.mjs";

const db = getAdmin();

const targets = [
  ["Kaparkan Falls", "Abra"],
  ["Dunsulan Falls", "Bataan"],
  ["Torongan Cave", "Batanes"],
  ["Mantayupan Falls", "Cebu"],
  ["Asik-Asik Falls", "Cotabato"],
  ["Kutawato Cave", "Cotabato City"],
  ["Aliwagwag Falls", "Davao Oriental"],
  ["Tappiya Falls", "Ifugao"],
  ["Pagsanjan Falls", "Laguna"],
  ["Fort of Cuyo", "Palawan"],
  ["Cambugahay Falls", "Siquijor"],
  ["Tinuy-an Falls", "Surigao del Sur"]
];

const apiBase = "https://commons.wikimedia.org/w/api.php";

const api = params =>
  `${apiBase}?${new URLSearchParams({
    action: "query",
    format: "json",
    ...params
  })}`;

function plain(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function validLicense(meta) {
  const license = plain(
    meta.LicenseShortName?.value ||
    meta.License?.value
  );

  if (/non.?commercial|no.?derivatives|\bNC\b|\bND\b/i.test(license)) {
    return null;
  }

  return /^(CC0|CC BY(?:-SA)?\b|Public domain|PD-)/i
    .test(license) ? license : null;
}

function parsePhoto(page, method) {
  const info = page?.imageinfo?.[0];
  if (!info) return null;

  const meta = info.extmetadata || {};
  const license = validLicense(meta);
  const url = info.thumburl || info.url;

  if (
    !license ||
    !/^image\/(jpeg|png|webp)$/.test(info.mime || "") ||
    !safeUrl(url, ["wikimedia.org"]) ||
    !safeUrl(info.descriptionurl, ["commons.wikimedia.org"])
  ) {
    return null;
  }

  return {
    photo_url: url,
    source_url: info.descriptionurl,
    caption: plain(page.title || ""),
    photographer: plain(meta.Artist?.value || ""),
    license,
    license_url: meta.LicenseUrl?.value || "",
    match_method: method,
    review_decision: "NEEDS_MANUAL_REVIEW"
  };
}

async function findWikidataPhoto(qid) {
  if (!/^Q\d+$/.test(qid || "")) return [];

  const url = `https://www.wikidata.org/w/api.php?${
    new URLSearchParams({
      action: "wbgetentities",
      ids: qid,
      props: "claims",
      format: "json"
    })
  }`;

  const entity = await fetchJson(url);
  const filename = entity.entities?.[qid]
    ?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;

  if (!filename) return [];

  const result = await fetchJson(api({
    titles: filename.startsWith("File:")
      ? filename : `File:${filename}`,
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "1100"
  }));

  return Object.values(result.query?.pages || {})
    .map(p => parsePhoto(p, "Wikidata P18"))
    .filter(Boolean);
}

async function searchCommons(name, province) {
  const result = await fetchJson(api({
    generator: "search",
    gsrsearch: `"${name}" ${province}`,
    gsrnamespace: "6",
    gsrlimit: "5",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "1100"
  }));

  return Object.values(result.query?.pages || {})
    .map(p => parsePhoto(p, "Commons name search"))
    .filter(Boolean)
    .slice(0, 3);
}

function csvValue(value) {
  return `"${String(value ?? "")
    .replaceAll('"', '""')}"`;
}

async function main() {
  console.log("LAKBAY BETA PHOTO PREVIEW");
  console.log("Supabase: READ ONLY");
  console.log("Target attractions:", targets.length);

  const { data, error } = await db
    .from("lakbay_destinations")
    .select(
      "id,name,province,category,review_status,wikidata_id,source_tags"
    )
    .in("name", targets.map(t => t[0]));

  if (error) throw new Error(error.message);

  const results = [];

  for (const [name, province] of targets) {
    let matches = (data || []).filter(p =>
      p.name?.trim().toLowerCase() === name.toLowerCase() &&
      p.province?.trim().toLowerCase() === province.toLowerCase()
    );

    // Select the waterfall feature rather than
    // the separate Dunsulan Falls viewpoint.
    if (name === "Dunsulan Falls") {
      matches = matches.filter(
        p => p.source_tags?.waterway === "waterfall"
      );
    }

    if (matches.length !== 1) {
      console.warn(
        `Skipping ${name}: ${matches.length} matching records`
      );
      continue;
    }

    const place = matches[0];
    let photos = [];

    try {
      const qid =
        place.wikidata_id ||
        place.source_tags?.wikidata;

      if (qid) {
        photos = await findWikidataPhoto(qid);
      }

      if (!photos.length) {
        photos = await searchCommons(
          place.name,
          place.province
        );
      }

      for (const photo of photos) {
        results.push({
          destination_id: place.id,
          name: place.name,
          province: place.province,
          ...photo
        });
      }

      console.log(
        `${name}: ${photos.length} photo candidates`
      );

    } catch (err) {
      console.warn(`${name}: ${err.message}`);
    }

    await sleep(1300);
  }

  fs.mkdirSync("reports", { recursive: true });

  const columns = [
    "destination_id",
    "name",
    "province",
    "photo_url",
    "source_url",
    "caption",
    "photographer",
    "license",
    "license_url",
    "match_method",
    "review_decision"
  ];

  const csv = [
    columns.join(","),
    ...results.map(row =>
      columns.map(k => csvValue(row[k])).join(",")
    )
  ].join("\r\n");

  const output = "reports/lakbay-beta-photo-preview.csv";
  fs.writeFileSync(output, csv, "utf8");

  console.log("\nPreview completed.");
  console.log("Photo candidates:", results.length);
  console.log("Report:", output);
  console.log("Supabase records modified: 0");
  console.log("Manually verify subjects, rights and attribution.");
}

main().catch(err => {
  console.error("Preview failed:", err.message);
  process.exitCode = 1;
});
