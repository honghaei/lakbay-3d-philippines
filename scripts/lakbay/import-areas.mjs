import {argValue, geoRecord, getAdmin, normalize, provinceFeatures, namedProvince, readGeo,
  PH_LOCALITIES, NCR_CITIES, PH_PROVINCES, upsertBatches} from "./_core.mjs";

const db = getAdmin();
const provinceShapes = provinceFeatures();
const all = [];
const provinces = new Set();

for (const f of provinceShapes) {
  const name = f.properties?.shapeName;
  if(!name || provinces.has(normalize(name))) continue;
  provinces.add(normalize(name));
  all.push({source_key:`gb:adm2:${f.properties?.shapeID || normalize(name)}`,
    name,kind:"province",province:name,classification_verified:false,
    data_source:"geoBoundaries gbOpen ADM2",...geoRecord(f)});
}
all.push({source_key:"manual:ncr",name:"Metro Manila",kind:"metro",province:"Metro Manila",
  classification_verified:true,data_source:"Lakbay NCR directory",latitude:14.59,longitude:121.03,
  south:14.3,north:14.9,west:120.85,east:121.25});

const seen = new Set(all.map(a=>a.source_key));
const metroCities = readGeo(NCR_CITIES);
for (const f of metroCities) {
  const name = f.properties?.lakbayName;
  if(!name) continue;
  const source_key = `ncr:${normalize(name)}`;
  if(seen.has(source_key)) continue;
  seen.add(source_key);
  all.push({source_key,name,kind:name==="Pateros"?"municipality":"city",
    province:"Metro Manila",classification_verified:true,
    data_source:"Lakbay NCR ADM2/ADM3 extraction",...geoRecord(f)});
}

const localities = readGeo(PH_LOCALITIES);
for(const f of localities) {
  const name = f.properties?.shapeName;
  if (!name || name.length>130) continue;
  const point = geoRecord(f);
  const province = namedProvince([point.longitude,point.latitude],provinceShapes);
  // NCR localities are supplied from metro-manila.geojson, avoiding barangay-level Manila matches.
  if(!province || (point.latitude >14.3 && point.latitude<14.9 &&
    point.longitude>120.85 && point.longitude<121.25 &&
    metroCities.some(c => {
      const b=geoRecord(c);
      return point.longitude>=b.west && point.longitude<=b.east && point.latitude>=b.south && point.latitude<=b.north;
    }))) continue;
  const source_key = `gb:adm3:${f.properties?.shapeID || `${normalize(province)}:${normalize(name)}`}`;
  if(seen.has(source_key)) continue;
  seen.add(source_key);
  // The older ADM3 dataset does not consistently distinguish municipalities from cities.
  all.push({source_key,name,kind:/\bcity\b/i.test(name)?"city":"locality",
    province,classification_verified:false,data_source:"geoBoundaries gbOpen ADM3",...point});
}
console.log(`Prepared ${all.length} geographic areas, incl ${provinces.size} provincial records, 17 NCR LGUs.`);
const written = await upsertBatches(db,"lakbay_areas",all);
console.log(`Saved ${written} areas to Supabase. Verify names and updated PSGC classifications before publication.`);
