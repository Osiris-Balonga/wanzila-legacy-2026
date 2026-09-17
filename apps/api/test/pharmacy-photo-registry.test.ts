import { describe, expect, it } from "vitest";
import { approvedPhoto } from "../src/modules/shared/pharmacy-photo-registry.js";

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
});
