import * as contracts from "@wanzila/contracts";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

function schema(name: string): ZodType {
  const candidate = (contracts as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} must be exported`).toBeDefined();
  return candidate as ZodType;
}

const metric = (
  current = 0,
  previous = 0,
  deltaPercent: number | null = null,
) => ({ current, previous, deltaPercent });
const valid = {
  data: {
    version: 1,
    window: "7d",
    period: {
      timeZone: "Africa/Brazzaville",
      from: "2026-09-09T23:00:00.000Z",
      to: "2026-09-16T12:00:00.000Z",
      asOf: "2026-09-16T12:00:00.000Z",
      previousFrom: "2026-09-03T10:00:00.000Z",
      previousTo: "2026-09-09T23:00:00.000Z",
    },
    comparisons: {
      discovery_viewed: metric(2, 4, -50),
      search_submitted: metric(1, 0, null),
      pharmacy_detail_viewed: metric(3, 2, 50),
      pharmacy_call_started: metric(),
      route_started: metric(),
      arrival_confirmed: metric(),
    },
    pharmacyActivity: {
      data: [
        {
          pharmacyId: "00000000-0000-4000-8000-000000006301",
          name: "Pharmacie Alpha",
          coordinates: { latitude: -4.263708, longitude: 15.242885 },
          detailViews: 2,
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      mappedDetailViews: 2,
      unmappedDetailViews: 1,
      totalDetailViews: 3,
    },
  },
};

describe("administrator activity and geography contract (RED #63)", () => {
  it("bounds window and page query independently of the overview", () => {
    const query = schema("adminAnalyticsActivityQuerySchema");
    expect(query.parse({})).toEqual({ window: "7d", page: 1, pageSize: 100 });
    expect(query.parse({ window: "30d", page: "2", pageSize: "1" })).toEqual({
      window: "30d",
      page: 2,
      pageSize: 1,
    });
    for (const invalid of [
      { window: "1d" },
      { page: 0 },
      { pageSize: 101 },
      { page: "1.5" },
      { extra: true },
    ])
      expect(query.safeParse(invalid).success).toBe(false);
  });

  it("versions strict six-metric comparisons and static pharmacy point aggregates", () => {
    const response = schema("adminAnalyticsActivityResponseSchema");
    expect(response.parse(valid)).toEqual(valid);
    expect(
      response.safeParse({
        ...valid,
        data: { ...valid.data, visitorLatitude: -4.2 },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          comparisons: {
            ...valid.data.comparisons,
            filters_applied: metric(1, 0, null),
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          pharmacyActivity: {
            ...valid.data.pharmacyActivity,
            data: [
              { ...valid.data.pharmacyActivity.data[0], sessionId: "private" },
            ],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          pharmacyActivity: {
            ...valid.data.pharmacyActivity,
            data: [
              {
                ...valid.data.pharmacyActivity.data[0],
                coordinates: { latitude: 91, longitude: 15 },
              },
            ],
          },
        },
      }).success,
    ).toBe(false);
  });

  it("requires null delta at zero prior count and nonnegative aggregate counts", () => {
    const response = schema("adminAnalyticsActivityResponseSchema");
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          comparisons: {
            ...valid.data.comparisons,
            search_submitted: metric(1, 0, 100),
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          comparisons: {
            ...valid.data.comparisons,
            discovery_viewed: metric(-1, 4, -125),
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          pharmacyActivity: {
            ...valid.data.pharmacyActivity,
            unmappedDetailViews: -1,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      response.safeParse({
        ...valid,
        data: {
          ...valid.data,
          pharmacyActivity: {
            ...valid.data.pharmacyActivity,
            data: Array(101).fill(valid.data.pharmacyActivity.data[0]),
          },
        },
      }).success,
    ).toBe(false);
  });
});
