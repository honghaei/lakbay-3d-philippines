import fs from "node:fs";
import { getAdmin, upsertBatches } from "./_core.mjs";

const db=getAdmin();
const seeds=JSON.parse(fs.readFileSync("data/starter-destinations.json","utf8"));
const aliases={
  "puerto-princesa-river":["Puerto Princesa Underground River","Underground River","Puerto Princesa Subterranean River National Park"],
  "chocolate-hills":["Chocolate Hills Bohol"],
  "miagao-church":["Miag-ao Church","Santo Tomas de Villanueva Parish Church"],
  "quezon-memorial-circle":["Quezon Memorial Circle Park"],
};
const photos=JSON.parse(fs.readFileSync("data/starter-photos.json","utf8"));
const rows=seeds.map(d=>({
  source_key:`lakbay:starter:${d.id}`,slug:d.id,name:d.name,province:d.province,
  city:d.city||null,alternate_names:aliases[d.id]||[],category:d.category,latitude:d.latitude,longitude:d.longitude,
  source_name:"Lakbay starter sources",source_url:d.sourceUrl,
  source_license:null,review_status:"approved",reviewed_at:new Date().toISOString(),
  description:null,
  ...(photos[d.id]?.length?{
    cover_url:photos[d.id][0].photo_url,
    cover_source_url:photos[d.id][0].source_url,
    cover_creator:photos[d.id][0].photographer,
    cover_license:photos[d.id][0].license,
    cover_license_url:photos[d.id][0].license_url,
    photo_checked_at:new Date().toISOString(),
  }:{}),
}));
console.log(`Loading ${rows.length} existing Lakbay locations...`);
const count=await upsertBatches(db,"lakbay_destinations",rows);
console.log(`Saved ${count} existing Lakbay locations. New OSM candidates stay pending.`);

// Only photographs already used in Lakbay's existing curated collection are seeded as approved.
const {data:inserted,error:lookError}=await db.from("lakbay_destinations")
 .select("id,slug").in("slug",Object.keys(photos));
if(lookError)throw new Error(lookError.message);
for(const place of inserted||[]) {
 const curated=photos[place.slug]||[];
 const photoRows=curated.map(p=>({...p,destination_id:place.id,review_status:"approved"}));
 await upsertBatches(db,"lakbay_photos",photoRows,"destination_id,source_url");
}
console.log("Curated Wikimedia photos seeded with license metadata.");
