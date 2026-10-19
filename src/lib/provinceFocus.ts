import type { Viewer } from "cesium";

/**
 * Selected province focus overlay: stronger peripheral blur, clear map center.
 * Uses a radial vignette rather than expensive per-frame raster processing.
 */
export function setupProvinceFocus(viewer: Viewer) {
  const overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0 0 34px 0", // Keep Cesium attribution unobstructed.
    zIndex: "5",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 300ms ease",
    backdropFilter: "blur(8px) brightness(0.66)",
    WebkitBackdropFilter: "blur(8px) brightness(0.66)",
    maskImage: "radial-gradient(ellipse 48% 53% at 50% 49%, transparent 27%, rgba(0,0,0,0.24) 50%, black 92%)",
    webkitMaskImage: "radial-gradient(ellipse 48% 53% at 50% 49%, transparent 27%, rgba(0,0,0,0.24) 50%, black 92%)",
  });
  viewer.container.appendChild(overlay);

  return {
    hide() { overlay.style.opacity = "0"; },
    show() { if (!viewer.isDestroyed()) overlay.style.opacity = "1"; },
    dispose() { overlay.remove(); },
  };
}
