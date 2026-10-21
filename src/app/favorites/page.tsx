"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
    <div className="lb-savedCover relative aspect-[16/9] overflow-hidden rounded-t-2xl bg-[#183452]">
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
    <main className="lb-site lb-wishlistPage">
      {/* One image layer stays fixed behind the entire wishlist, without any repeated sections. */}
      <div className="lb-wishlistScene" aria-hidden="true">
        {/* Scenic photo by Theglennpalacio, Wikimedia Commons, CC BY-SA 4.0. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/Kayangan_Lake%2C_Coron_-_Palawan.jpg/1280px-Kayangan_Lake%2C_Coron_-_Palawan.jpg"
          alt=""
        />
      </div>
      <LakbayPageNav />

      <div className="lb-wishlistContent">
        <div className="lb-container">
          <header className="lb-wishlistDashboardHead">
            <div className="lb-wishlistIntroduction">
              <p className="lb-heroKicker">YOUR PERSONAL TRAVEL COLLECTION</p>
              <h1 id="wishlist-heading">My Wishlist <em>({count})</em></h1>
              <p className="lb-heroSubtitle">
                Keep your favorite destinations in one place and come back whenever inspiration strikes.
              </p>
            </div>
            <Link href="/" className="lb-goldButton lb-wishlistExplore">Explore 3D Map ↗</Link>
          </header>

          <section className="lb-wishlistOverview" aria-labelledby="saved-places-heading">
            <div className="lb-wishlistOverviewTitle">
              <p className="lb-sectionKicker">KEEP THE WANDERLUST ALIVE</p>
              <h2 id="saved-places-heading">Places you want to explore</h2>
              <p>Memorable places, collected for your next Philippine adventure.</p>
            </div>
            <div className="lb-wishlistHeaderTools">
              <span className="lb-wishlistCountBadge">{count} saved {count === 1 ? "place" : "places"}</span>
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
          </section>

          {count === 0 ? (
            <div className="lb-emptyState">
              <div style={{ fontSize: 42, color: "#ffd774" }} aria-hidden="true">♡</div>
              <h2>Your adventures start here</h2>
              <p>Open the 3D map, choose a province, and save destinations you want to visit someday.</p>
              <Link href="/" className="lb-goldButton">Explore the Philippines →</Link>
            </div>
          ) : visible.length === 0 ? (
            <div className="lb-emptyState" role="status">
              <h2>No matching destinations</h2>
              <p>Try another name, province, or category.</p>
            </div>
          ) : (
            <section
              className={`lb-savedGrid ${visible.length === 1 ? "lb-savedGridSolo" : visible.length === 2 ? "lb-savedGridPair" : ""}`}
              aria-label="Saved destinations"
            >
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
            </section>
          )}

          <footer className="lb-wishlistFooter">
            <p>Wishlist entries are saved in this browser. Account synchronization will be added with Supabase.</p>
            <p>
              Background photo: Theglennpalacio · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> · displayed cropped · <a href="https://commons.wikimedia.org/wiki/File:Kayangan_Lake,_Coron_-_Palawan.jpg" target="_blank" rel="noopener noreferrer">source ↗</a>
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
