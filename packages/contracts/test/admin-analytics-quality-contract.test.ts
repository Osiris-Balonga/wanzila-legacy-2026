import * as contracts from "@wanzila/contracts";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

// Runtime lookup keeps this RED suite executable before the contract export exists.
function schema(name: string): ZodType {
  const candidate = (contracts as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} must be exported`).toBeDefined();
  return candidate as ZodType;
}

const sourceId = "00000000-0000-4000-8000-000000006101";
const asOf = "2026-09-16T12:00:00.000Z";

function validResponse() {
  return {
    data: {
      version: 1,
      asOf,
      timeZone: "Africa/Brazzaville",
      sources: {
        data: [
          {
            id: sourceId,
            name: "Bulletin municipal",
            description: null,
            observedAt: "2026-09-16T06:00:00.000Z",
            reliability: 90,
            freshness: "FRESH",
            currentApprovedDutyPeriods: 1,
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        totals: {
          registered: 1,
          fresh: 1,
          stale: 0,
          withSourceCurrentDutyPeriods: 1,
          withoutSourceCurrentDutyPeriods: 0,
          currentDutyPeriodsAfterExceptions: 1,
        },
      },
      coverage: {
        data: [
          {
            arrondissement: "Poto-Poto",
            publishedPharmacies: 2,
            withCurrentApprovedDuty: 1,
            ratio: 0.5,
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        totals: {
          publishedPharmacies: 2,
          withCurrentApprovedDuty: 1,
          ratio: 0.5,
        },
      },
    },
  };
}

describe("admin analytics quality detail contract (RED #61)", () => {
  it("bounds two independent pages with a strict query", () => {
    const query = schema("adminAnalyticsQualityQuerySchema");
    expect(query.parse({})).toEqual({
      sourcePage: 1,
      sourcePageSize: 20,
      coveragePage: 1,
      coveragePageSize: 20,
    });
    expect(
      query.parse({
        sourcePage: "2",
        sourcePageSize: "50",
        coveragePage: "3",
        coveragePageSize: "1",
      }),
    ).toEqual({
      sourcePage: 2,
      sourcePageSize: 50,
      coveragePage: 3,
      coveragePageSize: 1,
    });
    for (const invalid of [
      { sourcePage: 0 },
      { sourcePageSize: 51 },
      { coveragePage: -1 },
      { coveragePageSize: 0 },
      { sourcePage: "1.5" },
      { page: 1 },
    ])
      expect(query.safeParse(invalid).success).toBe(false);
  });

  it("accepts only persisted source evidence and coverage, with nullable zero-denominator ratio", () => {
    const response = schema("adminAnalyticsQualityResponseSchema");
    const valid = validResponse();
    expect(response.parse(valid)).toEqual(valid);
    const empty = {
      ...valid,
      data: {
        ...valid.data,
        sources: {
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          totals: {
            registered: 0,
            fresh: 0,
            stale: 0,
            withSourceCurrentDutyPeriods: 0,
            withoutSourceCurrentDutyPeriods: 0,
            currentDutyPeriodsAfterExceptions: 0,
          },
        },
        coverage: {
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          totals: {
            publishedPharmacies: 0,
            withCurrentApprovedDuty: 0,
            ratio: null,
          },
        },
      },
    };
    expect(response.parse(empty)).toEqual(empty);
  });

  it("rejects invented quality scores/frequencies, personal traces and invalid counts", () => {
    const response = schema("adminAnalyticsQualityResponseSchema");
    const valid = validResponse();
    const source = valid.data.sources.data[0];
    expect(
      response.safeParse({
        ...valid,
        data: { ...valid.data, overallQualityScore: 88 },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          sources: {
            ...valid.data.sources,
            data: [{ ...source, updateFrequency: "daily" }],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          sources: {
            ...valid.data.sources,
            data: [{ ...source, sessionId: sourceId }],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          sources: {
            ...valid.data.sources,
            data: [{ ...source, freshness: "UNKNOWN" }],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          sources: {
            ...valid.data.sources,
            data: [{ ...source, currentApprovedDutyPeriods: -1 }],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          coverage: {
            ...valid.data.coverage,
            data: [{ ...valid.data.coverage.data[0], ratio: 1.2 }],
          },
        },
      }).success,
    ).toBe(false);
  });
});
