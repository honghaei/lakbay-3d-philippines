"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { SearchableArea, SearchPlace } from "@/lib/mapInteractions";

type Props = {
  areas: SearchableArea[];
  value: string;
  onChange: (value: string) => void;
  onChoose: (id: string) => void;
  onChoosePlace: (place: SearchPlace) => void;
  disabled?: boolean;
};

type SearchMatch =
  | { kind: "local"; key: string; area: SearchableArea }
  | { kind: "remote"; key: string; place: SearchPlace };

const colors = { navy: "rgba(3, 20, 47, 0.97)", yellow: "#efc64b" };

const inputStyle: CSSProperties = {
  flex: "1 1 auto", minWidth: 0, width: "100%", height: 40,
  padding: "0 12px", border: "none", outline: "none", boxShadow: "none",
  color: "#ffffff", background: "transparent", font: "400 13px Arial, sans-serif",
  whiteSpace: "nowrap",
};

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parsePlace(value: unknown): SearchPlace | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.type !== "destination" && data.type !== "area") return null;
  if (typeof data.name !== "string" || !data.name.trim()) return null;

  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return {
    type: data.type,
    id: String(data.id ?? data.name),
    name: data.name,
    latitude, longitude,
    subtitle: typeof data.subtitle === "string" ? data.subtitle : undefined,
    category: typeof data.category === "string" ? data.category : undefined,
    slug: typeof data.slug === "string" ? data.slug : undefined,
    url: typeof data.url === "string" ? data.url : undefined,
  };
}

function placeType(place: SearchPlace) {
  if (place.type === "destination") return place.category ?? "Attraction";
  return place.category ?? "Location";
}

