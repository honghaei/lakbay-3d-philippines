import type { Viewer, Entity } from "cesium";
import { TOURIST_SPOTS, type TouristSpot } from "@/lib/touristSpots";
import type { SearchPlace } from "@/lib/mapInteractions";

export type DestinationFilter = "All" | TouristSpot["category"];
export type PinStats = {
  total: number;
  visible: number;
  loading: boolean;
  error: boolean;
  previewVisible?: number;
};

type Bounds = { west: number; south: number; east: number; north: number };
type SelectedArea = {
  kind: "province" | "metro" | "city";
  name: string;
  bounds?: Bounds;
  contains?: (longitude: number, latitude: number) => boolean;
};

type DatabaseSpot = {
  id: string;
  slug: string;
  name: string;
  province: string;
  city: string | null;
  category: TouristSpot["category"];
  latitude: number;
  longitude: number;
};

const PIN_PREFIX = "lakbay-tourist-pin:";
const DB_PIN_PREFIX = "lakbay-approved-pin:";
const PREVIEW_PIN_PREFIX = "lakbay-unverified-preview-pin:";
const CATEGORIES = new Set<TouristSpot["category"]>([
  "Nature", "History", "Culture", "Adventure", "Beach", "Food",
]);

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseDatabaseSpot(value: unknown): DatabaseSpot | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.name !== "string" ||
      typeof p.province !== "string" || typeof p.category !== "string" ||
      !CATEGORIES.has(p.category as TouristSpot["category"])) return null;
  const latitude = Number(p.latitude);
  const longitude = Number(p.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < 4 || latitude > 22 || longitude < 115 || longitude > 130) return null;
  return {
    id: p.id,
    slug: typeof p.slug === "string" ? p.slug : "",
    name: p.name,
    province: p.province,
    city: typeof p.city === "string" ? p.city : null,
    category: p.category as TouristSpot["category"],
    latitude,
    longitude,
  };
}

