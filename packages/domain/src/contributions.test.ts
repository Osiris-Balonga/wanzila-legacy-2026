import { describe, expect, it } from "vitest";
import { canonicalPharmacyKey, duplicateIndicators } from "./contributions.js";

const submitted = {
  id: "proposal",
  name: " Pharmacie  Lumière ",
  phone: "+242 06 000 0000",
  address: "12 Rue Centrale",
  district: "Centre",
  arrondissement: "Poto-Poto",
  latitude: -4.26,
  longitude: 15.24,
};

describe("pharmacy contribution duplicate facts", () => {
  it("normalizes exact name and address and reports other independent facts", () => {
    const existing = {
      ...submitted,
      id: "pharmacy",
      name: "pharmacie lumière",
      phone: "+242060000000",
      address: "12 rue centrale",
    };
    expect(canonicalPharmacyKey(submitted)).toBe(
      canonicalPharmacyKey(existing),
    );
    expect(
      duplicateIndicators(submitted, [{ target: "PHARMACY", value: existing }]),
    ).toEqual([
      { kind: "EXACT_NAME_ADDRESS", target: "PHARMACY", id: "pharmacy" },
      { kind: "PHONE", target: "PHARMACY", id: "pharmacy" },
      { kind: "NEARBY", target: "PHARMACY", id: "pharmacy", distanceMeters: 0 },
    ]);
  });

  it("does not infer a duplicate from missing coordinates", () => {
    const other = {
      ...submitted,
      id: "other",
      name: "Autre",
      phone: null,
      address: "Ailleurs",
      latitude: null,
      longitude: null,
    };
    expect(
      duplicateIndicators(submitted, [
        { target: "CONTRIBUTION", value: other },
      ]),
    ).toEqual([]);
  });
});
