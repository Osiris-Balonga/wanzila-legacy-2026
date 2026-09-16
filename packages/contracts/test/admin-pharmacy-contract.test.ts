import {
  adminPharmacyListQuerySchema,
  adminPharmacyResponseSchema,
  createAdminPharmacyRequestSchema,
  updateAdminPharmacyRequestSchema,
} from "@wanzila/contracts";
import { describe, expect, it } from "vitest";

const pharmacyInput = {
  name: "Pharmacie Contrat",
  address: {
    line: "42 avenue de la Paix",
    district: "Plateau",
    arrondissement: "Poto-Poto",
  },
  phone: "+242060009999",
  coordinates: { latitude: -4.263708, longitude: 15.242885 },
};

describe("admin pharmacy contracts", () => {
  it("keeps request, query, and response objects strict", () => {
    expect(() =>
      createAdminPharmacyRequestSchema.parse({ ...pharmacyInput, extra: true }),
    ).toThrow();
    expect(() => updateAdminPharmacyRequestSchema.parse({})).toThrow(
      "At least one pharmacy field is required.",
    );
    expect(() =>
      adminPharmacyListQuerySchema.parse({ status: "PUBLISHED", extra: "no" }),
    ).toThrow();
    expect(() =>
      adminPharmacyResponseSchema.parse({
        data: {
          id: "00000000-0000-4000-8000-000000009301",
          ...pharmacyInput,
          status: "DRAFT",
          createdAt: "2026-09-15T12:00:00.000Z",
          updatedAt: "2026-09-15T12:00:00.000Z",
          extra: true,
        },
      }),
    ).toThrow();
  });

  it("rejects unusable contact numbers and out-of-range coordinates", () => {
    expect(
      createAdminPharmacyRequestSchema.safeParse({
        ...pharmacyInput,
        phone: "not a telephone",
      }).success,
    ).toBe(false);
    expect(
      createAdminPharmacyRequestSchema.safeParse({
        ...pharmacyInput,
        coordinates: { latitude: 95, longitude: 15.2 },
      }).success,
    ).toBe(false);
  });

  it("allows clearing an existing phone without accepting null on create", () => {
    expect(updateAdminPharmacyRequestSchema.parse({ phone: null })).toEqual({
      phone: null,
    });
    expect(
      createAdminPharmacyRequestSchema.safeParse({
        ...pharmacyInput,
        phone: null,
      }).success,
    ).toBe(false);
  });
});
