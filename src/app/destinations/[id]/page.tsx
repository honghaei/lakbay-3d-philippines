import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DestinationGallery from "@/components/DestinationGallery";
import DestinationScenicBackdrop from "@/components/DestinationScenicBackdrop";
import FavoriteButton from "@/components/FavoriteButton";
import LakbayPageNav from "@/components/LakbayPageNav";
import { CURATED_PHOTOS } from "@/lib/curatedPhotos";
import { TOURIST_SPOTS } from "@/lib/touristSpots";
import { getDestinationDetails, getNearbyDestinations } from "@/lib/destinationDetails";

type PageProps = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return TOURIST_SPOTS.map((spot) => ({ id: spot.id }));
}

// Required by this project's Next.js 16 Cache Components configuration.
export const instant = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const spot = TOURIST_SPOTS.find((place) => place.id === id);
  if (!spot) return { title: "Destination not found | Lakbay" };
  return {
    title: `${spot.name} | Lakbay — Explore the Philippines`,
    description: getDestinationDetails(spot).overview,
  };
}

export default async function DestinationPage({ params }: PageProps) {
  const { id } = await params;
  const spot = TOURIST_SPOTS.find((place) => place.id === id);
  if (!spot) notFound();

  const detail = getDestinationDetails(spot);
  const nearby = getNearbyDestinations(spot);
  const cover = CURATED_PHOTOS[spot.id]?.[0];
  const location = [spot.city, spot.province].filter(Boolean).join(", ");
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.latitude},${spot.longitude}`)}`;


  return (
    <main className="lb-site lb-destinationPage">
      <DestinationScenicBackdrop destinationId={spot.id} initialPhoto={cover} />
      <LakbayPageNav />

      {/* The title, image, and visitor information intentionally share one stage. */}
      <section className="lb-destinationStage" aria-labelledby="place-title">
        <div className="lb-container lb-destinationStageGrid">
          <div className="lb-destinationLeadCopy">
            <p className="lb-heroKicker">{spot.category} · {location}</p>
            <h1 id="place-title">{spot.name}</h1>
            <p className="lb-heroSubtitle">{detail.overview}</p>
            <div className="lb-heroActions">
              <a href={mapHref} target="_blank" rel="noopener noreferrer" className="lb-goldButton">
                View on Google Maps ↗
              </a>
              <FavoriteButton destinationId={spot.id} />
            </div>
          </div>

          <div className="lb-destinationVisual">
            <div className="lb-destinationVisualHeading">
              <span className="lb-sectionKicker">A closer look</span>
              <h2>Explore {spot.name}</h2>
            </div>
            <div className="lb-galleryPanel" aria-label={`Photos of ${spot.name}`}>
              <DestinationGallery destinationId={spot.id} destinationName={spot.name} />
            </div>
          </div>

          <aside className="lb-destinationFacts" aria-labelledby="visit-heading">
            <div className="lb-destinationFactsHeading">
              <h2 id="visit-heading">✧ Plan your visit</h2>
              <span className="lb-destinationFactsTag">Destination guide</span>
            </div>
            <div className="lb-destinationFactsGrid">
              <div>
                <span className="lb-detailCaption">Location</span>
                <strong className="lb-detailValue">{location}</strong>
              </div>
              <div>
                <span className="lb-detailCaption">Attraction type</span>
                <strong className="lb-detailValue">{spot.category}</strong>
              </div>
              <div className="lb-destinationFactWide">
                <span className="lb-detailCaption">Coordinates</span>
                <strong className="lb-detailValue">
                  {spot.latitude.toFixed(5)}° N, {spot.longitude.toFixed(5)}° E
                </strong>
              </div>
            </div>
            <p className="lb-muted lb-destinationFactNote">
              Check current access conditions and visitor entrances before traveling.
            </p>
            <a className="lb-textLink" href={spot.sourceUrl} target="_blank" rel="noopener noreferrer">
              Geographic reference ↗
            </a>
          </aside>
        </div>
      </section>

      <section className="lb-destinationMore" aria-label="More destination information">
        <div className="lb-container lb-destinationLowerGrid">
          <div className="lb-detailColumn">
            <section className="lb-glassPanel">
              <p className="lb-sectionKicker">The story</p>
              <h2 className="lb-sectionHeading">About {spot.name}</h2>
              <p className="lb-bodyCopy">{detail.overview}</p>
            </section>

            <section className="lb-glassPanel">
              <p className="lb-sectionKicker">Travel inspiration</p>
              <h2 className="lb-sectionHeading">Things to discover</h2>
              <div className="lb-highlightGrid">
                {detail.highlights.map((highlight) => (
                  <div key={highlight} className="lb-highlightItem">
                    <span style={{ color: "#ffd76d", marginRight: 9 }} aria-hidden="true">✦</span>{highlight}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="lb-detailSidebar">
            <section className="lb-glassPanel">
              <p className="lb-sectionKicker">Keep exploring</p>
              <h2 className="lb-detailTitle">More places to explore</h2>
              {nearby.map(({ spot: other, distance }) => (
                <Link className="lb-nearbyLink" key={other.id} href={`/destinations/${other.id}`}>
                  <strong>{other.name} ↗</strong>
                  <small>{other.province} · about {Math.round(distance)} km straight-line</small>
                </Link>
              ))}
              <p className="lb-muted">Distances are approximate geographic distances, not driving times.</p>
            </section>
            <Link className="lb-outlineButton" href="/">← Return to the 3D Philippines map</Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
