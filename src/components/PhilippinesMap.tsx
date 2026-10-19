"use client";

import { useEffect, useRef, useState } from "react";
import { useFavorites } from "@/lib/favorites";
import MapTourismIntro from "@/components/MapTourismIntro";
import type { Viewer as CesiumViewer } from "cesium";

import { loadProvinceBorders } from "@/lib/provinceBorders";
import { loadProvinceLabels } from "@/lib/provinceLabels";
import { loadMetroManila } from "@/lib/metroManila";
import { setupPhilippinesNavigation } from "@/lib/mapNavigation";
import { setupMapInteractions } from "@/lib/mapInteractions";
import type { MapInteractionController, SearchableArea, SearchPlace } from "@/lib/mapInteractions";
import MapSearch from "@/components/MapSearch";
import MapOverlayControls from "@/components/MapOverlayControls";
import MapCategoryFilters from "@/components/MapCategoryFilters";
import type { DestinationFilter, PinStats } from "@/lib/touristPins";
import { TOURIST_SPOTS, type TouristSpot } from "@/lib/touristSpots";

type Navigation = ReturnType<typeof setupPhilippinesNavigation>;

function destinationHref(place: SearchPlace): string | null {
  // Until dynamic destination detail pages are supported, allow links only
  // for the existing locally curated pages, preventing Supabase-result 404s.
  const segment = (place.url ?? "").match(/^\/destinations\/([a-zA-Z0-9-]+)\/?$/)?.[1]
    ?? place.slug;
  return segment && TOURIST_SPOTS.some(spot => spot.id === segment)
    ? `/destinations/${segment}` : null;
}

