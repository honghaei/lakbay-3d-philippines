
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

const cesiumSource = path.join(
  process.cwd(),
  "node_modules",
  "cesium",
  "Build",
  "Cesium"
);

const cesiumDestination = path.join(
  process.cwd(),
  "public",
  "cesium"
);

const folders = [
  "Workers",
  "Assets",
  "Widgets",
  "ThirdParty",
];

mkdirSync(cesiumDestination, { recursive: true });

for (const folder of folders) {
  cpSync(
    path.join(cesiumSource, folder),
    path.join(cesiumDestination, folder),
    {
      recursive: true,
      force: true,
    }
  );

  console.log(`Copied: ${folder}`);
}

console.log("Lakbay: Cesium assets ready!");
