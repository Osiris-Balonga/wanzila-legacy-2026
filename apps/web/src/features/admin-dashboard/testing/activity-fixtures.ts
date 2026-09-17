import type {
  AdminAnalyticsActivityResponse,
  AdminAnalyticsActivityMetricName,
} from "@wanzila/contracts";
import {
  analyticsOverviewFixture,
  type AnalyticsWindow,
} from "./analytics-fixtures";

type Point =
  AdminAnalyticsActivityResponse["data"]["pharmacyActivity"]["data"][number];

const names: AdminAnalyticsActivityMetricName[] = [
  "discovery_viewed",
  "search_submitted",
  "pharmacy_detail_viewed",
  "pharmacy_call_started",
  "route_started",
  "arrival_confirmed",
];

export function analyticsActivityFixture(
  window: AnalyticsWindow = "7d",
  options: {
    asOf?: string;
    page?: number;
    empty?: boolean;
    many?: boolean;
  } = {},
): AdminAnalyticsActivityResponse {
  const overview = analyticsOverviewFixture(window, options.empty).data;
  const asOf = options.asOf ?? overview.period.asOf;
  const from = overview.period.from;
  const duration = Date.parse(asOf) - Date.parse(from);
  const previousFrom = new Date(Date.parse(from) - duration).toISOString();
  const counts = { ...overview.events.totals };
  if (options.many) counts.pharmacy_detail_viewed = 25;
  const comparisons = Object.fromEntries(
    names.map((name) => {
      const current = counts[name];
      const previous = options.empty
        ? 0
        : name === "route_started"
          ? 0
          : name === "arrival_confirmed"
            ? current
            : name === "search_submitted"
              ? current + 1
              : Math.max(1, current - 1);
      return [
        name,
        {
          current,
          previous,
          deltaPercent:
            previous === 0 ? null : ((current - previous) / previous) * 100,
        },
      ];
    }),
  ) as AdminAnalyticsActivityResponse["data"]["comparisons"];

  const points: Point[] = options.empty
    ? []
    : options.many
      ? Array.from({ length: 21 }, (_, index) => ({
          pharmacyId: `00000000-0000-4000-8000-${String(6400 + index).padStart(12, "0")}`,
          name: `Pharmacie cartographiée ${index + 1}`,
          coordinates: {
            latitude: -4.24 - index * 0.002,
            longitude: 15.22 + index * 0.002,
          },
          detailViews: 1,
        }))
      : [
          {
            pharmacyId: "00000000-0000-4000-8000-000000006401",
            name: "Pharmacie Jagger",
            coordinates: { latitude: -4.2634, longitude: 15.2429 },
            detailViews: counts.pharmacy_detail_viewed - 6,
          },
          {
            pharmacyId: "00000000-0000-4000-8000-000000006402",
            name: "Pharmacie de la Paix",
            coordinates: { latitude: -4.275, longitude: 15.25 },
            detailViews: 3,
          },
          {
            pharmacyId: "00000000-0000-4000-8000-000000006403",
            name: "Pharmacie Saint Michel",
            coordinates: { latitude: -4.25, longitude: 15.26 },
            detailViews: 1,
          },
        ];
  const page = options.page ?? 1;
  const pageSize = 20;
  const mappedDetailViews = points.reduce(
    (sum, point) => sum + point.detailViews,
    0,
  );
  const totalDetailViews = counts.pharmacy_detail_viewed;
  return {
    data: {
      version: 1,
      window,
      period: {
        timeZone: "Africa/Brazzaville",
        from,
        to: asOf,
        asOf,
        previousFrom,
        previousTo: from,
      },
      comparisons,
      pharmacyActivity: {
        data: points.slice((page - 1) * pageSize, page * pageSize),
        pagination: {
          page,
          pageSize,
          total: points.length,
          totalPages: Math.ceil(points.length / pageSize),
        },
        mappedDetailViews,
        unmappedDetailViews: totalDetailViews - mappedDetailViews,
        totalDetailViews,
      },
    },
  };
}
