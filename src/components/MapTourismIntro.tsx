"use client";

import Link from "next/link";
import LakbayBrand from "@/components/LakbayBrand";
import { CURATED_PHOTOS } from "@/lib/curatedPhotos";

const highlights = [
  { id: "chocolate-hills", title: "Natural wonders", place: "Chocolate Hills · Bohol" },
  { id: "barasoain-church", title: "Heritage & history", place: "Barasoain Church · Bulacan" },
  { id: "mayon-volcano", title: "Mountain escapes", place: "Mayon Volcano · Albay" },
];

export default function MapTourismIntro({
  selectedArea,
  exploreStarted,
  favoriteCount,
  onExplore,
}: {
  selectedArea: string | null;
  exploreStarted: boolean;
  favoriteCount: number;
  onExplore: () => void;
}) {
  return (
    <>
      <div className="lb-mapBrand">
        <LakbayBrand />
      </div>
      <Link href="/favorites" className="lb-mapWishlist">
        <span aria-hidden="true">♡</span> My Wishlist <b>{favoriteCount}</b>
      </Link>

      {!selectedArea && !exploreStarted && (
        <>
          <div className="lb-mapScenicBackdrop" aria-hidden="true" />
          <section className="lb-mapWelcome" aria-label="Welcome to Lakbay">
            <p className="lb-eyebrow">YOUR JOURNEY STARTS HERE</p>
            <h1>Discover the beauty of <em>the Philippines.</em></h1>
            <p className="lb-mapWelcomeCopy">
              From mountain peaks to island shores, explore the landscapes, traditions,
              and remarkable places that make our country unforgettable.
            </p>
            <button type="button" onClick={onExplore} className="lb-goldButton">
              Start exploring <span aria-hidden="true">↗</span>
            </button>
            <div className="lb-mapFacts">
              <span>✺ Real 3D terrain</span>
              <span>✦ Discover local heritage</span>
            </div>
            <p className="lb-mapScenicCredit">
              Palawan photo: <a href="https://commons.wikimedia.org/wiki/File:Kayangan_Lake,_Coron_-_Palawan.jpg"
                target="_blank" rel="noopener noreferrer">Theglennpalacio (CC BY-SA 4.0)</a>
            </p>
          </section>
          <aside className="lb-mapInspiration" aria-label="Featured destinations">
            <p className="lb-mapInspirationTitle">A little inspiration for your next trip</p>
            <div className="lb-mapInspirationCards">
              {highlights.map((place) => {
                const image = CURATED_PHOTOS[place.id]?.[0];
                return (
                  <Link key={place.id} href={`/destinations/${place.id}`} className="lb-mapInspirationCard">
                    {image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image.url} alt={image.name} loading="lazy" />
                    )}
                    <span className="lb-inspirationOverlay">
                      <strong>{place.title}</strong>
                      <small>{place.place}</small>
                    </span>
                  </Link>
                );
              })}
            </div>
            <p className="lb-mapPhotoCredit">
              Photos: Wikimedia Commons contributors. Credits on destination pages.
            </p>
          </aside>
        </>
      )}
    </>
  );
}
