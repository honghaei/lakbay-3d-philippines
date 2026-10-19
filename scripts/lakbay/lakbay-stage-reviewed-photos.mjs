
/**
 * Lakbay — stage reviewer-confirmed Commons images, as PENDING only.
 * DEFAULT (no flags): READ ONLY dry run. No records modified.
 * Writing requires BOTH --apply and --confirm-pending-only.
 * Only 11 explicit photo URLs, chosen by reviewer; 9 rejected excluded.
 * NEVER auto-approves a photo or destination; does not update photo_checked_at.
 */
import { getAdmin } from "./_core.mjs";

const PHOTOS = [
  {
    name: "Asik-Asik Falls",
    province: "Cotabato",
    destination_id: "82276694-705a-413f-853d-dd1bbe73ec72",
    photo_url: "https://upload.wikimedia.org/wikipedia/commons/e/e6/Asik-asik_Falls%2C_Alamada%2C_Cotabato.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail_unscaled",
    source_url: "https://commons.wikimedia.org/wiki/File:Asik-asik_Falls,_Alamada,_Cotabato.jpg",
    caption: "Asik-asik Falls, Alamada, Cotabato.jpg",
    photographer: "Jyppe Quidores",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
    review_status: "pending"
  },
  {
    name: "Asik-Asik Falls",
    province: "Cotabato",
    destination_id: "82276694-705a-413f-853d-dd1bbe73ec72",
    photo_url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2c/Asik-Asik_Falls%2C_Alamada%2C_North_Cotabato.jpg/1280px-Asik-Asik_Falls%2C_Alamada%2C_North_Cotabato.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    source_url: "https://commons.wikimedia.org/wiki/File:Asik-Asik_Falls,_Alamada,_North_Cotabato.jpg",
    caption: "Asik-Asik Falls, Alamada, North Cotabato.jpg",
    photographer: "Jprizal2022",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
    review_status: "pending"
  },
  {
    name: "Aliwagwag Falls",
    province: "Davao Oriental",
    destination_id: "8bd0f826-baf9-49f8-b47b-721036c893de",
    photo_url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/52/Aliwagwag_Falls%2C_Cateel%2C_Davao_Oriental.jpg/1280px-Aliwagwag_Falls%2C_Cateel%2C_Davao_Oriental.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    source_url: "https://commons.wikimedia.org/wiki/File:Aliwagwag_Falls,_Cateel,_Davao_Oriental.jpg",
    caption: "Aliwagwag Falls, Cateel, Davao Oriental.jpg",
    photographer: "Aranaleltote",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
    review_status: "pending"
  },
  {
    name: "Tappiya Falls",
    province: "Ifugao",
    destination_id: "a497f901-d007-4a02-ba47-d79f4d0854e7",
    photo_url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/43/Tappia_Falls%2C_Banaue%2C_Ifugao.jpg/1280px-Tappia_Falls%2C_Banaue%2C_Ifugao.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    source_url: "https://commons.wikimedia.org/wiki/File:Tappia_Falls,_Banaue,_Ifugao.jpg",
    caption: "Tappia Falls, Banaue, Ifugao.jpg",
    photographer: "Lawrence Ruiz",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
    review_status: "pending"
  },
  {
    name: "Tappiya Falls",
    province: "Ifugao",
    destination_id: "a497f901-d007-4a02-ba47-d79f4d0854e7",
    photo_url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6b/Tappiyah_Waterfalls.jpg/1280px-Tappiyah_Waterfalls.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    source_url: "https://commons.wikimedia.org/wiki/File:Tappiyah_Waterfalls.jpg",
    caption: "Tappiyah Waterfalls.jpg",
    photographer: "Ranieljosecastaneda",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
    review_status: "pending"
  },
  {
    name: "Tappiya Falls",
    province: "Ifugao",
    destination_id: "a497f901-d007-4a02-ba47-d79f4d0854e7",
    photo_url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/39/Tappiya_Falls_%28Batad%2C_Banaue%2C_Ifugao%3B_11-26-2022%29.jpg/1280px-Tappiya_Falls_%28Batad%2C_Banaue%2C_Ifugao%3B_11-26-2022%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    source_url: "https://commons.wikimedia.org/wiki/File:Tappiya_Falls_(Batad,_Banaue,_Ifugao;_11-26-2022).jpg",
    caption: "Tappiya Falls (Batad, Banaue, Ifugao; 11-26-2022).jpg",
    photographer: "Patrickroque01",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
    review_status: "pending"
  },
  {
    name: "Pagsanjan Falls",
    province: "Laguna",
    destination_id: "063a6315-c81e-422b-a587-dfc5afa83b54",
    photo_url: "https://upload.wikimedia.org/wikipedia/commons/0/02/Pagsanjan_Falls.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail_unscaled",
    source_url: "https://commons.wikimedia.org/wiki/File:Pagsanjan_Falls.jpg",
    caption: "Pagsanjan Falls.jpg",
    photographer: "Angelo Juan Ramos",
    license: "CC BY 2.0",
    license_url: "https://creativecommons.org/licenses/by/2.0",
    review_status: "pending"
  },
  {
    name: "Fort of Cuyo",
    province: "Palawan",
    destination_id: "b697b8c9-8365-4497-80fc-a14943c88a3e",
    photo_url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/Fort_Cuyo.jpg/1280px-Fort_Cuyo.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    source_url: "https://commons.wikimedia.org/wiki/File:Fort_Cuyo.jpg",
    caption: "Fort Cuyo.jpg",
    photographer: "National Historical Commission of the Philippines",
    license: "Public domain",
    license_url: null,
    review_status: "pending"
  },
  {
    name: "Tinuy-an Falls",
    province: "Surigao del Sur",
    destination_id: "c4d99b4d-b29f-422e-9fcd-85dd19e2e1d8",
    photo_url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Tinuy-an_falls_5_mikepeligro.jpg/1280px-Tinuy-an_falls_5_mikepeligro.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    source_url: "https://commons.wikimedia.org/wiki/File:Tinuy-an_falls_5_mikepeligro.jpg",
    caption: "Tinuy-an falls 5 mikepeligro.jpg",
    photographer: "Michael E. Peligro",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
    review_status: "pending"
  },
  {
    name: "Tinuy-an Falls",
    province: "Surigao del Sur",
    destination_id: "c4d99b4d-b29f-422e-9fcd-85dd19e2e1d8",
    photo_url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b7/Tinuy-an_Falls%2C_Bislig_City.jpg/1280px-Tinuy-an_Falls%2C_Bislig_City.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    source_url: "https://commons.wikimedia.org/wiki/File:Tinuy-an_Falls,_Bislig_City.jpg",
    caption: "Tinuy-an Falls, Bislig City.jpg",
    photographer: "Billy Palatino",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
    review_status: "pending"
  },
  {
    name: "Tinuy-an Falls",
    province: "Surigao del Sur",
    destination_id: "c4d99b4d-b29f-422e-9fcd-85dd19e2e1d8",
    photo_url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/27/TINY-AN_FALLS.jpg/1280px-TINY-AN_FALLS.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    source_url: "https://commons.wikimedia.org/wiki/File:TINY-AN_FALLS.jpg",
    caption: "TINY-AN FALLS.jpg",
    photographer: "Rollymagpayo",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
    review_status: "pending"
  }
];

