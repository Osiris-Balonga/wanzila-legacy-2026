import type { AdminAnalyticsOverviewResponse } from "@wanzila/contracts";

export type AnalyticsWindow = "7d" | "30d";

const eventNames = [
  "discovery_viewed",
  "search_submitted",
  "pharmacy_detail_viewed",
  "pharmacy_call_started",
  "route_started",
  "arrival_confirmed",
  "empty_results_shown",
] as const;

type EventName = (typeof eventNames)[number];
type EventCounts = Record<EventName, number>;

function emptyCounts(): EventCounts {
  return Object.fromEntries(eventNames.map((name) => [name, 0])) as EventCounts;
}

export function analyticsOverviewFixture(
  window: AnalyticsWindow = "7d",
  empty = false,
): AdminAnalyticsOverviewResponse {
  const days = window === "7d" ? 7 : 30;
  const firstDay = window === "7d" ? 10 : 18;
  const firstMonth = window === "7d" ? 8 : 7;
  const daily = Array.from({ length: days }, (_, index) => {
    const counts = emptyCounts();
    if (!empty) {
      counts.discovery_viewed = index + 1;
      counts.search_submitted = index % 2 === 0 ? 2 : 1;
      counts.pharmacy_detail_viewed = index % 3 === 0 ? 2 : 1;
      counts.pharmacy_call_started = index % 4 === 0 ? 1 : 0;
      counts.route_started = index % 3 === 0 ? 1 : 0;
      counts.arrival_confirmed = index === 0 ? 1 : 0;
      counts.empty_results_shown = index % 2 === 0 ? 1 : 0;
    }
    return {
      date: new Date(Date.UTC(2026, firstMonth, firstDay + index))
        .toISOString()
        .slice(0, 10),
      counts,
    };
  });
  const totals = daily.reduce((sum, day) => {
    for (const name of eventNames) sum[name] += day.counts[name];
    return sum;
  }, emptyCounts());

  return {
    data: {
      version: 1 as const,
      window,
      period: {
        timeZone: "Africa/Brazzaville" as const,
        from:
          window === "7d"
            ? "2026-09-09T23:00:00.000Z"
            : "2026-08-17T23:00:00.000Z",
        to: "2026-09-16T23:00:00.000Z",
        asOf: "2026-09-16T12:00:00.000Z",
      },
      events: { totals, daily },
      topPharmacies: empty
        ? []
        : [
            {
              pharmacyId: "00000000-0000-4000-8000-000000005501",
              name: "Pharmacie des Manguiers",
              coordinates: { latitude: -4.2634, longitude: 15.2429 },
              detailViews: 7,
            },
            {
              pharmacyId: "00000000-0000-4000-8000-000000005502",
              name: null,
              coordinates: null,
              detailViews: 3,
            },
          ],
      filterUsage: {
        districts: empty
          ? []
          : [
              { value: "Bacongo", applications: 4 },
              { value: "Moungali", applications: 2 },
            ],
        arrondissements: empty ? [] : [{ value: "Poto-Poto", applications: 3 }],
      },
      quality: {
        publishedPharmacies: empty ? 0 : 12,
        pendingContributions: empty ? 0 : 3,
        unresolvedReports: empty ? 0 : 2,
        currentApprovedDutyPeriods: empty ? 0 : 5,
        currentDutyPeriodsExcludedByExceptions: empty ? 0 : 1,
        currentDutyPeriodsAfterExceptions: empty ? 0 : 4,
        currentDutySourceFreshness: {
          fresh: empty ? 0 : 2,
          stale: empty ? 0 : 1,
          unknown: empty ? 0 : 1,
        },
        registeredSources: { fresh: empty ? 0 : 3, stale: empty ? 0 : 2 },
      },
    },
  };
}

export type AnalyticsOverviewFixture = ReturnType<
  typeof analyticsOverviewFixture
>;
