
import type { Viewer } from "cesium";

type Point = [number, number];
type Polygon = Point[][];

type ProvinceFeature = {
  properties: {
    shapeName?: string;
  };
  geometry:
    | {
        type: "Polygon";
        coordinates: Polygon;
      }
    | {
        type: "MultiPolygon";
        coordinates: Polygon[];
      }
    | null;
};

type GeoJSONData = {
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

// Calculate approximate polygon area.
function getArea(ring: Point[]): number {
  let area = 0;

  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];

    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area / 2);
}

// Check whether a coordinate is on land.
function isInside(
  point: Point,
  ring: Point[]
): boolean {
  const [x, y] = point;
  let inside = false;

  for (
    let i = 0, j = ring.length - 1;
    i < ring.length;
    j = i++
  ) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > y !== yj > y &&
      x <
        ((xj - xi) * (y - yi)) /
          (yj - yi) +
          xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

// Find a representative location within a province.
function getLabelPosition(
  polygon: Polygon
): Point {
  const ring = polygon[0];

  const longitudes = ring.map((p) => p[0]);
  const latitudes = ring.map((p) => p[1]);

  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);

  const centerX = (west + east) / 2;
  const centerY = (south + north) / 2;

  let best: Point = ring[0];
  let bestDistance = Infinity;

  // Prefer points within the actual polygon.
  for (let x = 0; x < 21; x++) {
    for (let y = 0; y < 21; y++) {
      const longitude =
        west + ((x + 0.5) / 21) * (east - west);

      const latitude =
        south + ((y + 0.5) / 21) * (north - south);

      const candidate: Point = [
        longitude,
        latitude,
      ];

      if (!isInside(candidate, ring)) continue;

      // Avoid polygon holes.
      if (
        polygon.slice(1).some((hole) =>
          isInside(candidate, hole)
        )
      ) {
        continue;
      }

      const distance =
        ((longitude - centerX) /
          Math.max(east - west, 0.001)) ** 2 +
        ((latitude - centerY) /
          Math.max(north - south, 0.001)) ** 2;

      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }

  return best;
}

export async function loadProvinceLabels(
  viewer: Viewer,
  Cesium: typeof import("cesium")
) {
  const response = await fetch(
    "/data/philippines-provinces.geojson"
  );

  if (!response.ok) {
    throw new Error("Failed to load province labels.");
  }

  const data = (await response.json()) as GeoJSONData;

  if (viewer.isDestroyed()) return;

  let count = 0;

  viewer.entities.suspendEvents();

  try {
    for (const feature of data.features) {
      if (isOldNcrDistrict(feature)) continue;

      const geometry = feature.geometry;
      const name = feature.properties?.shapeName;

      if (!geometry || !name) continue;

      const polygons =
        geometry.type === "Polygon"
          ? [geometry.coordinates]
          : geometry.coordinates;

      // Use the largest polygon for island provinces.
      const largest = polygons
        .filter((polygon) => polygon[0]?.length >= 3)
        .sort(
          (a, b) =>
            getArea(b[0]) - getArea(a[0])
        )[0];

      if (!largest) continue;

      const area = getArea(largest[0]);

      const [longitude, latitude] =
        getLabelPosition(largest);

      viewer.entities.add({
        name,

        position: Cesium.Cartesian3.fromDegrees(
          longitude,
          latitude
        ),

        label: {
          text: name,

          font: "600 15px Arial",

          style:
            Cesium.LabelStyle.FILL_AND_OUTLINE,

          fillColor: Cesium.Color.WHITE,

          outlineColor:
            Cesium.Color.BLACK.withAlpha(0.95),

          outlineWidth: 4,

          heightReference:
            Cesium.HeightReference.CLAMP_TO_GROUND,

          horizontalOrigin:
            Cesium.HorizontalOrigin.CENTER,

          verticalOrigin:
            Cesium.VerticalOrigin.CENTER,

          // Reveal additional names when zooming in.
          show: new Cesium.CallbackProperty(() => {
            const height =
              viewer.camera.positionCartographic.height;

            if (height > 2200000) {
              return area >= 1.2;
            }

            if (height > 900000) {
              return area >= 0.25;
            }

            return true;
          }, false),

          scaleByDistance: new Cesium.NearFarScalar(
            10000,
            1.1,
            3200000,
            0.8
          ),
        },
      });

      count++;
    }
  } finally {
    viewer.entities.resumeEvents();
  }

  console.log(
    `Lakbay: ${count} geographic labels loaded.`
  );
}
