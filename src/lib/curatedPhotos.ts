/**
 * Editorially selected Wikimedia Commons photos.
 * Keep author, license, and source page beside each image.
 * The image URLs are Wikimedia-hosted thumbnails (not copied into the app).
 */
export type DestinationPhoto = {
  url: string;
  source: string;
  name: string;
  photographer: string;
  license: string;
  licenseUrl?: string;
};

export const CURATED_PHOTOS: Record<string, DestinationPhoto[]> = {
  "barasoain-church": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c2/Barasoain_Church_in_Malolos_City.JPG/960px-Barasoain_Church_in_Malolos_City.JPG",
      source: "https://commons.wikimedia.org/wiki/File:Barasoain_Church_in_Malolos_City.JPG",
      name: "Barasoain Church in Malolos City",
      photographer: "Aerous",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/Barasoain_Church%2C_Paseo_Del_Congreso_NB%2C_Catmon_drone_%28Malolos%2C_Bulacan%3B_06-15-2026%29.jpg/960px-Barasoain_Church%2C_Paseo_Del_Congreso_NB%2C_Catmon_drone_%28Malolos%2C_Bulacan%3B_06-15-2026%29.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Barasoain_Church,_Paseo_Del_Congreso_NB,_Catmon_drone_(Malolos,_Bulacan;_06-15-2026).jpg",
      name: "Aerial view of Barasoain Church and Malolos",
      photographer: "Patrickroque01",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  ],
  "chocolate-hills": [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Chocolate_Hills_-_Bohol.jpg/960px-Chocolate_Hills_-_Bohol.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Chocolate_Hills_-_Bohol.jpg",
      name: "Chocolate Hills in Bohol",
      photographer: "WichadofOz",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  ],
  "mayon-volcano": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Mayon_Volcano%2C_Albay.jpg/960px-Mayon_Volcano%2C_Albay.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Mayon_Volcano,_Albay.jpg",
      name: "Mayon Volcano in Albay",
      photographer: "Kleervyu",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  ],
};
