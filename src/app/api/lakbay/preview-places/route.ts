import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Local-only review overlay for UNVERIFIED pending OSM candidates.
 * Disabled on all production builds. Never approves or writes to Supabase.
 * Start the dev server bound to 127.0.0.1, not a public interface.
 */

const ALLOWED_CATEGORIES = new Set(["Nature", "Adventure", "Beach", "History", "Culture"]);
type Candidate = {
  id: string;
  name: string;
  province: string;
  city: string | null;
  category: string;
  latitude: number;
  longitude: number;
  source_tags: Record<string, unknown> | null;
};
function norm(v: unknown): string {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function scoreCandidate(p: Candidate): number {
  const name = norm(p.name);
  const t = p.source_tags || {};
  const tag = (key: string) => norm(t[key]);
  if (!ALLOWED_CATEGORIES.has(p.category) || name.length < 5 ||
      !Number.isFinite(Number(p.latitude)) || !Number.isFinite(Number(p.longitude)) ||
      /\b(office|waiting shade|mining|quarry|factory|parking|school|hospital|dormitory|warehouse|led|fountain|unpassable|private|residential|checkpoint|guardhouse|terminal|marketplace)\b/.test(name)) return 0;
  if (["private", "no", "permit", "customers", "restricted"].includes(tag("access")) ||
      ["yes", "gate", "fence"].includes(tag("barrier"))) return 0;
  // These are only heuristic queues for human review, never a verification claim.
  if (tag("waterway") === "waterfall") return 100;
  if (tag("natural") === "beach") return 97;
  if (["cave_entrance", "hot_spring"].includes(tag("natural"))) return 95;
  if (tag("natural") === "peak") return 90;
  if (["fort", "castle", "ruins", "archaeological_site"].includes(tag("historic"))) return 89;
  if (tag("tourism") === "museum") return 88;
  if (tag("tourism") === "viewpoint") return 80;
  if (["attraction", "yes"].includes(tag("tourism")) &&
      /\b(falls?|waterfalls?|beach|cave|peak|mount|mountain|fort|ruins|heritage|spring|lake|island)\b/.test(name)) return 75;
  return 0;
}

export async function GET(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  if (process.env.NODE_ENV !== "development" ||
      process.env.LAKBAY_LOCAL_PREVIEW !== "1" ||
      !["localhost", "127.0.0.1"].includes(hostname)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const province = (request.nextUrl.searchParams.get("province") ?? "").trim();
  const city = (request.nextUrl.searchParams.get("city") ?? "").trim();
  if (!province || province.length > 100 || city.length > 100) {
    return NextResponse.json({ error: "Invalid province or city" }, { status: 400 });
  }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new Error("Missing server-only Supabase configuration");
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let query = admin.from("lakbay_destinations")
      .select("id,name,province,city,category,latitude,longitude,source_tags")
      .eq("review_status", "pending")
      .eq("province", province)
      .neq("category", "Food")
      .order("created_at", { ascending: true })
      .limit(1000);
    if (city) query = query.eq("city", city);
    const { data, error } = await query;
    if (error) throw error;
    const ranked = ((data || []) as Candidate[])
      .map(p => ({ ...p, score: scoreCandidate(p) }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const names = new Set<string>();
    const places = [];
    for (const p of ranked) {
      const key = norm(p.name).replace(/[^a-z0-9]+/g, " ").trim();
      if (names.has(key)) continue;
      names.add(key);
      // Metadata only. Do not publish source URLs or pending photos in preview.
      places.push({ id: p.id, name: p.name, province: p.province, city: p.city,
        category: p.category, latitude: p.latitude, longitude: p.longitude });
      if (places.length >= 3) break;
    }
    return NextResponse.json({
      places,
      notice: "UNVERIFIED REVIEW CANDIDATES — NOT PUBLISHED",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Lakbay local preview read failed:", error);
    return NextResponse.json({ error: "Preview unavailable" }, { status: 503 });
  }
}
