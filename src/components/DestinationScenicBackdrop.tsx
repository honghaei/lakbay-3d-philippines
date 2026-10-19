"use client";

import { useEffect, useState } from "react";
import type { DestinationPhoto } from "@/lib/curatedPhotos";

type PhotoStatus = "curated" | "commons-search" | "no-results" | "unavailable";
type PhotoResponse = { photos?: DestinationPhoto[]; status?: PhotoStatus };

/** One photograph is painted once, behind the entire destination page.
 *  Curated photos are preferred; other Commons results are provisional until
 *  their subject is checked by a human editor.
 */
export default function DestinationScenicBackdrop({
  destinationId,
  initialPhoto,
}: {
  destinationId: string;
  initialPhoto?: DestinationPhoto | null;
}) {
  const [photos, setPhotos] = useState<DestinationPhoto[]>(initialPhoto ? [initialPhoto] : []);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<PhotoStatus | null>(initialPhoto ? "curated" : null);

  useEffect(() => {
    const controller = new AbortController();
    setPhotos(initialPhoto ? [initialPhoto] : []);
    setStatus(initialPhoto ? "curated" : null);
    setIndex(0);

    // Approved editorial photos come from the same collection as the gallery.
    if (initialPhoto) return () => controller.abort();

    // Reuse the existing Commons API for destinations without curated photos.
    fetch(`/api/commons?id=${encodeURIComponent(destinationId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Photo lookup failed (${response.status})`);
        return (await response.json()) as PhotoResponse;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const usable = (data.photos ?? []).filter(
          (item) =>
            typeof item.url === "string" &&
            /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(item.url) &&
            item.source?.startsWith("https://commons.wikimedia.org/")
        );
        setPhotos(usable);
        setStatus(data.status ?? null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Lakbay scenic image unavailable:", error);
        setStatus("unavailable");
      });

    return () => controller.abort();
  }, [destinationId, initialPhoto]);

  const activePhoto = photos[index] ?? null;

  return (
    <>
      <div className="lb-destinationScene" aria-hidden="true">
        {activePhoto && (
          // Images remain on Wikimedia Commons, not republished in the app.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={activePhoto.url}
            src={activePhoto.url}
            alt=""
            className="lb-destinationSceneImage"
            onError={() => setIndex((current) => current + 1)}
          />
        )}
      </div>

      {activePhoto && (
        <div className="lb-destinationSceneCredit">
          Photo: {activePhoto.photographer} ·{" "}
          {activePhoto.licenseUrl ? (
            <a href={activePhoto.licenseUrl} target="_blank" rel="noopener noreferrer">
              {activePhoto.license}
            </a>
          ) : (
            activePhoto.license
          )}
          {" · "}
          <a href={activePhoto.source} target="_blank" rel="noopener noreferrer">
            Source ↗
          </a>
          {" · displayed cropped"}
          {status === "commons-search" && (
            <span className="lb-sceneVerification"> · Subject pending review</span>
          )}
        </div>
      )}
    </>
  );
}