export default function MapSearch({
  areas, value, onChange, onChoose, onChoosePlace, disabled = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [remotePlaces, setRemotePlaces] = useState<SearchPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => setMounted(true), []);

  // The API is already backed by Supabase; nothing is hardcoded to Palawan.
  useEffect(() => {
    const query = value.trim();
    if (disabled || query.length < 2) {
      setRemotePlaces([]);
      setSearching(false);
      setSearchError(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    setSearchError(false);
    setRemotePlaces([]);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/lakbay/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error(`Search HTTP ${response.status}`);
        const json: unknown = await response.json();
        const results = json && typeof json === "object" && "results" in json
          ? (json as { results?: unknown }).results : undefined;
        if (!controller.signal.aborted) {
          setRemotePlaces(Array.isArray(results)
            ? results.map(parsePlace).filter((place): place is SearchPlace => place !== null)
            : []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Lakbay remote search failed:", error);
          setSearchError(true);
          setRemotePlaces([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, disabled]);

  const matches = useMemo<SearchMatch[]>(() => {
    const query = normalize(value);
    if (!query) return [];

    const locals = areas
      .filter((area) => normalize(area.name).includes(query))
      .sort((a, b) => {
        const aStarts = normalize(a.name).startsWith(query) ? 0 : 1;
        const bStarts = normalize(b.name).startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 8);

    const localNames = new Set(locals.map((area) => normalize(area.name)));
    const remote = remotePlaces
      .filter((place) => place.type === "destination" || !localNames.has(normalize(place.name)))
      .map((place): SearchMatch => ({ kind: "remote", key: `remote:${place.type}:${place.id}`, place }));
    const exactLocal = locals.filter((area) => normalize(area.name) === query);
    const otherLocal = locals.filter((area) => normalize(area.name) !== query);

    // Always keep an exact province/city match visible, even when the API
    // returns lots of destinations containing the province name.
    return [
      ...exactLocal.map((area): SearchMatch => ({ kind: "local", key: `local:${area.id}`, area })),
      ...remote.filter((item) => item.kind === "remote" && item.place.type === "destination").slice(0, 7),
      ...otherLocal.map((area): SearchMatch => ({ kind: "local", key: `local:${area.id}`, area })),
      ...remote.filter((item) => item.kind === "remote" && item.place.type === "area"),
    ].slice(0, 12);
  }, [areas, remotePlaces, value]);

  function choose(match: SearchMatch) {
    if (disabled) return;
    onChange(match.kind === "local" ? match.area.name : match.place.name);
    setOpen(false);
    if (match.kind === "local") onChoose(match.area.id);
    else onChoosePlace(match.place);
  }

  function submit() {
    const chosen = matches[Math.min(activeIndex, matches.length - 1)];
    if (chosen) choose(chosen);
  }

  if (!mounted) return null;

  return createPortal(
    <div
      data-lakbay-search="true"
      style={{
        position: "fixed", top: "var(--lakbay-search-top, 22px)",
        right: "var(--lakbay-search-right, 24px)",
        width: "min(415px, calc(100vw - 32px))", zIndex: 2147482000,
        boxSizing: "border-box", fontFamily: "Arial, sans-serif", pointerEvents: "auto",
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <style>{`
        [data-lakbay-search] input::placeholder { color: #b8c6d8; opacity: 1; }
        [data-lakbay-search] input::-webkit-search-cancel-button { cursor: pointer; }
        @media (max-width: 640px) {
          [data-lakbay-search] { --lakbay-search-top: 117px; --lakbay-search-right: 16px; }
        }
      `}</style>
      <form
        role="search"
        onSubmit={(event) => { event.preventDefault(); submit(); }}
        style={{
          display: "flex", flexDirection: "row", alignItems: "center",
          gap: 6, width: "100%", height: 52, padding: 5, boxSizing: "border-box",
          borderRadius: 13, border: "1px solid rgba(255,255,255,0.3)",
          background: colors.navy, boxShadow: "0 9px 26px rgba(0,0,0,.38)",
          backdropFilter: "blur(12px)",
        }}
      >
        <label htmlFor="lakbay-search" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
          Search destinations, provinces, cities, or municipalities
        </label>
        <input
          id="lakbay-search" type="search" placeholder="Search places, provinces, cities..."
          autoComplete="off" value={value} disabled={disabled} style={inputStyle}
          aria-expanded={open && matches.length > 0}
          aria-controls="lakbay-search-suggestions"
          onFocus={() => setOpen(true)}
          onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "ArrowDown" && matches.length) {
              event.preventDefault(); setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
            }
            if (event.key === "ArrowUp" && matches.length) {
              event.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1));
            }
          }}
        />
        <button
          type="submit" disabled={disabled || matches.length === 0}
          style={{
            flex: "0 0 auto", display: "flex", alignItems: "center", gap: 7,
            justifyContent: "center", height: 40, padding: "0 14px",
            borderRadius: 9, border: 0, background: colors.yellow, color: "#071329",
            font: "700 13px Arial, sans-serif",
            cursor: disabled || matches.length === 0 ? "not-allowed" : "pointer",
            opacity: disabled ? 0.65 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>
          </svg>
          Search
        </button>
      </form>

      {open && value.trim() && (
        <div
          id="lakbay-search-suggestions"
          role="listbox"
          aria-label="Search results"
          style={{
            marginTop: 7, padding: 5, maxHeight: 320, overflowY: "auto",
            borderRadius: 11, border: "1px solid rgba(255,255,255,.22)",
            background: colors.navy, color: "white", boxShadow: "0 12px 30px #0006",
          }}
        >
          {matches.map((match, index) => (
            <button
              key={match.key} type="button" role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(match)}
              onMouseEnter={() => setActiveIndex(index)}
              style={{
                width: "100%", padding: "10px 11px", minHeight: 40,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 10, color: "white", background: index === activeIndex ? "#ffffff23" : "transparent",
                border: 0, borderRadius: 7, cursor: "pointer", textAlign: "left",
                font: "500 13px Arial, sans-serif",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span>{match.kind === "local" ? match.area.name : match.place.name}</span>
                {match.kind === "remote" && match.place.subtitle && (
                  <span style={{ color: "#b9c4d1", fontSize: 11 }}>{match.place.subtitle}</span>
                )}
              </span>
              <span style={{ fontSize: 11, color: "#efc64b", whiteSpace: "nowrap" }}>
                {match.kind === "local"
                  ? match.area.kind === "metro" ? "NCR" : match.area.kind === "city" ? "City / Municipality" : "Province"
                  : placeType(match.place)}
              </span>
            </button>
          ))}
          {searching && (
            <div style={{ padding: 12, color: "#c6d1db", fontSize: 13 }}>Searching destinations...</div>
          )}
          {!searching && matches.length === 0 && (
            <div style={{ padding: 12, color: "#c6d1db", fontSize: 13 }}>
              {searchError ? "Destination search is unavailable. Local province search still works." : "No matching place found yet."}
            </div>
          )}
        </div>
      )}
    </div>, document.body
  );
}
