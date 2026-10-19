import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const DATA_DIR = path.resolve(process.cwd(), "public/data");
export const PH_PROVINCES = path.join(DATA_DIR, "philippines-provinces.geojson");
export const NCR_CITIES = path.join(DATA_DIR, "metro-manila.geojson");
export const PH_LOCALITIES = path.resolve(process.cwd(), "scripts/philippines-adm3-source.geojson");

export const argValue = (name, fallback = "") => {
  const raw = process.argv.find(x => x.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};
export const hasFlag = name => process.argv.includes(`--${name}`);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const normalize = str => String(str || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const slug = str => normalize(str).replace(/\s+/g, "-").slice(0, 85);
export function readGeo(filename) {
  if (!fs.existsSync(filename)) throw new Error(`Missing: ${filename}`);
  const file = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (file.type !== "FeatureCollection" || !Array.isArray(file.features)) {
    throw new Error(`Invalid GeoJSON: ${filename}`);
  }
  return file.features.filter(feature => feature.geometry);
}
export function bounds(geometry) {
  const value = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
  function go(coords) {
    if (typeof coords?.[0] === "number") {
      const [lon, lat] = coords;
      value.west = Math.min(value.west, lon);
      value.east = Math.max(value.east, lon);
      value.south = Math.min(value.south, lat);
      value.north = Math.max(value.north, lat);
    } else if (Array.isArray(coords)) coords.forEach(go);
  }
  go(geometry.coordinates);
  return value;
}
export function insideRing([x,y], ring) {
  let inside = false;
  for (let i=0,j=ring.length-1; i<ring.length; j=i++) {
    const [xi,yi] = ring[i], [xj,yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj-xi)*(y-yi))/(yj-yi)+xi) inside = !inside;
  }
  return inside;
}
export function insideGeometry(point, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates]
    : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.some(poly => insideRing(point, poly[0]) &&
    !poly.slice(1).some(ring => insideRing(point, ring)));
}
export function representativePoint(geometry) {
  const b = bounds(geometry);
  const center = [(b.west+b.east)/2,(b.south+b.north)/2];
  if (insideGeometry(center, geometry)) return center;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  // Centroid might be outside complex coastlines. Pick a ring vertex known to be part of polygon.
  for (const poly of polys) {
    const ring = poly[0];
    if (ring.length >= 3) {
      const p = [(ring[0][0]+ring[1][0]+ring[2][0])/3,
        (ring[0][1]+ring[1][1]+ring[2][1])/3];
      if (insideGeometry(p,geometry)) return p;
    }
  }
  return center;
}
export function geoRecord(feature) {
  const b = bounds(feature.geometry);
  const [longitude,latitude] = representativePoint(feature.geometry);
  return {latitude,longitude,...b};
}
export function provinceFeatures() {
  return readGeo(PH_PROVINCES).filter(f => {
    const name = f.properties?.shapeName || "";
    const b = bounds(f.geometry);
    return !/district/i.test(name) && b.west < 130 && b.east > 115;
  });
}
export function namedProvince(point, features) {
  return features.find(f => {
    const b = bounds(f.geometry);
    if (point[0]<b.west||point[0]>b.east||point[1]<b.south||point[1]>b.north) return false;
    return insideGeometry(point,f.geometry);
  })?.properties?.shapeName || null;
}
export function inPhilippines([lon,lat]) {
  return lon >= 116 && lon <= 127.0 && lat >= 4.2 && lat <= 21.3;
}
export function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local (SERVER ONLY)");
  return createClient(url, secret, {auth: {autoRefreshToken:false,persistSession:false}});
}
export async function upsertBatches(db, table, rows, conflict = "source_key", chunkSize=100) {
  let count = 0;
  for (let offset=0; offset<rows.length; offset+=chunkSize) {
    const batch = rows.slice(offset,offset+chunkSize);
    const {error} = await db.from(table).upsert(batch,{onConflict:conflict,ignoreDuplicates:false});
    if (error) throw new Error(`${table}: ${error.message}`);
    count += batch.length;
  }
  return count;
}
export async function fetchJson(url, options={}) {
  for(let attempt=0;attempt<4;attempt++) {
    const response = await fetch(url,{
      ...options,
      signal:AbortSignal.timeout(90000),
      headers:{Accept:"application/json",...options.headers},
    });
    if (response.ok) return await response.json();
    if (![429,500,502,503,504].includes(response.status)) {
      throw new Error(`HTTP ${response.status} from ${url}: ${(await response.text()).slice(0,120)}`);
    }
    const wait = Number(response.headers.get("retry-after")) || (attempt+1)*20;
    console.warn(`HTTP ${response.status}; waiting ${wait}s before retry...`);
    await sleep(wait*1000);
  }
  throw new Error(`Exhausted retries: ${url}`);
}
export function safeUrl(url, hosts) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && hosts.some(host=>parsed.hostname===host || parsed.hostname.endsWith(`.${host}`));
  } catch{return false;}
}
