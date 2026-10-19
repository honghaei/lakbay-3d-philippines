import Link from "next/link";
import LakbayBrand from "@/components/LakbayBrand";

export default function LakbayPageNav() {
  return (
    <header className="lb-siteNav">
      <div className="lb-siteNavInner">
        <LakbayBrand compact />
        <nav aria-label="Main navigation" className="lb-navLinks">
          <Link href="/">✧ Explore 3D Map</Link>
          <Link href="/favorites" className="lb-navHighlight">♡ My Wishlist</Link>
        </nav>
      </div>
    </header>
  );
}
