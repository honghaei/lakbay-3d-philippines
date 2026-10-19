import type { Viewer, Entity } from "cesium";
import { setupProvinceFocus } from "@/lib/provinceFocus";
import { setupTouristPins } from "@/lib/touristPins";
import type { DestinationFilter, PinStats } from "@/lib/touristPins";
import type { TouristSpot } from "@/lib/touristSpots";

type Point = [number, number];
type Ring = Point[];
type Polygon = Ring[];
type Geometry =
  | { type: "Polygon"; coordinates: Polygon }
  | { type: "MultiPolygon"; coordinates: Polygon[] };

type Feature = {
  properties?: { shapeName?: string; lakbayName?: string };
  geometry: Geometry | null;
};
type Collection = { type: "FeatureCollection"; features: Feature[] };
type Bounds = { west: number; south: number; east: number; north: number };
type Area = {
  id: string;
  name: string;
  kind: "province" | "city" | "metro";
  polygons: Polygon[];
  bounds: Bounds;
};

export type SearchableArea = {
  id: string;
  name: string;
  kind: "province" | "city" | "metro";
};

export type SearchPlace = {
  type: "destination" | "area";
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  subtitle?: string;
  category?: string;
  slug?: string;
  url?: string;
  unverified?: boolean;
};

export type MapInteractionController = {
  dispose: () => void;
  areas: SearchableArea[];
  selectById: (id: string) => void;
  selectPlace: (place: SearchPlace) => void;
  clearSelection: () => void;
  setCategoryFilter: (category: DestinationFilter) => void;
};

type CameraNavigation = {
  setFlightActive: (active: boolean) => void;
};

const NCR_LIMITS = { west: 120.85, east: 121.25, south: 14.3, north: 14.9 };

function getPolygons(geometry: Geometry): Polygon[] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}

function getBounds(polygons: Polygon[]): Bounds {
  const bounds: Bounds = {
    west: Infinity, south: Infinity, east: -Infinity, north: -Infinity,
  };
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        bounds.west = Math.min(bounds.west, lon);
        bounds.east = Math.max(bounds.east, lon);
        bounds.south = Math.min(bounds.south, lat);
        bounds.north = Math.max(bounds.north, lat);
      }
    }
  }
  return bounds;
}

function isInsideBounds(lon: number, lat: number, b: Bounds): boolean {
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}

function isOldNcrDistrict(feature: Feature): boolean {
  const name = feature.properties?.shapeName ?? "";
  if (!/district|\bNCR\b|metro(?:politan)? manila/i.test(name)) return false;
  if (!feature.geometry) return false;
  const b = getBounds(getPolygons(feature.geometry));
  return isInsideBounds(
    (b.west + b.east) / 2,
    (b.south + b.north) / 2,
    NCR_LIMITS
  );
}

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) inside = !inside;
  }
  return inside;
}

function contains(area: Area, lon: number, lat: number): boolean {
  if (!isInsideBounds(lon, lat, area.bounds)) return false;
  return area.polygons.some((polygon) => {
    const outer = polygon[0];
    if (!outer || !pointInRing(lon, lat, outer)) return false;
    return !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
  });
}

