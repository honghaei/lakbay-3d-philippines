import { NextRequest, NextResponse } from "next/server";
import { lakbayPublicDb } from "@/lib/lakbayDb";

/** Get approved destinations by province or map viewport. Never return every pin nationwide. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const province = (params.get("province") ?? "").trim();
  const n = Number(params.get("limit") || 120);
  const limit = Number.isFinite(n) ? Math.max(1, Math.min(200, Math.floor(n))) : 120;
  const keys = ["south","west","north","east"] as const;
  const bbox = keys.map(k=>params.get(k));
  const hasBBox = bbox.every(value=>value!==null);
  if (!province && !hasBBox) return NextResponse.json({error:"Supply province or south,west,north,east"},{status:400});
  if (province.length > 100) return NextResponse.json({error:"Invalid province"},{status:400});
  const values = bbox.map(Number);
  if (hasBBox && (values.some(v=>!Number.isFinite(v)) || values[0]>values[2] || values[1]>values[3] ||
    values[0]<4 || values[2]>22 || values[1]<115 || values[3]>130)) {
    return NextResponse.json({error:"Invalid Philippine bounding box"},{status:400});
  }
  try {
    const db=lakbayPublicDb();
    let query=db.from("lakbay_destinations").select("id,slug,name,province,city,category,description,longitude,latitude,cover_url,cover_creator,cover_license,cover_source_url,source_name,source_url,source_license")
      .eq("review_status","approved").order("name").limit(limit);
    if (province) query=query.ilike("province",province);
    if (hasBBox) query=query.gte("latitude",values[0]).lte("latitude",values[2])
      .gte("longitude",values[1]).lte("longitude",values[3]);
    const {data,error}=await query;
    if(error)throw error;
    return NextResponse.json({count:data?.length||0,places:data||[],credit:"© OpenStreetMap contributors (ODbL 1.0) and individual destination sources"});
  } catch(error){console.error("Lakbay places query failed",error);
    return NextResponse.json({error:"Places unavailable"},{status:503});}
}
