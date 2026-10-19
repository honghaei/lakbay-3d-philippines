"use client";

import { useEffect, useState } from "react";
import {
  CURATED_PHOTOS,
  type DestinationPhoto,
} from "@/lib/curatedPhotos";

type GalleryResponse = {
  photos?: DestinationPhoto[];
  status?: "curated" | "commons-search" | "no-results" | "unavailable";
};

type Props = {
  destinationId: string;
  destinationName: string;
};

const arrowStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 2,
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.35)",
  color: "white",
  background: "rgba(3,20,47,0.82)",
  cursor: "pointer",
  fontSize: 25,
  lineHeight: "32px",
  display: "grid",
  placeItems: "center",
};

export default function PinPhotoCarousel({
  destinationId,
  destinationName,
}: Props) {
  // Curated images show immediately, without waiting for an API response.
  const initialPhotos = CURATED_PHOTOS[destinationId] ?? [];
  const [photos, setPhotos] = useState<DestinationPhoto[]>(initialPhotos);
  const [index, setIndex] = useState(0);
  const [brokenUrls, setBrokenUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(initialPhotos.length === 0);
  const [unverified, setUnverified] = useState(false);

  useEffect(() => {
    // The component is keyed by destinationId in MapOverlayControls.
    // Avoid making a network request for editorially selected photos.
    if (CURATED_PHOTOS[destinationId]?.length) return;

    const controller = new AbortController();

    fetch(`/api/commons?id=${encodeURIComponent(destinationId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Photos: ${response.status}`);
        return (await response.json()) as GalleryResponse;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setPhotos(Array.isArray(data.photos) ? data.photos : []);
        setUnverified(data.status === "commons-search");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn("Lakbay pin preview photos unavailable:", error);
          setPhotos([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [destinationId]);

  const available = photos.filter((photo) => !brokenUrls.includes(photo.url));
  const activeIndex = available.length ? index % available.length : 0;
  const photo = available[activeIndex];

  function step(change: number) {
    if (available.length < 2) return;
    setIndex((previous) =>
      (previous + change + available.length) % available.length
    );
  }

  return (
    <div>
      <div
        style={{
          height: 205,
          width: "100%",
          position: "relative",
          overflow: "hidden",
          borderRadius: 12,
          background: "linear-gradient(135deg,#1c3653,#0a172b)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label={`${destinationName} photos`}
      >
        {photo ? (
          // Images are Wikimedia-hosted; source and license appear below.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.url}
            src={photo.url}
            alt={`${destinationName} — ${photo.name}`}
            decoding="async"
            loading="eager"
            onError={() => {
              setBrokenUrls((previous) =>
                previous.includes(photo.url) ? previous : [...previous, photo.url]
              );
              setIndex(0);
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            role="status"
            style={{
              textAlign: "center",
              color: "#cad5e6",
              fontSize: 13,
              padding: 24,
              lineHeight: 1.5,
            }}
          >
            <div aria-hidden="true" style={{ fontSize: 32, marginBottom: 6 }}>
              {loading ? "◌" : "▧"}
            </div>
            {loading
              ? "Loading destination photos…"
              : "No verified photo available yet. See the full destination page."}
          </div>
        )}

        {available.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous destination photo"
              onClick={() => step(-1)}
              style={{ ...arrowStyle, left: 10 }}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next destination photo"
              onClick={() => step(1)}
              style={{ ...arrowStyle, right: 10 }}
            >
              ›
            </button>
          </>
        )}

        {photo && (
          <span
            style={{
              position: "absolute",
              bottom: 10,
              right: 12,
              padding: "5px 9px",
              borderRadius: 16,
              fontSize: 11,
              fontWeight: 700,
              color: "white",
              background: "rgba(3,20,47,0.85)",
            }}
          >
            {activeIndex + 1} / {available.length}
          </span>
        )}
      </div>

      {photo && (
        <div style={{ marginTop: 9 }}>
          {available.length > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 8 }}>
              {available.map((item, itemIndex) => (
                <button
                  key={`${item.source}-${itemIndex}`}
                  type="button"
                  aria-label={`Show photo ${itemIndex + 1}`}
                  aria-pressed={itemIndex === activeIndex}
                  onClick={() => setIndex(itemIndex)}
                  style={{
                    width: itemIndex === activeIndex ? 19 : 7,
                    height: 7,
                    border: "none",
                    padding: 0,
                    borderRadius: 4,
                    cursor: "pointer",
                    background: itemIndex === activeIndex ? "#f0c34c" : "#74839b",
                    transition: "width .2s ease",
                  }}
                />
              ))}
            </div>
          )}
          <p style={{ margin: 0, color: "#b9c9dd", fontSize: 10.5, lineHeight: 1.5 }}>
            Photo: {photo.photographer} · {photo.license} ·{" "}
            <a
              href={photo.source}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#f0c34c", textDecoration: "underline" }}
            >
              View source &amp; attribution ↗
            </a>
            {unverified && " · Automated match: verify subject"}
          </p>
        </div>
      )}
    </div>
  );
}
