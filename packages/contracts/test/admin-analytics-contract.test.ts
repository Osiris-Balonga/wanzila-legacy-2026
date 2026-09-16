import * as contracts from "@wanzila/contracts";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

// Resolve at runtime so this suite is executable while the API contract is RED.
function schema(name: string): ZodType {
  const candidate = (contracts as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} must be exported`).toBeDefined();
  return candidate as ZodType;
}

const eventNames = [
  "discovery_viewed",
  "search_submitted",
  "pharmacy_detail_viewed",
  "pharmacy_call_started",
  "route_started",
  "arrival_confirmed",
  "empty_results_shown",
] as const;

function counts(
  overrides: Partial<Record<(typeof eventNames)[number], number>> = {},
) {
  return Object.fromEntries(
    eventNames.map((name) => [name, overrides[name] ?? 0]),
  );
}

function validResponse() {
  return {
    data: {
      version: 1,
      window: "7d",
      period: {
        timeZone: "Africa/Brazzaville",
        from: "2026-09-09T23:00:00.000Z",
        to: "2026-09-16T12:00:00.000Z",
        asOf: "2026-09-16T12:00:00.000Z",
      },
      events: {
        totals: counts({ discovery_viewed: 2, search_submitted: 1 }),
        daily: [
          "2026-09-10",
          "2026-09-11",
          "2026-09-12",
          "2026-09-13",
          "2026-09-14",
          "2026-09-15",
          "2026-09-16",
        ].map((date, index) => ({
          date,
          counts: counts(
            index === 6 ? { discovery_viewed: 2, search_submitted: 1 } : {},
          ),
        })),
      },
      topPharmacies: [
        {
          pharmacyId: "00000000-0000-4000-8000-000000005401",
          name: "Pharmacie Alpha",
          coordinates: { latitude: -4.263708, longitude: 15.242885 },
          detailViews: 2,
        },
      ],
      filterUsage: {
        districts: [{ value: "Plateau", applications: 2 }],
        arrondissements: [{ value: "Poto-Poto", applications: 1 }],
      },
      quality: {
        publishedPharmacies: 1,
        pendingContributions: 0,
        unresolvedReports: 0,
        currentApprovedDutyPeriods: 1,
        currentDutyPeriodsExcludedByExceptions: 0,
        currentDutyPeriodsAfterExceptions: 1,
        currentDutySourceFreshness: { fresh: 1, stale: 0, unknown: 0 },
        registeredSources: { fresh: 1, stale: 0 },
      },
    },
  };
}

describe("administrator analytics overview contract (RED #54)", () => {
  it("accepts only bounded 7d/30d queries, defaulting to 7d", () => {
    const query = schema("adminAnalyticsOverviewQuerySchema");
    expect(query.parse({})).toEqual({ window: "7d" });
    expect(query.parse({ window: "30d" })).toEqual({ window: "30d" });
    for (const invalid of [
      { window: "1d" },
      { window: "365d" },
      { window: ["7d", "30d"] },
      { window: "7d", pageSize: 1000 },
    ])
      expect(query.safeParse(invalid).success).toBe(false);
  });

  it("versions a strict aggregate-only response and bounds every top list", () => {
    const response = schema("adminAnalyticsOverviewResponseSchema");
    const valid = validResponse();
    expect(response.parse(valid)).toEqual(valid);
    expect(
      response.safeParse({
        ...valid,
        data: { ...valid.data, sessionId: "secret" },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: { ...valid.data, rawQuery: "private" },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({ ...valid, data: { ...valid.data, version: 2 } })
        .success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          topPharmacies: Array(6).fill(valid.data.topPharmacies[0]),
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          filterUsage: {
            ...valid.data.filterUsage,
            districts: Array(6).fill(valid.data.filterUsage.districts[0]),
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.parse({
        ...valid,
        data: {
          ...valid.data,
          topPharmacies: [
            { ...valid.data.topPharmacies[0], name: null, coordinates: null },
          ],
        },
      }),
    ).toMatchObject({
      data: { topPharmacies: [{ name: null, coordinates: null }] },
    });
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          topPharmacies: [
            {
              ...valid.data.topPharmacies[0],
              coordinates: { latitude: 91, longitude: 15 },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects invented event types, negative counts, raw traces and non-calendar dates", () => {
    const response = schema("adminAnalyticsOverviewResponseSchema");
    const valid = validResponse();
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          events: {
            ...valid.data.events,
            totals: { ...valid.data.events.totals, active_users: 1 },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          events: {
            ...valid.data.events,
            totals: counts({ discovery_viewed: -1 }),
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          events: {
            ...valid.data.events,
            daily: [{ date: "yesterday", counts: counts() }],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          events: {
            ...valid.data.events,
            daily: valid.data.events.daily.map((day, index) =>
              index === 0 ? { ...day, sessionId: "private" } : day,
            ),
          },
        },
      }).success,
    ).toBe(false);
  });
});
