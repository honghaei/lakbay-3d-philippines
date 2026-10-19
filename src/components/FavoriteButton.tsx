"use client";

import { useFavorites } from "@/lib/favorites";

type Props = {
  destinationId: string;
  compact?: boolean;
};

export default function FavoriteButton({ destinationId, compact = false }: Props) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const saved = isFavorite(destinationId);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from my wishlist" : "Save to my wishlist"}
      onClick={() => toggleFavorite(destinationId)}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
        saved
          ? "border-amber-300/70 bg-amber-300 text-[#062431] hover:bg-amber-200"
          : "border-white/25 bg-[#14505b] text-white hover:border-amber-300 hover:bg-[#207080]"
      }`}
    >
      <span aria-hidden="true" className="text-lg leading-none">{saved ? "♥" : "♡"}</span>
      {compact ? (saved ? "Saved" : "Save") : (saved ? "Saved to Wishlist" : "Save to Wishlist")}
    </button>
  );
}