async function fetchAreas(url: string, kind: "province" | "city") {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}: HTTP ${response.status}`);
  const data = (await response.json()) as Collection;
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error(`Invalid geographic data: ${url}`);
  }

  const areas: Area[] = [];
  for (const feature of data.features) {
    if (!feature.geometry) continue;
    if (kind === "province" && isOldNcrDistrict(feature)) continue;
    const name = kind === "city"
      ? feature.properties?.lakbayName
      : feature.properties?.shapeName;
    if (!name) continue;
    const polygons = getPolygons(feature.geometry);
    areas.push({
      id: `${kind}:${name}`,
      name,
      kind,
      polygons,
      bounds: getBounds(polygons),
    });
  }
  return areas;
}

export async function setupMapInteractions(
  viewer: Viewer,
  Cesium: typeof import("cesium"),
  onHover: (name: string | null) => void,
  onSelect: (name: string | null) => void,
  onSpotSelect: (spot: TouristSpot) => void,
  navigation: CameraNavigation,
  onSearchPlaceSelect?: (place: SearchPlace) => void,
  onPinStats?: (stats: PinStats) => void
): Promise<MapInteractionController> {
  const [provinces, cities] = await Promise.all([
    fetchAreas("/data/philippines-provinces.geojson", "province"),
    fetchAreas("/data/metro-manila.geojson", "city"),
  ]);

  if (viewer.isDestroyed()) return {
    dispose: () => {}, areas: [], selectById: () => {}, selectPlace: () => {}, clearSelection: () => {},
    setCategoryFilter: () => {},
  };

  const ncrPolygons = cities.flatMap((city) => city.polygons);
  const metroManila: Area = {
    id: "metro:Metro Manila", name: "Metro Manila", kind: "metro",
    polygons: ncrPolygons, bounds: getBounds(ncrPolygons),
  };

  const selectable = [metroManila, ...provinces, ...cities];
  const areaById = new Map(selectable.map((area) => [area.id, area]));
  const searchAreas: SearchableArea[] = selectable.map(({ id, name, kind }) => ({
    id, name, kind,
  }));

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  const focus = setupProvinceFocus(viewer);
  const pins = setupTouristPins(viewer, Cesium, onPinStats);
  let hovered: Area | null = null;
  let selected: Area | null = null;
  let activeCategory: DestinationFilter = "All";
  let hoverLines: Entity[] = [];
  let selectedLines: Entity[] = [];
  let disposed = false;
  let searchPin: Entity | null = null;
  let activeSearchPlace: SearchPlace | null = null;

  function clearLines(lines: Entity[]) {
    if (viewer.isDestroyed()) return;
    for (const line of lines) viewer.entities.remove(line);
  }

  function outline(area: Area, width: number, zIndex: number): Entity[] {
    const lines: Entity[] = [];
    for (const polygon of area.polygons) {
      const outer = polygon[0];
      if (!outer || outer.length < 2) continue;
      lines.push(viewer.entities.add({
        name: `${area.name} yellow highlight`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(outer.flat()),
          clampToGround: true,
          width,
          material: Cesium.Color.YELLOW.withAlpha(0.98),
          zIndex,
        },
      }));
    }
    return lines;
  }

  function clearSearchPin() {
    if (searchPin && !viewer.isDestroyed()) viewer.entities.remove(searchPin);
    searchPin = null;
    activeSearchPlace = null;
  }

  // The geographic GeoJSON contains provinces plus the 17 NCR local areas.
  function areaForCoordinates(lon: number, lat: number): Area | null {
    return cities.find((area) => contains(area, lon, lat)) ??
      provinces.find((area) => contains(area, lon, lat)) ??
      (contains(metroManila, lon, lat) ? metroManila : null);
  }

  function findArea(lon: number, lat: number): Area | null {
    const zoomedToNcr = viewer.camera.positionCartographic.height < 350000;
    if (zoomedToNcr) {
      const city = cities.find((area) => contains(area, lon, lat));
      if (city) return city;
    } else if (contains(metroManila, lon, lat)) {
      return metroManila;
    }
    return provinces.find((area) => contains(area, lon, lat)) ?? null;
  }

  function areaAtScreen(position: { x: number; y: number }): Area | null {
    const point = new Cesium.Cartesian2(position.x, position.y);
    const ray = viewer.camera.getPickRay(point);
    const intersection = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
    const cartesian = intersection ??
      viewer.camera.pickEllipsoid(point, viewer.scene.globe.ellipsoid);
    if (!cartesian) return null;
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    return findArea(
      Cesium.Math.toDegrees(cartographic.longitude),
      Cesium.Math.toDegrees(cartographic.latitude)
    );
  }

  handler.setInputAction((event: { endPosition: { x: number; y: number } }) => {
    if (disposed) return;
    const next = areaAtScreen(event.endPosition);
    if (next?.id === hovered?.id) return;
    hovered = next;
    clearLines(hoverLines);
    // Don't draw another yellow outline over the already-selected province.
    hoverLines = next && next.id !== selected?.id ? outline(next, 2.7, 20) : [];
    viewer.scene.canvas.style.cursor = next ? "pointer" : "grab";
    onHover(next?.name ?? null);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  function selectArea(area: Area) {
    if (disposed || viewer.isDestroyed()) return;

    viewer.camera.cancelFlight();
    navigation.setFlightActive(true);
    focus.hide();
    pins.clear();
    clearSearchPin();

    clearLines(selectedLines);
    selected = area;
    selectedLines = outline(area, 3.7, 30);
    clearLines(hoverLines);
    hoverLines = [];
    hovered = null;
    onHover(null);
    onSelect(area.name);

    // Use the same proven Step 11 centered camera flight for clicks and search.
    const { west, south, east, north } = area.bounds;
    const corners = [
      [west, south], [west, north], [east, south], [east, north],
    ];
    const points = corners.map(([lon, lat]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat)
    );
    const sphere = Cesium.BoundingSphere.fromPoints(points);

    viewer.camera.flyToBoundingSphere(sphere, {
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-68),
        0
      ),
      duration: 1.25,
      complete: () => {
        if (disposed || viewer.isDestroyed()) return;
        navigation.setFlightActive(false);
        focus.show();
        pins.showFor({ ...area, contains: (lon, lat) => contains(area, lon, lat) }, activeCategory);
      },
      cancel: () => {
        if (disposed || viewer.isDestroyed()) return;
        navigation.setFlightActive(false);
        focus.hide();
      },
    });
  }

  function selectPlace(place: SearchPlace) {
    if (disposed || viewer.isDestroyed()) return;
    if (!Number.isFinite(place.longitude) || !Number.isFinite(place.latitude)) return;

    viewer.camera.cancelFlight();
    navigation.setFlightActive(true);
    focus.hide();
    pins.clear();
    clearSearchPin();
    clearLines(hoverLines);
    clearLines(selectedLines);
    hovered = null;
    hoverLines = [];
    selectedLines = [];
    onHover(null);

    const area = areaForCoordinates(place.longitude, place.latitude);
    selected = area;
    if (area) selectedLines = outline(area, 3.7, 30);
    onSelect(place.type === "area" ? place.name : area?.name ?? place.subtitle ?? place.name);

    if (place.type === "destination") {
      // Add a separately pickable red search pin, even for destinations that
      // have not yet been added to the original hardcoded tourist-pins list.
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 82;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.moveTo(32, 76);
        ctx.bezierCurveTo(25, 61, 7, 43, 7, 28);
        ctx.bezierCurveTo(7, 11, 19, 5, 32, 5);
        ctx.bezierCurveTo(46, 5, 57, 11, 57, 28);
        ctx.bezierCurveTo(57, 43, 39, 61, 32, 76);
        ctx.closePath();
        ctx.fillStyle = "#e63946";
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(32, 28, 9, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      searchPin = viewer.entities.add({
        id: `lakbay-database-search:${place.id}`,
        name: place.name,
        position: Cesium.Cartesian3.fromDegrees(place.longitude, place.latitude),
        billboard: {
          image: canvas.toDataURL("image/png"), width: 38, height: 49,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      activeSearchPlace = place;
      onSearchPlaceSelect?.(place);
    }

    const isProvince = place.type === "area" && /province/i.test(place.category ?? "");
    const altitude = isProvince ? 185000 : place.type === "area" ? 85000 : 55000;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(place.longitude, place.latitude, altitude),
      orientation: {
        heading: 0, pitch: Cesium.Math.toRadians(-85), roll: 0,
      },
      duration: 1.3,
      complete: () => {
        if (disposed || viewer.isDestroyed()) return;
        navigation.setFlightActive(false);
        focus.show();
        if (place.type === "area" && selected) pins.showFor({ ...selected, contains: (lon, lat) => contains(selected!, lon, lat) }, activeCategory);
      },
      cancel: () => {
        if (disposed || viewer.isDestroyed()) return;
        navigation.setFlightActive(false);
        focus.hide();
      },
    });
  }

  function clearSelection() {
    if (disposed || viewer.isDestroyed()) return;
    viewer.camera.cancelFlight();
    navigation.setFlightActive(false);
    focus.hide();
    pins.clear();
    clearSearchPin();
    clearLines(hoverLines);
    clearLines(selectedLines);
    hoverLines = [];
    selectedLines = [];
    hovered = null;
    selected = null;
    viewer.scene.canvas.style.cursor = "grab";
    onHover(null);
    onSelect(null);
  }

  handler.setInputAction((event: { position: { x: number; y: number } }) => {
    // Tourist pins take priority over underlying province polygon clicks.
    const position = new Cesium.Cartesian2(event.position.x, event.position.y);
    const picked = viewer.scene.pick(position);
    if (searchPin && picked && typeof picked === "object" && "id" in picked &&
        (picked as { id?: unknown }).id === searchPin && activeSearchPlace) {
      onSearchPlaceSelect?.(activeSearchPlace);
      return;
    }
    const dbPlace = pins.placeFromPick(picked);
    if (dbPlace) {
      onSearchPlaceSelect?.(dbPlace);
      return;
    }
    const spot = pins.spotFromPick(picked);
    if (spot) {
      onSpotSelect(spot);
      return;
    }
    const area = areaAtScreen(event.position);
    if (area) selectArea(area);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  console.log(
    `Lakbay: ${provinces.length} provinces and ${cities.length} NCR areas are selectable.`
  );

  return {
    areas: searchAreas,
    selectById(id: string) {
      const area = areaById.get(id);
      if (area) selectArea(area);
    },
    clearSelection,
    selectPlace,
    setCategoryFilter(category: DestinationFilter) {
      if (disposed || viewer.isDestroyed()) return;
      activeCategory = category;
      // Updating the filter never changes the camera or current yellow border.
      if (selected) pins.showFor({ ...selected, contains: (lon, lat) => contains(selected!, lon, lat) }, activeCategory);
    },
    dispose() {
      disposed = true;
      viewer.camera.cancelFlight();
      navigation.setFlightActive(false);
      if (!handler.isDestroyed()) handler.destroy();
      focus.dispose();
      pins.dispose();
      clearSearchPin();
      if (!viewer.isDestroyed()) {
        clearLines(hoverLines);
        clearLines(selectedLines);
        viewer.scene.canvas.style.cursor = "";
      }
      hoverLines = [];
      selectedLines = [];
      hovered = null;
      selected = null;
    },
  };
}
