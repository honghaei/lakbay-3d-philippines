"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TouristSpot } from "@/lib/touristSpots";
import { getDestinationDetails } from "@/lib/destinationDetails";
import PinPhotoCarousel from "@/components/PinPhotoCarousel";
import FavoriteButton from "@/components/FavoriteButton";

type Props = {
  selectedArea: string | null;
  selectedSpot: TouristSpot | null;
  onBack: () => void;
  onCloseSpot: () => void;
};

export default function MapOverlayControls({
  selectedArea,
  selectedSpot,
  onBack,
  onCloseSpot,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <>
      {selectedArea && (
        <button
          type="button"
          onClick={onBack}
          style={{
            position: "fixed",
            right: 24,
            bottom: 28,
            zIndex: 2147482001,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 11,
            padding: "13px 17px",
            border: "1px solid rgba(248,215,114,0.6)",
            color: "#fff",
            background: "rgba(4,39,51,0.97)",
            font: "600 13px Arial, sans-serif",
            cursor: "pointer",
            boxShadow: "0 9px 24px #0008",
          }}
        >
          <span aria-hidden="true">←</span> Back to Full View
        </button>
      )}

      {selectedSpot && (
        <section
          aria-label={`${selectedSpot.name} destination preview`}
          style={{
            position: "fixed",
            right: 24,
            bottom: selectedArea ? 94 : 28,
            zIndex: 2147482001,
            boxSizing: "border-box",
            width: "min(410px, calc(100vw - 48px))",
            maxHeight: "min(660px, calc(100dvh - 180px))",
            overflowY: "auto",
            overflowX: "hidden",
            padding: 16,
            borderRadius: 22,
            border: "1px solid rgba(134,217,203,0.44)",
            color: "#fff",
            background: "rgba(4,38,52,0.98)",
            boxShadow: "0 20px 54px #000b",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                color: "#f0c34c",
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: ".07em",
              }}
            >
              {selectedSpot.category} · {selectedSpot.city ?? selectedSpot.province}
            </span>
            <button
              type="button"
              aria-label="Close destination preview"
              onClick={onCloseSpot}
              style={{
                flexShrink: 0,
                height: 30,
                width: 30,
                borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                fontSize: 21,
                lineHeight: "26px",
              }}
            >
              ×
            </button>
          </div>

          {/* key resets slide state when the user selects a different pin */}
          <PinPhotoCarousel
            key={selectedSpot.id}
            destinationId={selectedSpot.id}
            destinationName={selectedSpot.name}
          />

          <h2 style={{ fontSize: 20, lineHeight: 1.2, margin: "13px 0 8px", fontWeight: 750 }}>
            {selectedSpot.name}
          </h2>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.65,
              color: "#c7d4e4",
              margin: "0 0 15px",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {getDestinationDetails(selectedSpot).overview}
          </p>

          <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
            <FavoriteButton destinationId={selectedSpot.id} compact />
            <a
              href="/favorites"
              style={{ alignSelf: "center", color: "#f0c34c", fontSize: 12, textDecoration: "underline" }}
            >
              View Wishlist
            </a>
          </div>

          <a
            href={`/destinations/${encodeURIComponent(selectedSpot.id)}`}
            style={{
              boxSizing: "border-box",
              display: "block",
              width: "100%",
              borderRadius: 10,
              padding: "13px 14px",
              background: "#f0c34c",
              color: "#071329",
              textDecoration: "none",
              textAlign: "center",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            Explore destination →
          </a>
        </section>
      )}
    </>,
    document.body
  );
}
