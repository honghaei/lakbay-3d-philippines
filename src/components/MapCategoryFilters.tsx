"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { DestinationFilter, PinStats } from "@/lib/touristPins";

type Props = {
  selectedArea: string | null;
  value: DestinationFilter;
  onChange: (category: DestinationFilter) => void;
  stats: PinStats;
};

const CATEGORIES: ReadonlyArray<{ value: DestinationFilter; label: string }> = [
  { value: "All", label: "All" },
  { value: "Nature", label: "Nature" },
  { value: "Beach", label: "Beaches" },
  { value: "History", label: "History" },
  { value: "Culture", label: "Culture" },
  { value: "Adventure", label: "Adventure" },
];

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export default function MapCategoryFilters({
  selectedArea,
  value,
  onChange,
  stats,
}: Props) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  // No pins or filters are shown on the nationwide view.
  if (!mounted || !selectedArea) return null;

  return createPortal(
    <section
      data-lakbay-category-filter="true"
      aria-label={`Filter destinations in ${selectedArea}`}
      style={{
        position: "fixed",
        top: "var(--lakbay-filter-top, 86px)",
        right: "var(--lakbay-filter-right, 24px)",
        zIndex: 2147481999,
        width: "min(465px, calc(100vw - 32px))",
        boxSizing: "border-box",
        padding: 13,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,.24)",
        background: "rgba(3,20,47,.97)",
        color: "white",
        boxShadow: "0 14px 36px rgba(0,0,0,.4)",
        backdropFilter: "blur(14px)",
        fontFamily: "Arial, sans-serif",
        pointerEvents: "auto",
      }}
    >
      <style>{`
        @media (max-width: 640px) {
          [data-lakbay-category-filter] {
            --lakbay-filter-top: 181px;
            --lakbay-filter-right: 16px;
          }
        }
      `}</style>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 8, marginBottom: 11,
      }}>
        <strong style={{ fontSize: 13, lineHeight: 1.35 }}>
          Explore {selectedArea}
        </strong>
        <span aria-live="polite" style={{
          flexShrink: 0, fontSize: 11, color: "#b7c6d9",
        }}>
          {stats.loading ? "Loading places…" : `${stats.visible} of ${stats.total} places`}
        </span>
      </div>
      <div role="group" aria-label="Destination categories" style={{
        display: "flex", flexWrap: "wrap", gap: 7,
      }}>
        {CATEGORIES.map((category) => {
          const active = value === category.value;
          return (
            <button
              key={category.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(category.value)}
              style={{
                border: active
                  ? "1px solid #f0c34c"
                  : "1px solid rgba(255,255,255,.22)",
                borderRadius: 999,
                background: active ? "#f0c34c" : "rgba(255,255,255,.075)",
                color: active ? "#071329" : "#e5edf7",
                font: "600 12px Arial, sans-serif",
                lineHeight: "18px",
                padding: "7px 12px",
                cursor: "pointer",
                transition: "background .15s ease",
              }}
            >
              {category.label}
            </button>
          );
        })}
      </div>
      {stats.error && (
        <p role="status" style={{ margin: "11px 0 0", color: "#ffe49b", fontSize: 12 }}>
          Some destination data could not load. Check the terminal or browser console.
        </p>
      )}
      {(stats.previewVisible ?? 0) > 0 && (
        <p style={{ margin: "10px 0 0", color: "#ffcf76", fontSize: 12 }}>
          ⚠ {stats.previewVisible} amber pin(s) are unverified local-only review candidates, not published destinations.
        </p>
      )}
      {stats.visible === 0 && !stats.loading && !stats.error && (
        <p role="status" style={{
          margin: "11px 0 0", color: "#bbcadb", fontSize: 12, lineHeight: 1.4,
        }}>
          {value === "All"
            ? "No published destinations in this area yet."
            : `No ${value.toLowerCase()} destinations added here yet.`}
        </p>
      )}
    </section>,
    document.body
  );
}
