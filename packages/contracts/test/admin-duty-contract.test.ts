import * as contracts from "@wanzila/contracts";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

// Runtime lookup keeps the RED contract executable before its exports exist.
function schema(name: string): ZodType {
  const candidate = (contracts as unknown as Record<string, unknown>)[name];
  expect(
    candidate,
    `${name} must be exported by @wanzila/contracts`,
  ).toBeDefined();
  return candidate as ZodType;
}

const id = "00000000-0000-4000-8000-000000004801";
const laterId = "00000000-0000-4000-8000-000000004802";
const start = "2026-09-16T08:00:00.000Z";
const end = "2026-09-16T20:00:00.000Z";

describe("admin duty/source/exception Zod contract (RED #48)", () => {
  it("validates sources and reports truthful freshness separately from updatedAt", () => {
    const create = schema("createAdminScheduleSourceRequestSchema");
    const update = schema("updateAdminScheduleSourceRequestSchema");
    const response = schema("adminScheduleSourceResponseSchema");

    const input = {
      name: "Bulletin municipal",
      description: "Officiel",
      reliability: 90,
      observedAt: start,
    };
    expect(create.parse(input)).toEqual(input);
    for (const invalid of [
      { ...input, name: " " },
      { ...input, reliability: -1 },
      { ...input, reliability: 101 },
      { ...input, reliability: 50.5 },
      { ...input, observedAt: "yesterday" },
      { ...input, unexpected: true },
    ])
      expect(create.safeParse(invalid).success).toBe(false);
    expect(update.parse({ description: null })).toEqual({ description: null });
    expect(update.safeParse({}).success).toBe(false);
    expect(update.safeParse({ reliability: 101 }).success).toBe(false);
    expect(
      response.parse({
        data: {
          id,
          ...input,
          freshness: "FRESH",
          updatedAt: end,
        },
      }),
    ).toMatchObject({ data: { id, freshness: "FRESH", observedAt: start } });
    expect(
      response.safeParse({
        data: {
          id,
          ...input,
          freshness: "UNKNOWN",
          updatedAt: end,
        },
      }).success,
    ).toBe(false);
  });

  it("requires strict duty intervals and keeps review status server-owned", () => {
    const create = schema("createAdminDutyRequestSchema");
    const update = schema("updateAdminDutyRequestSchema");
    const response = schema("adminDutyResponseSchema");
    const input = {
      pharmacyId: id,
      sourceId: laterId,
      startsAt: start,
      endsAt: end,
    };
    expect(create.parse(input)).toEqual(input);
    for (const invalid of [
      { ...input, startsAt: end },
      { ...input, endsAt: start },
      { ...input, startsAt: "2026-09-16T08:00:00" },
      { ...input, pharmacyId: "missing" },
      { ...input, status: "APPROVED" },
      { ...input, unexpected: true },
    ])
      expect(create.safeParse(invalid).success).toBe(false);
    expect(update.parse({ sourceId: null })).toEqual({ sourceId: null });
    expect(update.safeParse({}).success).toBe(false);
    expect(update.safeParse({ status: "APPROVED" }).success).toBe(false);
    expect(
      response.parse({
        data: {
          id,
          ...input,
          status: "PENDING",
          createdAt: start,
          updatedAt: end,
        },
      }),
    ).toMatchObject({ data: { id, status: "PENDING" } });
  });

  it("accepts only bounded CANCELLED/UNAVAILABLE exceptions", () => {
    const create = schema("createAdminDutyExceptionRequestSchema");
    const update = schema("updateAdminDutyExceptionRequestSchema");
    const response = schema("adminDutyExceptionResponseSchema");
    const input = {
      kind: "CANCELLED",
      startsAt: start,
      endsAt: end,
      reason: "Fermeture exceptionnelle",
    };
    expect(create.parse(input)).toEqual(input);
    expect(create.parse({ ...input, kind: "UNAVAILABLE" })).toMatchObject({
      kind: "UNAVAILABLE",
    });
    for (const invalid of [
      { ...input, kind: "CLOSED" },
      { ...input, startsAt: end },
      { ...input, endsAt: start },
      { ...input, reason: "x".repeat(256) },
      { ...input, dutyPeriodId: id },
    ])
      expect(create.safeParse(invalid).success).toBe(false);
    expect(update.safeParse({}).success).toBe(false);
    expect(update.parse({ reason: null })).toEqual({ reason: null });
    expect(
      response.parse({
        data: {
          id,
          dutyPeriodId: laterId,
          ...input,
          createdAt: start,
          updatedAt: end,
        },
      }),
    ).toMatchObject({ data: { id, dutyPeriodId: laterId, kind: "CANCELLED" } });
  });

  it("bounds list queries, validates filters, and preserves stable pagination/error envelopes", () => {
    for (const queryName of [
      "adminScheduleSourceListQuerySchema",
      "adminDutyListQuerySchema",
      "adminDutyExceptionListQuerySchema",
    ]) {
      const query = schema(queryName);
      expect(query.parse({})).toMatchObject({ page: 1, pageSize: 20 });
      for (const invalid of [
        { page: 0 },
        { pageSize: 51 },
        { unexpected: "x" },
      ]) {
        expect(query.safeParse(invalid).success).toBe(false);
      }
    }
    const dutyQuery = schema("adminDutyListQuerySchema");
    expect(
      dutyQuery.parse({
        pharmacyId: id,
        sourceId: laterId,
        status: "PENDING",
        from: start,
        to: end,
      }),
    ).toMatchObject({ pharmacyId: id, status: "PENDING" });
    for (const invalid of [
      { status: "CANCELLED" },
      { pharmacyId: "foreign" },
      { from: end, to: start },
    ]) {
      expect(dutyQuery.safeParse(invalid).success).toBe(false);
    }
    const errors = schema("adminDutyErrorSchema");
    for (const code of [
      "BAD_REQUEST",
      "NOT_FOUND",
      "AUTHENTICATION_REQUIRED",
      "ORIGIN_FORBIDDEN",
      "CONFLICT",
    ]) {
      expect(
        errors.parse({ error: { code, message: "Stable error" } }),
      ).toEqual({ error: { code, message: "Stable error" } });
    }
    expect(
      errors.safeParse({ error: { code: "SURPRISE", message: "x" } }).success,
    ).toBe(false);
  });
});
