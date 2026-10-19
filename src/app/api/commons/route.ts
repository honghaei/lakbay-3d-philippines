import { NextRequest, NextResponse } from "next/server";
import { CURATED_PHOTOS, type DestinationPhoto } from "@/lib/curatedPhotos";
import { TOURIST_SPOTS } from "@/lib/touristSpots";
import { getDestinationDetails } from "@/lib/destinationDetails";

// Do not export `runtime` or `dynamicParams`: Lakbay uses Next.js 16 Cache Components.

type CommonsImageInfo = {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  mime?: string;
  extmetadata?: Record<string, { value?: string }>;
};

type CommonsResponse = {
  query?: {
    pages?: Array<{
      title?: string;
      imageinfo?: CommonsImageInfo[];
    }>;
  };
};

function plain(value: string | undefined) {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function acceptedLicense(license: string) {
  return /^(CC BY(?:-SA)?(?:\s|$)|CC0(?:\s|$)|PD(?:-|\s|$)|Public domain)/i.test(license);
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const spot = TOURIST_SPOTS.find((item) => item.id === id);

  if (!spot) {
    return NextResponse.json({ error: "Unknown destination" }, { status: 404 });
  }

  const query = getDestinationDetails(spot).photoSearch;
  const searchUrl =
    `https://commons.wikimedia.org/wiki/Special:MediaSearch?type=image&search=${encodeURIComponent(query)}`;

  // Verified photos take priority. No fragile API request needed for these destinations.
  const curated = CURATED_PHOTOS[id];
  if (curated?.length) {
    return NextResponse.json({ photos: curated, searchUrl, status: "curated" });
  }

  const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "24",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "960",
  }).forEach(([key, value]) => endpoint.searchParams.set(key, value));

  try {
    const response = await fetch(endpoint.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Commons API returned ${response.status}`);

    const json = (await response.json()) as CommonsResponse;
    const photos: DestinationPhoto[] = (json.query?.pages ?? [])
      .map((page): DestinationPhoto | null => {
        const image = page.imageinfo?.[0];
        const license = plain(image?.extmetadata?.LicenseShortName?.value);
        const url = image?.thumburl ?? image?.url ?? "";
        const source = image?.descriptionurl ?? "";
        if (
          !image || !["image/jpeg", "image/png", "image/webp"].includes(image.mime ?? "") ||
          !acceptedLicense(license) ||
          !/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(url) ||
          !source.startsWith("https://commons.wikimedia.org/")
        ) return null;

        return {
          url,
          source,
          name: plain((page.title ?? "").replace(/^File:/, "").replace(/\.[^.]+$/, "")) || spot.name,
          photographer: plain(image.extmetadata?.Artist?.value) || "Wikimedia Commons contributor",
          license,
          licenseUrl: plain(image.extmetadata?.LicenseUrl?.value) || undefined,
        };
      })
      .filter((entry): entry is DestinationPhoto => entry !== null)
      .slice(0, 6);

    return NextResponse.json({ photos, searchUrl, status: photos.length ? "commons-search" : "no-results" });
  } catch (error) {
    console.warn(`Lakbay photo lookup failed for ${id}:`, error);
    return NextResponse.json({ photos: [], searchUrl, status: "unavailable" });
  }
}
