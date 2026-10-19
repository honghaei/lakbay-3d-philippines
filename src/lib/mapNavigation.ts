import type { Viewer } from "cesium";

// Geographic navigation restrictions for the LAKBAY map.
export function setupPhilippinesNavigation(
  viewer: Viewer,
  Cesium: typeof import("cesium")
) {
  const camera = viewer.camera;
  const controller = viewer.scene.screenSpaceCameraController;

  controller.minimumZoomDistance = 100;
  controller.maximumZoomDistance = 3_100_000;
  controller.maximumTiltAngle = Cesium.Math.toRadians(80);
  controller.enableRotate = true;
  controller.enableZoom = true;
  controller.enableTilt = true;
  controller.enableLook = false;
  controller.inertiaSpin = 0;
  controller.inertiaZoom = 0;

  // Overlapping navigable areas, including Palawan, Batanes and Tawi-Tawi.
  const allowedZones = [
    { west: 117.8, east: 128.5, south: 10, north: 22.5 },
    { west: 116.4, east: 121.5, south: 6.5, north: 13 },
    { west: 118, east: 128, south: 4, north: 11.5 },
  ];

  type CameraView = {
    position: import("cesium").Cartesian3;
    direction: import("cesium").Cartesian3;
    up: import("cesium").Cartesian3;
  };

  function saveView(): CameraView {
    return {
      position: Cesium.Cartesian3.clone(camera.positionWC),
      direction: Cesium.Cartesian3.clone(camera.directionWC),
      up: Cesium.Cartesian3.clone(camera.upWC),
    };
  }

  let lastValidView = saveView();
  let flightActive = false;
  let restoring = false;

  function withinLimits(): boolean {
    const canvas = viewer.scene.canvas;
    const screenCenter = new Cesium.Cartesian2(
      canvas.clientWidth / 2,
      canvas.clientHeight / 2
    );
    const earthPoint = camera.pickEllipsoid(
      screenCenter,
      viewer.scene.globe.ellipsoid
    );
    if (!earthPoint) return false;

    const point = Cesium.Cartographic.fromCartesian(earthPoint);
    const longitude = Cesium.Math.toDegrees(point.longitude);
    const latitude = Cesium.Math.toDegrees(point.latitude);
    const height = camera.positionCartographic.height;

    return height <= 3_150_000 && allowedZones.some((zone) =>
      longitude >= zone.west && longitude <= zone.east &&
      latitude >= zone.south && latitude <= zone.north
    );
  }

  function restoreLastValidView() {
    if (restoring || viewer.isDestroyed()) return;
    restoring = true;
    camera.setView({
      destination: lastValidView.position,
      orientation: {
        direction: lastValidView.direction,
        up: lastValidView.up,
      },
    });
    restoring = false;
  }

  // Pause geographic clamping while Cesium performs an intentional camera flight.
  function setFlightActive(active: boolean) {
    flightActive = active;
    if (!active && !viewer.isDestroyed()) {
      if (withinLimits()) lastValidView = saveView();
      else restoreLastValidView();
    }
  }

  const removePreRender = viewer.scene.preRender.addEventListener(() => {
    if (viewer.isDestroyed() || flightActive || restoring) return;
    if (!withinLimits()) restoreLastValidView();
    else lastValidView = saveView();
  });

  return {
    setFlightActive,
    dispose() {
      removePreRender();
    },
  };
}
