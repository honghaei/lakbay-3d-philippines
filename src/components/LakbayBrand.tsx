import Link from "next/link";

export default function LakbayBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`${"lb-brand"} ${compact ? "lb-brandCompact" : ""}`} aria-label="Lakbay — 3D Philippine tourism explorer">
      <svg className="lb-brandIcon" viewBox="0 0 54 48" fill="none" aria-hidden="true">
        <path d="M19 17a9 9 0 0 1 18 0" stroke="#F5C85A" strokeWidth="3.3" strokeLinecap="round" />
        <path d="M28 2v5M13 8l3.5 3M43 8l-3.5 3" stroke="#F5C85A" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M3 30c8-5 15-5 24 0s17 5 24 0M3 38c8-5 15-5 24 0s17 5 24 0" stroke="#39D0C8" strokeWidth="4" strokeLinecap="round" />
        <path d="m8 25 12-10 9 8 6-6 12 10" stroke="#F5F3DE" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <span className="lb-brandWords">
        <strong>LAKBAY</strong>
        {!compact && <small>Tuklasin ang Pilipinas</small>}
      </span>
    </Link>
  );
}
