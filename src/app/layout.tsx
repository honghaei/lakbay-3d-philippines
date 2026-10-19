import type { Metadata } from "next";
import "./globals.css";
import "./lakbay-tourism.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

export const metadata: Metadata = {
  title: "Lakbay | Explore the Philippines in 3D",
  description: "Explore Philippine provinces, discover tourist destinations and save your next journey in an interactive 3D map.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
