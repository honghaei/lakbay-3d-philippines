
import fs from "node:fs";

// =====================================
// 1. LOAD ADM3 DATA
// =====================================

const input = JSON.parse(
  fs.readFileSync(
    "scripts/philippines-adm3-source.geojson",
    "utf8"
  )
);

// All 16 cities and 1 municipality.
const cityNames = new Map([
  ["caloocan", "Caloocan"],
  ["laspinas", "Las Piñas"],
  ["makati", "Makati"],
  ["malabon", "Malabon"],
  ["mandaluyong", "Mandaluyong"],
  ["manila", "Manila"],
  ["marikina", "Marikina"],
  ["muntinlupa", "Muntinlupa"],
  ["navotas", "Navotas"],
  ["paranaque", "Parañaque"],
  ["pasay", "Pasay"],
  ["pasig", "Pasig"],
  ["quezon", "Quezon City"],
  ["sanjuan", "San Juan"],
  ["taguig", "Taguig"],
  ["valenzuela", "Valenzuela"],
  ["pateros", "Pateros"],
]);

// =====================================
// 2. NORMALIZE LOCATION NAMES
// =====================================

function normalize(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(city|municipality|of|capital|district)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^kalookan$/, "caloocan");
}

// =====================================
// 3. GET GEOGRAPHIC CENTER
// =====================================

function getCenter(geometry) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;

  function visit(value) {
    if (
      Array.isArray(value) &&
      typeof value[0] === "number"
    ) {
      const [lon, lat] = value;

      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);

      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
    }
  }

  visit(geometry.coordinates);

  return [
    (west + east) / 2,
    (south + north) / 2,
  ];
}

// =====================================
// 4. EXTRACT NCR CITIES AND PATEROS
// =====================================

const found = new Map();

for (const feature of input.features) {
  if (!feature.geometry) continue;

  const originalName =
    feature.properties?.shapeName ?? "";

  const key = normalize(originalName);
  const displayName = cityNames.get(key);

  if (!displayName) continue;

  const [lon, lat] = getCenter(feature.geometry);

  // Restrict results to Metro Manila.
  if (
    lon < 120.85 ||
    lon > 121.2 ||
    lat < 14.3 ||
    lat > 14.9
  ) {
    continue;
  }

  found.set(displayName, {
    ...feature,
    properties: {
      ...feature.properties,
      lakbayName: displayName,
    },
  });
}

// =====================================
// 5. ADD MANILA USING ADM2 BOUNDARY
// =====================================

// ADM3 contains Manila districts rather than
// a single complete Manila city polygon.

if (!found.has("Manila")) {
  const adm2 = JSON.parse(
    fs.readFileSync(
      "public/data/philippines-provinces.geojson",
      "utf8"
    )
  );

  const manila = adm2.features.find((feature) => {
    const name =
      feature.properties?.shapeName ?? "";

    // NCR First District corresponds to Manila.
    if (!/\b(first|1st)\s*district\b/i.test(name)) {
      return false;
    }

    if (!feature.geometry) return false;

    const [lon, lat] = getCenter(feature.geometry);

    return (
      lon > 120.9 &&
      lon < 121.1 &&
      lat > 14.5 &&
      lat < 14.7
    );
  });

  if (!manila) {
    console.log(
      "Available ADM2 districts:",
      adm2.features
        .map((feature) =>
          feature.properties?.shapeName
        )
        .filter((name) =>
          /district|manila/i.test(name ?? "")
        )
    );

    throw new Error(
      "Could not identify Manila's ADM2 boundary."
    );
  }

  found.set("Manila", {
    ...manila,
    properties: {
      ...manila.properties,
      lakbayName: "Manila",
    },
  });

  console.log(
    "Manila boundary added from NCR First District."
  );
}

// =====================================
// 6. VERIFY ALL 17 NCR AREAS
// =====================================

const missing = [...cityNames.values()].filter(
  (name) => !found.has(name)
);

console.log(
  "Metro Manila areas found:",
  found.size
);

console.log("Missing:", missing);

if (missing.length > 0) {
  throw new Error(
    "Missing NCR areas. Check dataset names."
  );
}

// =====================================
// 7. EXPORT METRO MANILA GEOJSON
// =====================================

fs.mkdirSync("public/data", {
  recursive: true,
});

fs.writeFileSync(
  "public/data/metro-manila.geojson",
  JSON.stringify({
    type: "FeatureCollection",
    features: [...found.values()],
  })
);

console.log("Metro Manila GeoJSON created!");
console.log(
  "Successfully extracted all 16 cities and Pateros."
);
