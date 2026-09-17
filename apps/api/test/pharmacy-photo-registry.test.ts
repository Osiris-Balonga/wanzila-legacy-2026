import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  approvedPharmacyPhotos,
  approvedPhoto,
} from "../src/modules/shared/pharmacy-photo-registry.js";

const entry = {
  pharmacyId: "00000000-0000-4000-8000-000000000101",
  assetPath: "/pharmacy-photos/plateau.webp",
  source: "Photographe mandaté",
  credit: "Photo : A. Exemple",
  rights: "Autorisation archivée : PHOTO-001",
  verifiedAt: "2026-09-14T10:00:00.000Z",
};

describe("approved pharmacy photo registry", () => {
  it("requires an exact registered path and matching rights metadata", () => {
    expect(approvedPhoto(entry, entry.pharmacyId, [entry])).toBe(true);
    expect(
      approvedPhoto(
        { ...entry, assetPath: "/pharmacy-photos/other.webp" },
        entry.pharmacyId,
        [entry],
      ),
    ).toBe(false);
    expect(
      approvedPhoto({ ...entry, rights: "Unverified" }, entry.pharmacyId, [
        entry,
      ]),
    ).toBe(false);
    expect(
      approvedPhoto(entry, "00000000-0000-4000-8000-000000000102", [entry]),
    ).toBe(false);
    expect(approvedPhoto(entry, entry.pharmacyId)).toBe(false);
  });

  it("keeps every approved entry bound to an existing versioned first-party file", () => {
    for (const photo of approvedPharmacyPhotos) {
      expect(photo.pharmacyId).toMatch(/^[0-9a-f-]{36}$/);
      expect(photo.assetPath).toMatch(
        /^\/pharmacy-photos\/[a-z0-9-]+\.(?:avif|webp|jpe?g|png)$/,
      );
      const asset = path.join(
        process.cwd(),
        "apps/web/public",
        photo.assetPath.slice(1),
      );
      expect(existsSync(asset)).toBe(true);
    }
  });
});
