# Lakbay — Interactive 3D Philippines Tourism Map

**Tuklasin ang Pilipinas.** Explore the Philippines through an interactive 3D map, discover destinations, and save places for a future trip.

[![Live application](https://img.shields.io/badge/Live%20App-Netlify-00AFAF?style=flat-square)](https://lakbay-3d-philippines.netlify.app/)
[![Case study](https://img.shields.io/badge/Portfolio-Case%20Study-30B978?style=flat-square)](https://charles-lat.netlify.app/project/lakbay-3d-philippines-tourism-map)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square)
![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square)

**[Explore Lakbay](https://lakbay-3d-philippines.netlify.app/)** · **[View screenshots and project case study](https://charles-lat.netlify.app/project/lakbay-3d-philippines-tourism-map)**

## Overview

Lakbay is a deployed tourism-discovery application focused on the Philippines. It combines **CesiumJS-powered 3D terrain**, province boundaries, province-level camera navigation, place search, tourist-destination previews, detailed destination pages, photo galleries, and a personal wishlist.

The project aims to make Philippine geographic exploration more engaging while giving visitors a starting point for discovering natural, historical, and cultural destinations.

> **Data integrity:** Lakbay's nationwide OpenStreetMap imports contain *research candidates*, not a fully verified directory. An imported record is not automatically an approved tourist attraction. Human review of the larger research collection is ongoing.

## Features

- **Interactive 3D Philippines map:** Explore national terrain and imagery with CesiumJS/Cesium ion.
- **Province exploration:** Province borders, labels, selection, and animated camera navigation.
- **Search:** Look up provinces, cities, and destinations, with search-driven map navigation.
- **Tourism markers:** Explore selected destinations and category-filtered map markers.
- **Destination previews:** Display key destination information directly in the mapping interface.
- **Destination detail pages:** Read descriptions and geographic information, browse attributed photo galleries, and open Google Maps links.
- **Travel wishlist:** Save and remove destinations; find saved locations on a dedicated searchable page. Preferences persist in the browser through local storage.
- **Responsive UI:** A tourism-inspired interface designed for different screen sizes.

Not every searchable record has a completed full destination detail page. Dynamic approved map results and the application's individually curated profile pages are separate stages of content coverage.

## Technology

| Technology | Role |
| --- | --- |
| Next.js 16 / React 19 | Application, routing, and UI |
| TypeScript | Type-safe development |
| CesiumJS / Cesium ion | 3D globe, terrain, imagery, and camera navigation |
| Supabase | Structured destination research and approved public data |
| OpenStreetMap / GeoJSON | Geographic boundaries and research inputs |
| Wikimedia Commons | Destination photography with attribution |
| GitHub | Version control |
| Netlify | Live deployment |

## How it works

```text
Browser
  ├── Interactive Cesium 3D map
  │   ├── Province GeoJSON → boundaries and labels
  │   ├── Search → province/city/destination selection
  │   └── Category filters → selected tourist markers/previews
  ├── Destination pages → details, photos, location links
  └── Wishlist → browser localStorage

Next.js API routes
  ├── Public search and approved destinations → Supabase
  └── Photo attribution / gallery data → Wikimedia Commons

Separate research workflow
  └── OSM candidate import → Supabase → screening/human review
       (pending candidates are not automatically published)
```

**Public/private separation:** The public places API explicitly restricts destination results to `review_status = approved`. The internal pending-candidate preview route is **local-development-only**, requires an explicit local preview setting, and returns 404 in production. Do not weaken these restrictions to demonstrate the project.

## Selected project structure

```text
src/
├── app/
│   ├── api/
│   │   ├── commons/
│   │   └── lakbay/
│   │       ├── places/
│   │       ├── search/
│   │       └── preview-places/    # restricted local review
│   ├── destinations/[id]/page.tsx
│   ├── favorites/page.tsx
│   ├── lakbay-tourism.css
│   └── page.tsx
├── components/
│   ├── PhilippinesMap.tsx
│   ├── MapSearch.tsx
│   ├── MapCategoryFilters.tsx
│   ├── DestinationGallery.tsx
│   └── FavoriteButton.tsx
└── lib/
    ├── mapNavigation.ts
    ├── provinceBorders.ts
    ├── provinceLabels.ts
    ├── touristPins.ts
    ├── favorites.ts
    └── lakbayDb.ts
public/data/                   # GeoJSON used in map views
scripts/copy-cesium.mjs         # prepares Cesium static assets
scripts/lakbay/                 # separate research/import tooling
supabase/01_lakbay_schema.sql   # database schema
```

This is an overview of notable files, not a complete listing.

## Run locally

### Requirements

- Node.js version compatible with Next.js 16 (Node.js 20.9+)
- npm
- A Cesium ion access token
- Supabase project credentials appropriate to the features you intend to run

### Installation

```bash
git clone https://github.com/honghaei/lakbay-3d-philippines.git
cd lakbay-3d-philippines
npm install
```

Create a **local, untracked** `.env.local` file in the project root:

```dotenv
NEXT_PUBLIC_CESIUM_ION_TOKEN=your_cesium_ion_token
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

These are **placeholders**, not operational credentials. Public/read-only functionality requires appropriate database policies and data; a fresh Supabase project does not automatically contain Lakbay's destination collection. Follow the [Supabase schema](supabase/01_lakbay_schema.sql) and configure the required public-read policies before connecting a new environment.

```bash
npm run dev
```

Open **http://localhost:3000**.

The `predev` and `prebuild` scripts automatically copy required Cesium static resources.

### Production build

```bash
npm run build
npm run start
```

### Security note

- **Never commit** `.env.local`, database administrator/service-role secrets, API credentials, or generated local review reports.
- `.gitignore` excludes environment files, local reports, and local import caches.
- `NEXT_PUBLIC_*` variables are bundled into browser code and **must not contain private secrets**. The Cesium token should be restricted to appropriate applications/domains and permissions.
- Server-only database credentials are used only where strictly required for local/internal tools; do not expose them in frontend code or public deployment settings.

## Destination coverage and verification

Lakbay's wider research database contained **approximately 14,465 imported candidates** at an earlier checked milestone. This is a *research-import count*, **not** the number of published or independently verified tourist attractions.

- Geographic records can be incomplete, duplicated, outdated, inaccessible, or incorrectly classified.
- Tourism candidates need evidence-based review of their identity, classification, location, access conditions, and image rights.
- Only approved records should be served by public discovery endpoints.
- Photo attribution and licenses are retained where available; additional sources may require their own checks.

The public application is **deployed and operational**, while nationwide tourism data curation remains **ongoing**.

## Project status

| Area | Status |
| --- | --- |
| Nationwide 3D map and province navigation | Complete |
| Search, filters, and destination previews | Implemented |
| Destination pages and photo galleries | Implemented for selected destinations |
| Personal browser-based wishlist | Complete |
| Responsive interface | Implemented |
| Netlify deployment | Live |
| Wider imported-destination verification | Ongoing |

## Future development

Potential improvements include broader human-verified destination coverage, more lesser-known natural and heritage attractions, enhanced place information, additional geographic search refinements, and continued accessibility/performance improvements.

## Data and media credits

- **Geographic data:** [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright), subject to applicable Open Database License (ODbL) terms.
- **3D visualization:** [CesiumJS and Cesium ion](https://cesium.com/).
- **Photographs:** [Wikimedia Commons](https://commons.wikimedia.org/) and credited original creators. Photo-specific author, source, and license information is displayed in destination galleries where provided.

Third-party images, geospatial data, and services remain subject to their respective licenses and terms. Publishing this source repository does **not** relicence external data or imagery.

## Developer

**Charles Jacob Lat** — Web Developer · App Developer · GoHighLevel Specialist

- **Portfolio:** https://charles-lat.netlify.app/
- **GitHub:** https://github.com/honghaei
- **Live demo:** https://lakbay-3d-philippines.netlify.app/
- **Case study:** https://charles-lat.netlify.app/project/lakbay-3d-philippines-tourism-map

---

*Lakbay — Tuklasin ang Pilipinas.*
