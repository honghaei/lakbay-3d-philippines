import { TOURIST_SPOTS, type TouristSpot } from "@/lib/touristSpots";

export type DestinationDetails = {
  overview: string;
  highlights: string[];
  photoSearch: string;
};

const DETAILS: Record<string, DestinationDetails> = {
  "barasoain-church": {
    overview: "A landmark church in Malolos associated with the First Philippine Republic and the country's constitutional history. Its architecture and historic setting make it a notable stop for visitors interested in Philippine heritage.",
    highlights: ["Historic church architecture", "Philippine revolutionary history", "Heritage sights around Malolos"],
    photoSearch: "Barasoain Church Malolos",
  },
  "malolos-heritage": {
    overview: "The historic center of Malolos contains buildings and streets associated with Bulacan's cultural and political past. Explore its heritage sites while respecting active public spaces and private properties.",
    highlights: ["Historic streets and buildings", "Local heritage", "Nearby Malolos landmarks"],
    photoSearch: "Malolos heritage Bulacan",
  },
  "miagao-church": {
    overview: "The Church of Santo Tomas de Villanueva in Miagao is known for its distinctive Baroque facade. It is part of the UNESCO-listed Baroque Churches of the Philippines.",
    highlights: ["Ornate stone facade", "Religious heritage", "UNESCO World Heritage listing"],
    photoSearch: "Miagao Church Iloilo",
  },
  "molo-church": {
    overview: "A prominent Gothic-inspired church in Iloilo City, Molo Church is a well-known architectural and historical landmark in the Molo district.",
    highlights: ["Gothic-inspired architecture", "Religious and local history", "Iloilo City heritage"],
    photoSearch: "Molo Church Iloilo",
  },
  "cagbalete-island": {
    overview: "An island destination off Mauban in Quezon known for its shoreline, coastal scenery, and laid-back atmosphere. Visit arrangements and marine conditions should be checked locally.",
    highlights: ["Island coastline", "Beach scenery", "Coastal nature"],
    photoSearch: "Cagbalete Island Quezon",
  },
  "kamay-ni-hesus": {
    overview: "A pilgrimage and religious tourism destination in Lucban, Quezon, recognized for its hillside setting and devotional attractions.",
    highlights: ["Pilgrimage destination", "Hillside views", "Religious sculptures"],
    photoSearch: "Kamay ni Hesus Lucban",
  },
  "pinto-art-museum": {
    overview: "An art museum in Antipolo known for its collections, galleries, distinctive buildings, and landscaped grounds. Check the museum's official information before visiting.",
    highlights: ["Art galleries", "Architectural spaces", "Landscaped grounds"],
    photoSearch: "Pinto Art Museum Antipolo",
  },
  "hinulugang-taktak": {
    overview: "A waterfall and protected landscape in Antipolo. It is a recognizable natural landmark associated with Rizal province.",
    highlights: ["Waterfall", "Natural landscape", "Antipolo sightseeing"],
    photoSearch: "Hinulugang Taktak Antipolo",
  },
  "taal-volcano": {
    overview: "An active volcanic complex within Taal Lake in Batangas. Views of the volcano and lake are a regional highlight; access restrictions can change because of volcanic activity.",
    highlights: ["Volcano and lake views", "Distinctive volcanic landscape", "Check PHIVOLCS advisories"],
    photoSearch: "Taal Volcano Batangas",
  },
  "mayon-volcano": {
    overview: "A well-known active stratovolcano in Albay, admired for its symmetrical cone and dramatic scenery. Follow local authorities' safety instructions and current volcanic advisories.",
    highlights: ["Volcanic scenery", "Albay viewpoints", "Check PHIVOLCS advisories"],
    photoSearch: "Mayon Volcano Albay",
  },
  "kawasan-falls": {
    overview: "A series of waterfalls in Badian, Cebu, known for its blue-green water and nature tourism. Activity availability and local access regulations can vary.",
    highlights: ["Waterfalls", "Nature photography", "Guided adventure activities nearby"],
    photoSearch: "Kawasan Falls Badian Cebu",
  },
  "chocolate-hills": {
    overview: "A landscape of numerous rounded hills in Bohol, famous for the seasonal brown appearance that inspired its name. Viewpoints offer wide panoramas of this distinctive geological formation.",
    highlights: ["Panoramic viewpoints", "Unusual landforms", "Bohol scenery"],
    photoSearch: "Chocolate Hills Bohol",
  },
  "puerto-princesa-river": {
    overview: "An underground river and national park in Palawan recognized as a UNESCO World Heritage site. Guided visits operate under local conservation and access rules.",
    highlights: ["Underground river", "Protected natural landscape", "UNESCO World Heritage listing"],
    photoSearch: "Puerto Princesa Subterranean River",
  },
  "rizal-park": {
    overview: "A major public park in Manila associated with the history and commemoration of José Rizal. The area includes monuments, gardens, and open spaces.",
    highlights: ["Rizal Monument", "Philippine history", "Urban gardens and open space"],
    photoSearch: "Rizal Park Luneta Manila",
  },
  "quezon-memorial-circle": {
    overview: "A large public park and landmark in Quezon City centered on the Quezon Memorial Shrine. It is a popular destination for recreation and sightseeing.",
    highlights: ["Quezon Memorial Shrine", "Public gardens", "City recreation"],
    photoSearch: "Quezon Memorial Circle",
  },
};

export function getDestinationDetails(spot: TouristSpot): DestinationDetails {
  return DETAILS[spot.id] ?? {
    overview: `Discover ${spot.name} in ${spot.province}. More verified visitor information will be added as Lakbay grows.`,
    highlights: [spot.category, "Explore this destination"],
    photoSearch: `${spot.name} ${spot.province}`,
  };
}

export function distanceKm(a: TouristSpot, b: TouristSpot): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function getNearbyDestinations(spot: TouristSpot, count = 3) {
  return TOURIST_SPOTS
    .filter((other) => other.id !== spot.id)
    .map((other) => ({ spot: other, distance: distanceKm(spot, other) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}
