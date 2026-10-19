
import type { Viewer } from "cesium";

type Coordinate = [number, number];
type Ring = Coordinate[];
type Polygon = Ring[];

type ProvinceGeometry =
  | {
      type: "Polygon";
      coordinates: Polygon;
    }
  | {
      type: "MultiPolygon";
      coordinates: Polygon[];
    };

type ProvinceFeature = {
  type: "Feature";
  properties: {
    shapeName?: string;
  };
  geometry: ProvinceGeometry | null;
};

type ProvinceCollection = {
  type: "FeatureCollection";
  features: ProvinceFeature[];
};

// Hide the old NCR district features. Metro Manila uses its own
// 16-city + Pateros boundary layer instead.
function isOldNcrDistrict(feature: ProvinceFeature): boolean {
  const name = feature.properties?.shapeName ?? "";
  if (!/district|\bNCR\b|metro(?:politan)? manila/i.test(name)) {
    return false;
  }

  const geometry = feature.geometry;
  if (!geometry) return false;

  const polygon =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.coordinates[0];
  const ring = polygon?.[0];
  if (!ring?.length) return false;

  const minLon = Math.min(...ring.map(([lon]) => lon));
  const maxLon = Math.max(...ring.map(([lon]) => lon));
  const minLat = Math.min(...ring.map(([, lat]) => lat));
  const maxLat = Math.max(...ring.map(([, lat]) => lat));
  const lon = (minLon + maxLon) / 2;
  const lat = (minLat + maxLat) / 2;

  return lon >= 120.85 && lon <= 121.25 &&
    lat >= 14.3 && lat <= 14.9;
}

export async function loadProvinceBorders(
  viewer: Viewer,
  Cesium: typeof import("cesium")
) {
  const response = await fetch(
    "/data/philippines-provinces.geojson"
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load province boundaries: ${response.status}`
    );
  }

  const geojson =
    (await response.json()) as ProvinceCollection;

  if (
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features)
  ) {
    throw new Error("Invalid province GeoJSON file.");
  }

  if (viewer.isDestroyed()) return;

  const borderColor = Cesium.Color.WHITE.withAlpha(0.8);

  let lineCount = 0;
  let displayedAreas = 0;

  viewer.entities.suspendEvents();

  try {
    for (const feature of geojson.features) {
      if (isOldNcrDistrict(feature)) continue;

      const geometry = feature.geometry;

      if (!geometry) continue;
      displayedAreas++;

      const polygons =
        geometry.type === "Polygon"
          ? [geometry.coordinates]
          : geometry.coordinates;

      for (const polygon of polygons) {
        for (const ring of polygon) {
          if (ring.length < 2) continue;

          const coordinates = ring.flatMap(
            ([longitude, latitude]) => [
              longitude,
              latitude,
            ]
          );

          viewer.entities.add({
            name:
              feature.properties?.shapeName ??
              "Province Boundary",

            polyline: {
              positions:
                Cesium.Cartesian3.fromDegreesArray(
                  coordinates
                ),

              width: 1.3,
              material: borderColor,
              clampToGround: true,
              zIndex: 10,
            },
          });

          lineCount++;
        }
      }
    }
  } finally {
    viewer.entities.resumeEvents();
  }

  console.log(
    `Lakbay: Loaded ${displayedAreas} geographic areas and ${lineCount} boundary lines.`
  );
}
