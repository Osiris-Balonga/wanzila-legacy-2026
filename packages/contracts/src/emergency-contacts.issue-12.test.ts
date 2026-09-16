import { emergencyContactsResponseSchema } from "./public-api.js";
import { describe, expect, it } from "vitest";

const contact = {
  id: "00000000-0000-4000-8000-000000001401",
  label: "SAMU",
  phone: "112",
  position: 1,
  updatedAt: "2026-09-15T08:30:45.123Z",
};

describe("issue #12 emergency-contact response contract", () => {
  it("requires and preserves the authoritative ISO updatedAt timestamp", () => {
    const parsed = emergencyContactsResponseSchema.parse({ data: [contact] });

    expect(parsed.data).toEqual([contact]);
  });

  it("rejects a contact without its persisted updatedAt timestamp", () => {
    const { updatedAt, ...contactWithoutUpdatedAt } = contact;

    expect(updatedAt).toBe(contact.updatedAt);

    expect(
      emergencyContactsResponseSchema.safeParse({
        data: [contactWithoutUpdatedAt],
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed updatedAt timestamp instead of accepting browser data", () => {
    expect(
      emergencyContactsResponseSchema.safeParse({
        data: [{ ...contact, updatedAt: "yesterday" }],
      }).success,
    ).toBe(false);
  });
});
