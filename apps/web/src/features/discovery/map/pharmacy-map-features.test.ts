import { describe, expect, it } from "vitest";
import { toPharmacyFeatures } from "./pharmacy-map-features.js";

describe("map pharmacy features", () => {
  it("keeps only finite in-range coordinates without changing the source list", () => {
    const pharmacies = [
      {
        id: "valid",
        name: "Pharmacie Jagger",
        coordinates: { latitude: -4.26, longitude: 15.24 },
      },
      { id: "missing", name: "Sans position" },
      {
        id: "invalid",
        name: "Position invalide",
        coordinates: { latitude: 95, longitude: 15.25 },
      },
      {
        id: "nan",
        name: "Nombre invalide",
        coordinates: { latitude: Number.NaN, longitude: 15.25 },
      },
    ];

    expect(toPharmacyFeatures(pharmacies)).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [15.24, -4.26] },
          properties: { id: "valid", name: "Pharmacie Jagger" },
        },
      ],
    });
    expect(pharmacies).toHaveLength(4);
  });
});
