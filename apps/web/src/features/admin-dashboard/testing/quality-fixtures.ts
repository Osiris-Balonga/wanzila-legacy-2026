import type {
  AdminAnalyticsOverviewResponse,
  AdminAnalyticsQualityResponse,
} from "@wanzila/contracts";
import { analyticsOverviewFixture } from "./analytics-fixtures";

type Source = AdminAnalyticsQualityResponse["data"]["sources"]["data"][number];
type Coverage =
  AdminAnalyticsQualityResponse["data"]["coverage"]["data"][number];

const sourceRows: Source[] = [
  {
    id: "00000000-0000-4000-8000-000000006201",
    name: "Ordre national des pharmaciens",
    description: "Planning institutionnel",
    observedAt: "2026-09-16T09:30:00.000Z",
    reliability: 96,
    freshness: "FRESH",
    currentApprovedDutyPeriods: 8,
  },
  {
    id: "00000000-0000-4000-8000-000000006202",
    name: "Mairie de Brazzaville",
    description: null,
    observedAt: "2026-09-16T07:15:00.000Z",
    reliability: 89,
    freshness: "FRESH",
    currentApprovedDutyPeriods: 5,
  },
  {
    id: "00000000-0000-4000-8000-000000006203",
    name: "ARS Congo",
    description: "Relevé régional",
    observedAt: "2026-09-15T18:00:00.000Z",
    reliability: 87,
    freshness: "FRESH",
    currentApprovedDutyPeriods: 4,
  },
  {
    id: "00000000-0000-4000-8000-000000006204",
    name: "Contributions citoyennes",
    description: null,
    observedAt: "2026-09-16T08:03:00.000Z",
    reliability: 74,
    freshness: "FRESH",
    currentApprovedDutyPeriods: 2,
  },
  {
    id: "00000000-0000-4000-8000-000000006205",
    name: "Annuaire téléphonique",
    description: "Pages publiques",
    observedAt: "2026-09-14T12:00:00.000Z",
    reliability: 64,
    freshness: "FRESH",
    currentApprovedDutyPeriods: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000006206",
    name: "Sites web des pharmacies",
    description: null,
    observedAt: "2026-08-29T11:00:00.000Z",
    reliability: 52,
    freshness: "STALE",
    currentApprovedDutyPeriods: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000006207",
    name: "Source septième",
    description: null,
    observedAt: "2026-08-20T12:00:00.000Z",
    reliability: 40,
    freshness: "STALE",
    currentApprovedDutyPeriods: 0,
  },
];

const coverageRows: Coverage[] = [
  {
    arrondissement: "Bacongo",
    publishedPharmacies: 10,
    withCurrentApprovedDuty: 7,
    ratio: 0.7,
  },
  {
    arrondissement: "Makélékélé",
    publishedPharmacies: 6,
    withCurrentApprovedDuty: 3,
    ratio: 0.5,
  },
  {
    arrondissement: "Moungali",
    publishedPharmacies: 9,
    withCurrentApprovedDuty: 5,
    ratio: 5 / 9,
  },
  {
    arrondissement: "Ouenzé",
    publishedPharmacies: 7,
    withCurrentApprovedDuty: 4,
    ratio: 4 / 7,
  },
  {
    arrondissement: "Poto-Poto",
    publishedPharmacies: 8,
    withCurrentApprovedDuty: 5,
    ratio: 0.625,
  },
  {
    arrondissement: "Talangaï",
    publishedPharmacies: 6,
    withCurrentApprovedDuty: 3,
    ratio: 0.5,
  },
];

export function qualityOverviewFixture(
  window: "7d" | "30d" = "7d",
): AdminAnalyticsOverviewResponse {
  const overview = analyticsOverviewFixture(window);
  overview.data.quality.registeredSources = { fresh: 5, stale: 2 };
  overview.data.quality.publishedPharmacies = 46;
  overview.data.quality.currentApprovedDutyPeriods = 31;
  overview.data.quality.currentDutyPeriodsExcludedByExceptions = 1;
  overview.data.quality.currentDutyPeriodsAfterExceptions = 30;
  overview.data.quality.currentDutySourceFreshness = {
    fresh: 18,
    stale: 7,
    unknown: 5,
  };
  return overview;
}

export function qualityDetailFixture(
  sourcePage = 1,
  coveragePage = 1,
  empty = false,
): AdminAnalyticsQualityResponse {
  const sources = empty ? [] : sourceRows;
  const coverage = empty ? [] : coverageRows;
  return {
    data: {
      version: 1,
      asOf: "2026-09-16T12:00:00.000Z",
      timeZone: "Africa/Brazzaville",
      sources: {
        data: sources.slice((sourcePage - 1) * 6, sourcePage * 6),
        pagination: {
          page: sourcePage,
          pageSize: 6,
          total: sources.length,
          totalPages: Math.ceil(sources.length / 6),
        },
        totals: {
          registered: sources.length,
          fresh: empty ? 0 : 5,
          stale: empty ? 0 : 2,
          withSourceCurrentDutyPeriods: empty ? 0 : 20,
          withoutSourceCurrentDutyPeriods: empty ? 0 : 10,
          currentDutyPeriodsAfterExceptions: empty ? 0 : 30,
        },
      },
      coverage: {
        data: coverage.slice((coveragePage - 1) * 5, coveragePage * 5),
        pagination: {
          page: coveragePage,
          pageSize: 5,
          total: coverage.length,
          totalPages: Math.ceil(coverage.length / 5),
        },
        totals: {
          publishedPharmacies: empty ? 0 : 46,
          withCurrentApprovedDuty: empty ? 0 : 27,
          ratio: empty ? null : 27 / 46,
        },
      },
    },
  };
}
