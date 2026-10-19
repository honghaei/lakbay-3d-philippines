"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useFavorites } from "@/lib/favorites";
import { TOURIST_SPOTS, type TouristSpot } from "@/lib/touristSpots";
import { getDestinationDetails } from "@/lib/destinationDetails";
import { CURATED_PHOTOS, type DestinationPhoto } from "@/lib/curatedPhotos";
import FavoriteButton from "@/components/FavoriteButton";
import LakbayPageNav from "@/components/LakbayPageNav";

function DestinationCover({ spot }: { spot: TouristSpot }) {
  const curated = CURATED_PHOTOS[spot.id]?.[0] ?? null;
  const [photo, setPhoto] = useState<DestinationPhoto | null>(curated);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (curated) return;
    const controller = new AbortController();
    fetch(`/api/commons?id=${encodeURIComponent(spot.id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Photo service unavailable");
        return (await response.json()) as { photos?: DestinationPhoto[] };
      })
      .then((data) => {
        if (!controller.signal.aborted && data.photos?.length) setPhoto(data.photos[0]);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [curated, spot.id]);

  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-t-2xl bg-[#183452]">
      {photo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.url}
          alt={spot.name}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-5xl text-amber-200/70" aria-hidden="true">⌖</div>
      )}
      {photo && !broken && (
        <a href={photo.source} target="_blank" rel="noopener noreferrer"
          className="absolute bottom-2 right-2 max-w-[95%] truncate rounded-md bg-[#03142f]/90 px-2 py-1 text-[10px] text-amber-200 hover:underline">
          Photo: {photo.photographer} · {photo.license} ↗
        </a>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  const { ids, count } = useFavorites();
  const [query, setQuery] = useState("");
  const spots = TOURIST_SPOTS.filter((spot) => ids.includes(spot.id));
  const visible = spots.filter((spot) =>
    `${spot.name} ${spot.province} ${spot.city ?? ""} ${spot.category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  return (
    <main
      className="lb-site"
      style={{
        "--lb-scene-image": 'url("https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/Kayangan_Lake%2C_Coron_-_Palawan.jpg/1280px-Kayangan_Lake%2C_Coron_-_Palawan.jpg")',
      } as CSSProperties}
    >
      <LakbayPageNav />

      <section className={`${"lb-pageHero"} ${"lb-wishlistHero"}`} aria-labelledby="wishlist-heading">
        {/* Scenic photo by Theglennpalacio, Wikimedia Commons, CC BY-SA 4.0. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="lb-pageHeroImage"
          src="https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/Kayangan_Lake%2C_Coron_-_Palawan.jpg/1280px-Kayangan_Lake%2C_Coron_-_Palawan.jpg"
          alt=""
          loading="lazy"
        />
        <div className="lb-pageHeroOverlay" />
        <div className={`${"lb-container"} ${"lb-pageHeroContent"}`}>
          <div className="lb-wishlistTopRow">
            <div className="lb-pageHeroCopy">
              <p className="lb-heroKicker">YOUR PERSONAL TRAVEL COLLECTION</p>
              <h1 id="wishlist-heading">My Wishlist <em>({count})</em></h1>
              <p className="lb-heroSubtitle">
                Save the places that inspire you, from storied landmarks to beautiful island escapes.
              </p>
              <Link href="/" className="lb-goldButton">Find more places ↗</Link>
            </div>
            {count > 0 && (
              <div className="lb-wishlistSearch">
                <label htmlFor="wishlist-search">Search your saved places</label>
                <input
                  id="wishlist-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search destinations..."
                />
              </div>
            )}
          </div>
        </div>
        <span className="lb-heroAttribution">
          Photo: Theglennpalacio · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> · displayed cropped · <a href="https://commons.wikimedia.org/wiki/File:Kayangan_Lake,_Coron_-_Palawan.jpg" target="_blank" rel="noopener noreferrer">source ↗</a>
        </span>
      </section>

      <div className="lb-pageBody">
        <div className="lb-container">
          <p className="lb-sectionKicker">KEEP THE WANDERLUST ALIVE</p>
          <h2 className="lb-sectionHeading">Places you want to explore</h2>
          {count === 0 ? (
            <div className="lb-emptyState">
              <div style={{ fontSize: 42, color: "#ffd774" }} aria-hidden="true">♡</div>
              <h2>Your adventures start here</h2>
              <p>Open the 3D map, choose a province, and save destinations you want to visit someday.</p>
              <Link href="/" className="lb-goldButton">Explore the Philippines →</Link>
            </div>
          ) : visible.length === 0 ? (
            <p className="lb-emptyState">No saved places match your search.</p>
          ) : (
            <div className="lb-savedGrid">
              {visible.map((spot) => (
                <article key={spot.id} className="lb-placeCard">
                  <DestinationCover spot={spot} />
                  <div className="lb-placeCardBody">
                    <p className="lb-placeCategory">{spot.category} · {spot.city ?? spot.province}</p>
                    <h2>{spot.name}</h2>
                    <p className="line-clamp-3">{getDestinationDetails(spot).overview}</p>
                    <div className="lb-placeActions">
                      <Link href={`/destinations/${spot.id}`}>View destination ↗</Link>
                      <FavoriteButton destinationId={spot.id} compact />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="lb-muted" style={{ marginTop: 27 }}>
            Wishlist entries are saved in this browser. Account synchronization will be added with Supabase.
          </p>
        </div>
      </div>
    </main>
  );
}
