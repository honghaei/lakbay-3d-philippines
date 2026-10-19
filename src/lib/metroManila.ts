
import type { Viewer } from "cesium";

type Point = [number, number];
type Polygon = Point[][];

type Feature = {
  properties: {
    lakbayName: string;
  };
  geometry:
    | {
        type: "Polygon";
        coordinates: Polygon;
      }
    | {
        type: "MultiPolygon";
        coordinates: Polygon[];
      };
};

function area(ring: Point[]) {
  let sum = 0;

  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }

  return Math.abs(sum / 2);
}

function inside(point: Point, ring: Point[]) {
  const [x, y] = point;
  let result = false;

  for (
    let i = 0, j = ring.length - 1;
    i < ring.length;
    j = i++
  ) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    ) {
      result = !result;
    }
  }

  return result;
}

function labelPosition(polygon: Polygon): Point {
  const ring = polygon[0];

  const west = Math.min(...ring.map(p => p[0]));
  const east = Math.max(...ring.map(p => p[0]));
  const south = Math.min(...ring.map(p => p[1]));
  const north = Math.max(...ring.map(p => p[1]));

  const cx = (west + east) / 2;
  const cy = (south + north) / 2;

  let best: Point = ring[0];
  let bestScore = Infinity;

  for (let i = 0; i < 21; i++) {
    for (let j = 0; j < 21; j++) {
      const point: Point = [
        west + ((i + 0.5) / 21) * (east - west),
        south + ((j + 0.5) / 21) * (north - south),
      ];

      if (!inside(point, ring)) continue;

      if (
        polygon.slice(1).some(
          hole => inside(point, hole)
        )
      ) continue;

      const score =
        ((point[0] - cx) / Math.max(east - west, 0.001)) ** 2 +
        ((point[1] - cy) / Math.max(north - south, 0.001)) ** 2;

      if (score < bestScore) {
        best = point;
        bestScore = score;
      }
    }
  }

  return best;
}

export async function loadMetroManila(
  viewer: Viewer,
  Cesium: typeof import("cesium")
) {
  const response = await fetch(
    "/data/metro-manila.geojson"
  );

  if (!response.ok) {
    throw new Error("Metro Manila data not found.");
  }

  const data = await response.json();

  if (viewer.isDestroyed()) return;

  const features = data.features as Feature[];

  for (const feature of features) {
    const name = feature.properties.lakbayName;

    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;

    // Draw city and municipality boundaries.
    for (const polygon of polygons) {
      for (const ring of polygon) {
        if (ring.length < 2) continue;

        viewer.entities.add({
          name: `${name} Boundary`,
          polyline: {
            positions:
              Cesium.Cartesian3.fromDegreesArray(
                ring.flatMap(([lon, lat]) => [
                  lon,
                  lat,
                ])
              ),
            width: 1.2,
            material:
              Cesium.Color.WHITE.withAlpha(0.75),
            clampToGround: true,
            zIndex: 15,
          },
        });
      }
    }

    const largest = polygons
      .filter(p => p[0]?.length >= 3)
      .sort(
        (a, b) =>
          area(b[0]) - area(a[0])
      )[0];

    if (!largest) continue;

    const [lon, lat] = labelPosition(largest);

    viewer.entities.add({
      name,
      position: Cesium.Cartesian3.fromDegrees(
        lon,
        lat
      ),
      label: {
        text: name,
        font: "600 13px Arial",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        style:
          Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference:
          Cesium.HeightReference.CLAMP_TO_GROUND,
        show: new Cesium.CallbackProperty(
          () =>
            viewer.camera.positionCartographic.height <
            700000,
          false
        ),
      },
    });
  }

  // Nationwide NCR label.
  viewer.entities.add({
    name: "Metro Manila",
    position: Cesium.Cartesian3.fromDegrees(
      121.03,
      14.59
    ),
    label: {
      text: "Metro Manila",
      font: "bold 15px Arial",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference:
        Cesium.HeightReference.CLAMP_TO_GROUND,
      show: new Cesium.CallbackProperty(
        () =>
          viewer.camera.positionCartographic.height >=
          700000,
        false
      ),
    },
  });

  console.log("Lakbay: Metro Manila loaded.");
}
