/** Find open-licensed Wikimedia Commons PHOTO CANDIDATES; never auto-approve an image. */
import {argValue,getAdmin,fetchJson,sleep,safeUrl} from "./_core.mjs";
const db=getAdmin();
const limit=Math.max(1,Math.min(500,Number(argValue("limit","25"))||25));
const commons="https://commons.wikimedia.org/w/api.php";
const api=(params)=>`${commons}?${new URLSearchParams({action:"query",format:"json",...params})}`;
const plain=(s)=>String(s??"").replace(/<[^>]*>/g," ")
  .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim().slice(0,250);
function openLicense(meta) {
  const l=plain(meta.LicenseShortName?.value || meta.License?.value || "");
  if (/non.?commercial|no.?derivatives|\bNC\b|\bND\b/i.test(l)) return null;
  return /^(CC0|CC BY(?:-SA)?(?:\b|\s)|Public domain|PD-)/i.test(l) ? l : null;
}
async function commonsFile(filename) {
  if(!filename || filename.length>240) return null;
  const title=filename.startsWith("File:")?filename:`File:${filename}`;
  const result=await fetchJson(api({titles:title,prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"1100"}));
  const page=Object.values(result.query?.pages||{})[0];
  const info=page?.imageinfo?.[0];
  const meta=info?.extmetadata||{};
  const license=openLicense(meta);
  const photo_url=info?.thumburl||info?.url;
  if(!license || !/^image\/(?:jpeg|png|webp)$/.test(info?.mime||"") ||
      !safeUrl(photo_url,["wikimedia.org"]) || !safeUrl(info?.descriptionurl,["commons.wikimedia.org"])) return null;
  return {photo_url,source_url:info.descriptionurl,
    caption:plain(page.title.replace(/^File:/,"")),
    photographer:plain(meta.Artist?.value||meta.Credit?.value||"Wikimedia Commons contributor"),
    license,license_url:meta.LicenseUrl?.value||null,review_status:"pending"};
}
async function wikidataFile(qid) {
  if(!/^Q\d+$/.test(qid||""))return null;
  const url=`https://www.wikidata.org/w/api.php?${new URLSearchParams({
    action:"wbgetentities",ids:qid,props:"claims",format:"json"})}`;
  const result=await fetchJson(url);
  return result.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value||null;
}
async function commonsSearch(query) {
  const result=await fetchJson(api({generator:"search",gsrsearch:query,gsrnamespace:"6",gsrlimit:"5",
    prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"1100"}));
  const pages=Object.values(result.query?.pages||{});
  const candidates=[];
  for(const p of pages) {
    const info=p.imageinfo?.[0],meta=info?.extmetadata||{};
    const license=openLicense(meta);
    if (!license || !/^image\/(?:jpeg|png|webp)$/.test(info.mime||"") ||
      !safeUrl(info?.thumburl||info?.url,["wikimedia.org"]) ||
      !safeUrl(info?.descriptionurl,["commons.wikimedia.org"])) continue;
    candidates.push({photo_url:info.thumburl||info.url,source_url:info.descriptionurl,
      caption:plain(p.title.replace(/^File:/,"")),
      photographer:plain(meta.Artist?.value||meta.Credit?.value||"Wikimedia Commons contributor"),
      license,license_url:meta.LicenseUrl?.value||null,review_status:"pending"});
  }
  return candidates.slice(0,3);
}
const {data:destinations,error}=await db.from("lakbay_destinations")
  .select("id,name,province,wikidata_id,source_tags")
  .is("photo_checked_at",null).order("created_at",{ascending:true}).limit(limit);
if(error)throw new Error(error.message);
for(let i=0;i<(destinations?.length||0);i++) {
  const place=destinations[i];
  try {
    const files=[];
    const commonsTag=place.source_tags?.wikimedia_commons;
    if(typeof commonsTag==="string" && commonsTag.startsWith("File:"))files.push(commonsTag);
    const qid=place.wikidata_id||place.source_tags?.wikidata;
    if(qid){const filename=await wikidataFile(qid);if(filename)files.push(filename);}
    const candidates=[];
    for(const file of [...new Set(files)]) {
      const p=await commonsFile(file);if(p)candidates.push(p);
    }
    if(!candidates.length) {
      // Name-based images are NOT assumed correct; send to moderation.
      candidates.push(...await commonsSearch(`"${place.name}" ${place.province}`));
    }
    for(const photo of candidates.slice(0,3)) {
      const {error:uploadError}=await db.from("lakbay_photos")
        .upsert({...photo,destination_id:place.id},{onConflict:"destination_id,source_url",ignoreDuplicates:true});
      if(uploadError) throw new Error(uploadError.message);
    }
    console.log(`${i+1}/${destinations.length} ${place.name}: ${candidates.length} photos awaiting review`);
  } catch(err){console.warn(`${place.name}: ${err.message}`);}
  // Mark checked even if no photo was found, to avoid an infinite repeat loop.
  const {error:stampError}=await db.from("lakbay_destinations")
    .update({photo_checked_at:new Date().toISOString()}).eq("id",place.id);
  if(stampError)console.warn(stampError.message);
  await sleep(1300);
}
console.log("Done. Review each Commons image's subject AND rights before approving. No photo was auto-published.");