export default function PhilippinesMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const navigationRef = useRef<Navigation | null>(null);
  const interactionRef = useRef<MapInteractionController | null>(null);
  const homePositionRef = useRef<import("cesium").Cartesian3 | null>(null);

  const { count: favoriteCount } = useFavorites();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredArea, setHoveredArea] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [searchAreas, setSearchAreas] = useState<SearchableArea[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [selectedSpot, setSelectedSpot] = useState<TouristSpot | null>(null);
  const [selectedSearchPlace, setSelectedSearchPlace] = useState<SearchPlace | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<DestinationFilter>("All");
  const [pinStats, setPinStats] = useState<PinStats>({ total: 0, visible: 0, loading: false, error: false });
  const [exploreStarted, setExploreStarted] = useState(false);
  const selectedDestinationHref = selectedSearchPlace?.type === "destination"
    ? destinationHref(selectedSearchPlace) : null;

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      try {
        (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL =
          "/cesium/";

        const Cesium = await import("cesium");
        if (cancelled || !mapContainer.current) return;

        const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
        if (!token) throw new Error("Missing Cesium token in .env.local");
        Cesium.Ion.defaultAccessToken = token;

        const viewer = new Cesium.Viewer(mapContainer.current, {
          terrain: Cesium.Terrain.fromWorldTerrain(),
          baseLayer: Cesium.ImageryLayer.fromProviderAsync(
            Cesium.IonImageryProvider.fromAssetId(2)
          ),
          baseLayerPicker: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          homeButton: false,
          geocoder: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
          scene3DOnly: true,
        });
        viewerRef.current = viewer;

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(122.5, 12.5, 3000000),
          orientation: {
            heading: 0,
            pitch: -Cesium.Math.PI_OVER_TWO,
            roll: 0,
          },
        });

        homePositionRef.current = Cesium.Cartesian3.clone(viewer.camera.positionWC);
        navigationRef.current = setupPhilippinesNavigation(viewer, Cesium);
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.depthTestAgainstTerrain = true;

        await loadProvinceBorders(viewer, Cesium);
        if (cancelled || viewer.isDestroyed()) return;
        await loadProvinceLabels(viewer, Cesium);
        if (cancelled || viewer.isDestroyed()) return;
        await loadMetroManila(viewer, Cesium);
        if (cancelled || viewer.isDestroyed()) return;

        interactionRef.current = await setupMapInteractions(
          viewer,
          Cesium,
          (name) => { if (!cancelled) setHoveredArea(name); },
          (name) => { if (!cancelled) { setSelectedArea(name); setSelectedSpot(null); setSelectedSearchPlace(null); } },
          (spot) => { if (!cancelled) { setSelectedSpot(spot); setSelectedSearchPlace(null); } },
          navigationRef.current,
          (place) => { if (!cancelled) { setSelectedSearchPlace(place); setSelectedSpot(null); } },
           (stats) => { if (!cancelled) setPinStats(stats); }
        );

        if (cancelled || viewer.isDestroyed()) {
          interactionRef.current?.dispose();
          interactionRef.current = null;
          return;
        }
        setSearchAreas(interactionRef.current.areas);
        setLoading(false);
        console.log("Lakbay: Province search and full-view navigation ready.");
      } catch (err) {
        console.error("Lakbay initialization error:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load map");
          setLoading(false);
        }
      }
    }

    void initializeMap();
    return () => {
      cancelled = true;
      interactionRef.current?.dispose();
      interactionRef.current = null;
      navigationRef.current?.dispose();
      navigationRef.current = null;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
      homePositionRef.current = null;
    };
  }, []);

  function goToFullView() {
    const viewer = viewerRef.current;
    const navigation = navigationRef.current;
    const homePosition = homePositionRef.current;
    if (!viewer || viewer.isDestroyed() || !navigation || !homePosition) return;

    interactionRef.current?.clearSelection();
    setExploreStarted(false);
    setSearchValue("");
    setSelectedSpot(null);
    setSelectedSearchPlace(null);
    viewer.camera.cancelFlight();
    navigation.setFlightActive(true);

    const finish = () => {
      if (!viewer.isDestroyed()) navigation.setFlightActive(false);
    };

    viewer.camera.flyTo({
      destination: homePosition,
      orientation: {
        heading: 0,
        pitch: -Math.PI / 2,
        roll: 0,
      },
      duration: 1.3,
      complete: finish,
      cancel: finish,
    });
  }

  function chooseCategory(next: DestinationFilter) {
    setCategoryFilter(next);
    setSelectedSpot(null);
    interactionRef.current?.setCategoryFilter(next);
  }

  return (
    <div className="relative h-full w-full bg-[#03142F]">
      <div ref={mapContainer} className="absolute inset-0" />

      <MapTourismIntro
        selectedArea={selectedArea}
        exploreStarted={exploreStarted}
        favoriteCount={favoriteCount}
        onExplore={() => {
          // Let visitors choose their own destination; never force Palawan.
          setExploreStarted(true);
          document.getElementById("lakbay-search")?.focus();
        }}
      />

      <MapSearch
        areas={searchAreas}
        value={searchValue}
        onChange={setSearchValue}
        onChoose={(id) => { setSelectedSearchPlace(null); interactionRef.current?.selectById(id); }}
        onChoosePlace={(place) => {
          setSelectedSpot(null);
          setSelectedSearchPlace(null);
          interactionRef.current?.selectPlace(place);
        }}
        disabled={loading || Boolean(error)}
      />

      <MapCategoryFilters
        selectedArea={!loading && !error ? selectedArea : null}
        value={categoryFilter}
        onChange={chooseCategory}
        stats={pinStats}
      />

      <MapOverlayControls
        selectedArea={!loading && !error ? selectedArea : null}
        selectedSpot={selectedSpot}
        onBack={goToFullView}
        onCloseSpot={() => setSelectedSpot(null)}
      />
      {selectedSearchPlace?.type === "destination" && (
        <section
          aria-label="Searched tourist attraction"
          style={{
            position: "fixed", right: 24, bottom: 98, zIndex: 2147482002,
            width: "min(350px, calc(100vw - 48px))", boxSizing: "border-box",
            padding: "20px", borderRadius: 15, color: "#fff",
            background: "rgba(3,20,47,.97)", border: "1px solid rgba(255,255,255,.27)",
            boxShadow: "0 15px 42px #0009", fontFamily: "Arial, sans-serif",
          }}
        >
          <button
            type="button" aria-label="Close searched destination preview"
            onClick={() => setSelectedSearchPlace(null)}
            style={{ position: "absolute", top: 9, right: 12, background: "none", color: "white", border: 0, fontSize: 23, cursor: "pointer" }}
          >×</button>
          <p style={{ fontSize: 11, color: "#efc64b", textTransform: "uppercase", fontWeight: 700, letterSpacing: 1 }}>
            {selectedSearchPlace.unverified ? "⚠ UNVERIFIED · LOCAL PREVIEW" : selectedSearchPlace.category ?? "Tourist attraction"}
            {selectedSearchPlace.subtitle ? ` · ${selectedSearchPlace.subtitle}` : ""}
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "10px 22px 8px 0" }}>
            {selectedSearchPlace.name}
          </h2>
          <p style={{ fontSize: 13, color: "#d0dce8", marginBottom: 14 }}>
            {selectedSearchPlace.unverified
              ? "Unverified candidate for map testing only. Identity, coordinates, access and rights may be inaccurate. Not published or recommended for visiting."
              : "Approved destination on Lakbay's map. Its full detail page is being prepared."}
          </p>
          {!selectedSearchPlace.unverified && selectedDestinationHref && (
            <a href={selectedDestinationHref} style={{ display: "block", borderRadius: 10, padding: "12px", background: "#efc64b", color: "#071329", fontSize: 13, textAlign: "center", fontWeight: 700, textDecoration: "none" }}>
              Explore destination →
            </a>
          )}
        </section>
      )}

      {!loading && !error && (
        <div className="pointer-events-none absolute bottom-10 left-6 z-10 max-w-sm rounded-lg border border-white/15 bg-black/65 px-4 py-3 text-sm text-white backdrop-blur-md">
          {hoveredArea ? (
            <span>Click to explore: <strong>{hoveredArea}</strong></span>
          ) : selectedArea ? (
            <span>Selected: <strong>{selectedArea}</strong></span>
          ) : (
            <span>Hover over a province, then click to zoom in.</span>
          )}
        </div>
      )}

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#03142F] text-white">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-widest">LAKBAY</h2>
            <p className="mt-3 text-sm text-gray-300">Loading Philippine 3D Map...</p>
            <div className="mx-auto mt-5 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        </div>
      )}

      {error && (
        <div className="absolute left-1/2 top-1/2 z-30 w-11/12 max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-red-400/30 bg-red-950 p-5 text-white shadow-xl">
          <h2 className="text-lg font-bold">Map Loading Error</h2>
          <p className="mt-2 break-words text-sm text-red-100">{error}</p>
        </div>
      )}
    </div>
  );
}
