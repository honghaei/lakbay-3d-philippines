import { NextRequest, NextResponse } from "next/server";
import { lakbayPublicDb } from "@/lib/lakbayDb";

type AreaRow = {
  source_key: string; name: string; kind: string; province: string | null;
  latitude: number; longitude: number;
};
type PlaceRow = {
  id: string; slug: string; name: string; province: string; city: string | null;
  category: string; latitude: number; longitude: number; cover_url: string | null;
};

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) {
    return NextResponse.json({ query: q, results: [], note: "Enter 2–100 characters" });
  }
  try {
    const db = lakbayPublicDb();
    const [places, areas] = await Promise.all([
      db.rpc("lakbay_search_places", { q, result_limit: 15 }),
      db.rpc("lakbay_search_areas", { q, result_limit: 12 }),
    ]);
    if (places.error) throw places.error;
    if (areas.error) throw areas.error;
    const results = [
      ...((places.data ?? []) as PlaceRow[]).map(p => ({
        type: "destination" as const,
        id: p.id,
        slug: p.slug,
        name: p.name,
        subtitle: [p.city, p.province].filter(Boolean).join(", "),
        category: p.category,
        longitude: p.longitude,
        latitude: p.latitude,
        coverUrl: p.cover_url,
        url: `/destinations/${p.slug}`,
      })),
      ...((areas.data ?? []) as AreaRow[]).map(a => ({
        type: "area" as const,
        id: a.source_key,
        name: a.name,
        subtitle: [a.kind, a.province !== a.name ? a.province : ""].filter(Boolean).join(" · "),
        category: a.kind,
        longitude: a.longitude,
        latitude: a.latitude,
        url: null,
      })),
    ];
    return NextResponse.json({query:q,results,credits:"Destination map data © OpenStreetMap contributors (ODbL 1.0) and individual sources"});
  } catch (error) {
    console.error("Lakbay search error:",error);
    return NextResponse.json({error:"Search temporarily unavailable"},{status:503});
  }
}
