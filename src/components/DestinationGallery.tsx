"use client";

import { useEffect, useState } from "react";
import type { DestinationPhoto } from "@/lib/curatedPhotos";

type GalleryResponse = {
  photos: DestinationPhoto[];
  searchUrl?: string;
  status?: "curated" | "commons-search" | "no-results" | "unavailable";
};

export default function DestinationGallery({
  destinationId,
  destinationName,
}: {
  destinationId: string;
  destinationName: string;
}) {
  const [photos, setPhotos] = useState<DestinationPhoto[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [brokenUrls, setBrokenUrls] = useState<string[]>([]);
  const [status, setStatus] = useState<GalleryResponse["status"]>();
  const [searchUrl, setSearchUrl] = useState("https://commons.wikimedia.org/");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPhotos([]);
    setCurrent(0);
    setBrokenUrls([]);
    setStatus(undefined);

    fetch(`/api/commons?id=${encodeURIComponent(destinationId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Photo API ${response.status}`);
        return (await response.json()) as GalleryResponse;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setPhotos(Array.isArray(data.photos) ? data.photos : []);
        setSearchUrl(data.searchUrl ?? "https://commons.wikimedia.org/");
        setStatus(data.status);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Lakbay gallery unavailable:", error);
        setStatus("unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [destinationId]);

  const available = photos.filter((photo) => !brokenUrls.includes(photo.url));
  const activeIndex = Math.min(current, Math.max(0, available.length - 1));
  const selected = available[activeIndex];

  function move(offset: number) {
    setCurrent((old) => (old + offset + available.length) % available.length);
  }

  return (
    <section aria-label={`${destinationName} photo gallery`} className="space-y-4">
      <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-800/70">
        {selected ? (
          // Wikimedia-hosted photographs are kept with their attribution links.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={selected.url}
            src={selected.url}
            alt={`${destinationName}: ${selected.name}`}
            className="h-full w-full object-cover"
            onError={() => {
              setBrokenUrls((prev) => [...prev, selected.url]);
              setCurrent(0);
            }}
          />
        ) : (
          <div className="px-8 text-center text-sm text-slate-300">
            <div className="mb-3 text-4xl">📷</div>
            {loading
              ? "Loading destination photographs..."
              : status === "unavailable"
                ? "The photo service is unavailable right now."
                : "No approved photographs are available for this destination yet."}
          </div>
        )}

        {available.length > 1 && (
          <div className="pointer-events-none absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-between">
            <button type="button" aria-label="Previous photo" onClick={() => move(-1)}
              className="pointer-events-auto rounded-full border border-white/20 bg-slate-950/80 px-4 py-3 text-white">‹</button>
            <button type="button" aria-label="Next photo" onClick={() => move(1)}
              className="pointer-events-auto rounded-full border border-white/20 bg-slate-950/80 px-4 py-3 text-white">›</button>
          </div>
        )}
      </div>

      {selected && (
        <p className="text-xs leading-5 text-slate-300">
          Photo {activeIndex + 1} of {available.length} · {selected.name} · Photo by {selected.photographer} · {" "}
          {selected.licenseUrl ? (
            <a href={selected.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-amber-300 underline">
              {selected.license}
            </a>
          ) : selected.license}
          {" · "}
          <a href={selected.source} target="_blank" rel="noopener noreferrer" className="text-amber-300 underline">
            View original and attribution
          </a>
          {" · "}No modifications by Lakbay
        </p>
      )}

      {available.length > 1 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {available.map((photo, index) => (
            <button key={photo.source} type="button" aria-label={`View photo ${index + 1}`}
              aria-pressed={index === activeIndex} onClick={() => setCurrent(index)}
              className={`aspect-[4/3] overflow-hidden rounded-lg border-2 ${index === activeIndex ? "border-amber-400" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-full w-full object-cover" loading="lazy"
                onError={() => setBrokenUrls((prev) => [...prev, photo.url])} />
            </button>
          ))}
        </div>
      )}

      <p className="text-xs leading-5 text-slate-400">
        {status === "curated"
          ? "These images were selected from Wikimedia Commons and retain source and license attribution."
          : "Automatic Commons results may need manual verification before public launch."}
        {" "}
        <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="text-amber-300 underline underline-offset-2">
          Browse more Commons photos ↗
        </a>
      </p>
    </section>
  );
}