function createPinIcon(fillColor = "#e63946"): string {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 82;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Pin drawing context unavailable");
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.moveTo(32, 77);
  ctx.bezierCurveTo(26, 63, 7, 43, 7, 29);
  ctx.bezierCurveTo(7, 11, 18, 5, 32, 5);
  ctx.bezierCurveTo(46, 5, 57, 11, 57, 29);
  ctx.bezierCurveTo(57, 43, 38, 63, 32, 77);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(32, 28, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  return canvas.toDataURL("image/png");
}

function urlFor(area: SelectedArea): string {
  const query = new URLSearchParams({ limit: "200" });
  const b = area.bounds;
  if (b && [b.south, b.west, b.north, b.east].every(Number.isFinite)) {
    const south = Math.max(4, b.south);
    const north = Math.min(22, b.north);
    const west = Math.max(115, b.west);
    const east = Math.min(130, b.east);
    if (south <= north && west <= east) {
      query.set("south", String(south));
      query.set("west", String(west));
      query.set("north", String(north));
      query.set("east", String(east));
      return `/api/lakbay/places?${query.toString()}`;
    }
  }
  query.set("province", area.kind === "metro" || area.kind === "city" ? "Metro Manila" : area.name);
  return `/api/lakbay/places?${query.toString()}`;
}

/**
 * Draw demo pins plus APPROVED database pins in the chosen geographic area.
 * Reads only /api/lakbay/places, whose server query enforces review_status=approved.
 * Does not read or display lakbay_photos (pending photos remain private).
 */
export function setupTouristPins(
  viewer: Viewer,
  Cesium: typeof import("cesium"),
  onStats?: (stats: PinStats) => void,
) {
  const icon = createPinIcon();
  const previewIcon = createPinIcon("#f59e0b");
  // Preview is opt-in, local-only and cannot publish pending destinations.
  const previewMode = process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    new URLSearchParams(window.location.search).get("preview") === "1";
  const byId = new Map(TOURIST_SPOTS.map((spot) => [spot.id, spot]));
  const remoteById = new Map<string, SearchPlace>();
  const cache = new Map<string, { approved: DatabaseSpot[]; preview: DatabaseSpot[] }>();
  let pinEntities: Entity[] = [];
  let controller: AbortController | null = null;
  let requestVersion = 0;

  function clearEntities() {
    if (!viewer.isDestroyed()) {
      for (const entity of pinEntities) viewer.entities.remove(entity);
    }
    pinEntities = [];
    remoteById.clear();
  }

  function clear() {
    ++requestVersion;
    controller?.abort();
    controller = null;
    clearEntities();
    onStats?.({ total: 0, visible: 0, loading: false, error: false });
  }

  function localMatches(area: SelectedArea): TouristSpot[] {
    return TOURIST_SPOTS.filter((spot) => {
      if (area.kind === "metro") return spot.province === "Metro Manila";
      if (area.kind === "city") return spot.city === area.name;
      return spot.province === area.name;
    });
  }

  function remoteMatches(area: SelectedArea, places: DatabaseSpot[]): DatabaseSpot[] {
    return places.filter((p) => {
      if (area.contains) return area.contains(p.longitude, p.latitude);
      if (area.kind === "metro") return normalize(p.province) === "metro manila";
      if (area.kind === "city") return normalize(p.city || "") === normalize(area.name);
      return normalize(p.province) === normalize(area.name);
    });
  }

  function isSamePlace(a: TouristSpot | DatabaseSpot, b: TouristSpot | DatabaseSpot): boolean {
    return normalize(a.name) === normalize(b.name) &&
      normalize(a.province) === normalize(b.province) &&
      Math.abs(a.latitude - b.latitude) < 0.025 &&
      Math.abs(a.longitude - b.longitude) < 0.025;
  }

  function addPin(id: string, name: string, longitude: number, latitude: number, pinIcon = icon) {
    pinEntities.push(viewer.entities.add({
      id,
      name,
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
      billboard: {
        image: pinIcon,
        width: 33,
        height: 43,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1000, 1.1, 1500000, 0.8),
      },
    }));
  }

  function render(
    area: SelectedArea,
    category: DestinationFilter,
    remote: DatabaseSpot[],
    preview: DatabaseSpot[] = [],
    loading = false,
    error = false
  ) {
    if (viewer.isDestroyed()) return;
    clearEntities();
    const locals = localMatches(area).filter(p => p.category !== "Food");
    const approved: DatabaseSpot[] = [];
    for (const place of remoteMatches(area, remote)) {
      if (place.category === "Food" || locals.some(p => isSamePlace(p, place)) ||
          approved.some(p => isSamePlace(p, place))) continue;
      approved.push(place);
    }

    const unverified: DatabaseSpot[] = [];
    // Never exceed the three-marker target in preview mode; it is not a quota for approval.
    const slots = Math.max(0, 3 - locals.length - approved.length);
    if (previewMode && slots) {
      for (const place of remoteMatches(area, preview)) {
        if (place.category === "Food" ||
            locals.some(p => isSamePlace(p, place)) ||
            approved.some(p => isSamePlace(p, place)) ||
            unverified.some(p => isSamePlace(p, place))) continue;
        unverified.push(place);
        if (unverified.length >= slots) break;
      }
    }

    const visibleLocals = locals.filter(p => category === "All" || p.category === category);
    const visibleApproved = approved.filter(p => category === "All" || p.category === category);
    const visiblePreview = unverified.filter(p => category === "All" || p.category === category);

    for (const spot of visibleLocals) {
      addPin(`${PIN_PREFIX}${spot.id}`, spot.name, spot.longitude, spot.latitude);
    }
    for (const place of visibleApproved) {
      addPin(`${DB_PIN_PREFIX}${place.id}`, place.name, place.longitude, place.latitude);
      remoteById.set(place.id, {
        type: "destination",
        id: place.id,
        name: place.name,
        category: place.category,
        subtitle: [place.city, place.province].filter(Boolean).join(", "),
        longitude: place.longitude,
        latitude: place.latitude,
      });
    }
    for (const place of visiblePreview) {
      addPin(`${PREVIEW_PIN_PREFIX}${place.id}`, place.name, place.longitude, place.latitude, previewIcon);
      remoteById.set(place.id, {
        type: "destination",
        id: place.id,
        name: place.name,
        category: place.category,
        subtitle: [place.city, place.province].filter(Boolean).join(", "),
        longitude: place.longitude,
        latitude: place.latitude,
        unverified: true,
      });
    }
    onStats?.({
      total: locals.length + approved.length + unverified.length,
      visible: visibleLocals.length + visibleApproved.length + visiblePreview.length,
      previewVisible: visiblePreview.length,
      loading,
      error,
    });
    if (!loading) console.log(
      `Lakbay: ${visibleLocals.length} demo, ${visibleApproved.length} approved, ` +
      `${visiblePreview.length} UNVERIFIED preview pins in ${area.name}.`
    );
  }

  function previewUrl(area: SelectedArea): string {
    const province = area.kind === "metro" || area.kind === "city" ? "Metro Manila" : area.name;
    const params = new URLSearchParams({ province });
    if (area.kind === "city") params.set("city", area.name);
    return `/api/lakbay/preview-places?${params.toString()}`;
  }

  async function fetchPlaces(url: string, signal: AbortSignal): Promise<DatabaseSpot[]> {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const body: unknown = await response.json();
    const raw = body && typeof body === "object" && "places" in body
      ? (body as { places?: unknown }).places : undefined;
    if (!Array.isArray(raw)) throw new Error(`Invalid places response from ${url}`);
    return raw.map(parseDatabaseSpot).filter((p): p is DatabaseSpot => p !== null);
  }

  function showFor(area: SelectedArea, category: DestinationFilter = "All") {
    clear();
    if (viewer.isDestroyed()) return;
    const version = requestVersion;
    const key = `${area.kind}:${area.name}:${area.bounds ? JSON.stringify(area.bounds) : ""}`;
    const cached = cache.get(key);
    if (cached) {
      render(area, category, cached.approved, cached.preview);
      return;
    }
    render(area, category, [], [], true);
    controller = new AbortController();
    const signal = controller.signal;
    void (async () => {
      try {
        const [approvedResult, previewResult] = await Promise.allSettled([
          fetchPlaces(urlFor(area), signal),
          previewMode ? fetchPlaces(previewUrl(area), signal) : Promise.resolve([] as DatabaseSpot[]),
        ]);
        if (requestVersion !== version || signal.aborted || viewer.isDestroyed()) return;
        const approved = approvedResult.status === "fulfilled" ? approvedResult.value : [];
        const preview = previewResult.status === "fulfilled" ? previewResult.value : [];
        const hadError = approvedResult.status === "rejected" || previewResult.status === "rejected";
        if (approvedResult.status === "rejected") console.warn("Lakbay approved pins unavailable:", approvedResult.reason);
        if (previewResult.status === "rejected") console.warn("Lakbay review-preview unavailable:", previewResult.reason);
        if (!hadError) cache.set(key, { approved, preview });
        render(area, category, approved, preview, false, hadError);
      } catch (err) {
        if (requestVersion !== version || signal.aborted || viewer.isDestroyed()) return;
        console.warn("Lakbay pin load failed:", err);
        render(area, category, [], [], false, true);
      } finally {
        if (requestVersion === version) controller = null;
      }
    })();
  }

  function pickId(picked: unknown, prefix: string): string | null {
    if (!picked || typeof picked !== "object" || !("id" in picked)) return null;
    const entity = (picked as { id?: unknown }).id;
    if (!entity || typeof entity !== "object" || !("id" in entity)) return null;
    const id = (entity as { id?: unknown }).id;
    return typeof id === "string" && id.startsWith(prefix) ? id.slice(prefix.length) : null;
  }

  function spotFromPick(picked: unknown): TouristSpot | null {
    const id = pickId(picked, PIN_PREFIX);
    return id ? byId.get(id) ?? null : null;
  }

  function placeFromPick(picked: unknown): SearchPlace | null {
    const approvedId = pickId(picked, DB_PIN_PREFIX);
    const previewId = pickId(picked, PREVIEW_PIN_PREFIX);
    const id = approvedId ?? previewId;
    return id ? remoteById.get(id) ?? null : null;
  }

  return { showFor, clear, spotFromPick, placeFromPick, dispose: clear };
}