const db = getAdmin();

const flags = new Set(process.argv.slice(2));
const permitted = new Set([
  "--apply",
  "--confirm-pending-only"
]);

for (const flag of flags) {
  if (!permitted.has(flag)) {
    throw new Error(`Unknown argument: ${flag}`);
  }
}

const apply =
  flags.has("--apply") &&
  flags.has("--confirm-pending-only");

if (
  flags.has("--apply") &&
  !flags.has("--confirm-pending-only")
) {
  throw new Error("Refusing writes without --confirm-pending-only");
}

const destinationIds = [
  ...new Set(PHOTOS.map(p => p.destination_id))
];

if (PHOTOS.length !== 11 || destinationIds.length !== 6) {
  throw new Error(
    "Unexpected scope. Expected exactly 11 photos for 6 destinations."
  );
}

if (new Set(PHOTOS.map(p => p.source_url)).size !== 11) {
  throw new Error("Duplicate photo source URLs in the staging selection.");
}

for (const p of PHOTOS) {
  if (
    p.review_status !== "pending" ||
    !p.source_url.startsWith(
      "https://commons.wikimedia.org/wiki/File:"
    ) ||
    !/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(
      p.photo_url
    ) ||
    !/^(?:CC BY(?:-SA)? [0-9.]+|Public domain)$/.test(
      p.license
    )
  ) {
    throw new Error(
      `Invalid photo metadata: ${p.name} (${p.source_url})`
    );
  }
}

const { data: places, error: placeError } = await db
  .from("lakbay_destinations")
  .select("id,name,province,review_status")
  .in("id", destinationIds);

if (placeError) {
  throw new Error(placeError.message);
}

if ((places || []).length !== destinationIds.length) {
  throw new Error(
    `Only ${places?.length || 0}/${destinationIds.length} destinations were found. No writes.`
  );
}

const placeMap = new Map(
  places.map(p => [p.id, p])
);

for (const photo of PHOTOS) {
  const place = placeMap.get(photo.destination_id);

  if (
    place.name.trim().toLowerCase() !== photo.name.toLowerCase() ||
    place.province.trim().toLowerCase() !== photo.province.toLowerCase() ||
    place.review_status === "rejected"
  ) {
    throw new Error(
      `Destination mismatch or rejected: ${photo.name}. No writes.`
    );
  }
}

const { data: existing, error: existingError } = await db
  .from("lakbay_photos")
  .select("destination_id,source_url,review_status")
  .in("destination_id", destinationIds);

if (existingError) {
  throw new Error(existingError.message);
}

const existingKeys = new Set(
  (existing || []).map(
    p => `${p.destination_id}::${p.source_url}`
  )
);

const inserts = PHOTOS.filter(
  p => !existingKeys.has(
    `${p.destination_id}::${p.source_url}`
  )
);

console.log(
  `Scope checked: ${PHOTOS.length} photos / ${destinationIds.length} attractions.`
);

for (const [i, p] of PHOTOS.entries()) {
  const exists = existingKeys.has(
    `${p.destination_id}::${p.source_url}`
  );

  console.log(
    `${i + 1}. ${p.name}: ${
      exists ? "ALREADY EXISTS" : "NEW PENDING PHOTO"
    } — ${p.caption}`
  );
}

console.log(
  `Already stored: ${PHOTOS.length - inserts.length}. New pending: ${inserts.length}.`
);

if (!apply) {
  console.log("DRY RUN COMPLETE. Supabase changes: 0.");
  console.log(
    "Do not use --apply until the staging operation is authorized."
  );
} else {
  for (const p of inserts) {
    const { name, province, ...row } = p;

    const { error } = await db
      .from("lakbay_photos")
      .upsert(row, {
        onConflict: "destination_id,source_url",
        ignoreDuplicates: true
      });

    if (error) {
      throw new Error(
        `Insert failed for ${name}: ${error.message}`
      );
    }
  }

  console.log(
    `Staging complete. Added up to ${inserts.length} photos with review_status=pending.`
  );

  console.log(
    "Destination approvals changed: 0. Photo approvals changed: 0."
  );
}
