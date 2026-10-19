"use client";

import { useMemo, useSyncExternalStore } from "react";
import { TOURIST_SPOTS } from "@/lib/touristSpots";

const KEY = "lakbay:favorites:v1";
const CHANGE_EVENT = "lakbay:favorites-change";
const EMPTY_SNAPSHOT = "[]";
const validIds = new Set(TOURIST_SPOTS.map((spot) => spot.id));

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(KEY) ?? EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function getServerSnapshot(): string {
  return EMPTY_SNAPSHOT;
}

function parseIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter(
      (value): value is string => typeof value === "string" && validIds.has(value)
    ))];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ids = useMemo(() => parseIds(snapshot), [snapshot]);
  const favorites = useMemo(() => new Set(ids), [ids]);

  function toggleFavorite(id: string) {
    if (!validIds.has(id)) return;
    const updated = new Set(parseIds(getSnapshot()));
    if (updated.has(id)) updated.delete(id);
    else updated.add(id);
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...updated]));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch (error) {
      console.error("Lakbay couldn't save this wishlist change:", error);
    }
  }

  return {
    ids,
    count: ids.length,
    isFavorite: (id: string) => favorites.has(id),
    toggleFavorite,
  };
}
