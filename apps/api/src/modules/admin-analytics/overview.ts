import {
  adminAnalyticsEventNames,
  type AdminAnalyticsEventCounts,
  type AdminAnalyticsOverviewResponse,
  type AdminAnalyticsWindow,
} from "@wanzila/contracts";
import {
  createAdminAnalyticsWindow,
  getSourceFreshness,
  PRODUCT_TIME_ZONE,
} from "@wanzila/domain";
import { Prisma } from "../../generated/prisma/client.js";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";

interface EventDayRow {
  name: string;
  localDate: string;
  eventCount: bigint;
}

interface TopPharmacyRow {
  pharmacyId: string;
  name: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  detailViews: bigint;
}

interface FilterUsageRow {
  value: string;
  applications: bigint;
}

function count(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error("Analytics count exceeds safe integer range");
  return result;
}

function zeroCounts(): AdminAnalyticsEventCounts {
  return Object.fromEntries(
    adminAnalyticsEventNames.map((name) => [name, 0]),
  ) as AdminAnalyticsEventCounts;
}

function coordinates(
  row: TopPharmacyRow,
): { latitude: number; longitude: number } | null {
  if (row.latitude === null || row.longitude === null) return null;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  return Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
    ? { latitude, longitude }
    : null;
}

async function filterUsage(
  prisma: Prisma.TransactionClient,
  from: Date,
  to: Date,
  property: "district" | "arrondissement",
): Promise<Array<{ value: string; applications: number }>> {
  const path = `$.${property}`;
  const rows = await prisma.$queryRaw<FilterUsageRow[]>`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(properties, ${path})) AS value,
           COUNT(*) AS applications
    FROM AnalyticsEvent
    WHERE name = 'filters_applied'
      AND occurredAt >= ${from} AND occurredAt < ${to}
      AND JSON_TYPE(JSON_EXTRACT(properties, ${path})) = 'STRING'
      AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(properties, ${path}))) <> ''
    GROUP BY value
    ORDER BY applications DESC, value ASC
    LIMIT 5
  `;
  return rows.map((row) => ({
    value: row.value,
    applications: count(row.applications),
  }));
}

async function readSnapshot(
  tx: Prisma.TransactionClient,
  from: Date,
  to: Date,
  asOf: Date,
) {
  // Africa/Brazzaville is UTC+1 throughout the supported calendar window
  // (no daylight-saving transitions); Prisma persists these DateTime values in UTC.
  // The same local-day offset is used by createAdminAnalyticsWindow.
  return Promise.all([
    tx.$queryRaw<EventDayRow[]>`
      SELECT name,
             DATE_FORMAT(DATE_ADD(occurredAt, INTERVAL 1 HOUR), '%Y-%m-%d') AS localDate,
             COUNT(*) AS eventCount
      FROM AnalyticsEvent
      WHERE name IN (${Prisma.join(adminAnalyticsEventNames)})
        AND occurredAt >= ${from} AND occurredAt < ${to}
      GROUP BY name, localDate
    `,
    tx.$queryRaw<TopPharmacyRow[]>`
      SELECT event.pharmacyId AS pharmacyId, pharmacy.name AS name,
             pharmacy.latitude AS latitude, pharmacy.longitude AS longitude,
             COUNT(*) AS detailViews
      FROM AnalyticsEvent AS event
      LEFT JOIN Pharmacy AS pharmacy ON pharmacy.id = event.pharmacyId
      WHERE event.name = 'pharmacy_detail_viewed'
        AND event.pharmacyId IS NOT NULL
        AND event.occurredAt >= ${from} AND event.occurredAt < ${to}
      GROUP BY event.pharmacyId, pharmacy.name, pharmacy.latitude, pharmacy.longitude
      ORDER BY detailViews DESC, event.pharmacyId ASC
      LIMIT 5
    `,
    filterUsage(tx, from, to, "district"),
    filterUsage(tx, from, to, "arrondissement"),
    tx.pharmacy.count({ where: { status: "PUBLISHED" } }),
    tx.contribution.count({ where: { status: "PENDING" } }),
    tx.report.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    tx.scheduleSource.findMany({ select: { observedAt: true } }),
    tx.dutyPeriod.findMany({
      where: {
        status: "APPROVED",
        startsAt: { lte: asOf },
        endsAt: { gt: asOf },
        pharmacy: { status: "PUBLISHED" },
      },
      select: {
        source: { select: { observedAt: true } },
        exceptions: {
          where: {
            kind: { in: ["CANCELLED", "UNAVAILABLE"] },
            startsAt: { lte: asOf },
            endsAt: { gt: asOf },
          },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ] as const);
}

export async function loadAdminAnalyticsOverview(options: {
  prisma: ApiPrismaClient;
  asOf: Date;
  window: AdminAnalyticsWindow;
  sourceFreshnessMaxAgeMs: number;
}): Promise<AdminAnalyticsOverviewResponse> {
  const { prisma, asOf, window: selection, sourceFreshnessMaxAgeMs } = options;
  const { from, to, dates } = createAdminAnalyticsWindow(asOf, selection);

  const [
    eventRows,
    topRows,
    districts,
    arrondissements,
    publishedPharmacies,
    pendingContributions,
    unresolvedReports,
    sources,
    currentDuties,
  ] = await prisma.$transaction((tx) => readSnapshot(tx, from, to, asOf), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });

  const daily = dates.map((date) => ({ date, counts: zeroCounts() }));
  const byDate = new Map(daily.map((day) => [day.date, day.counts]));
  const totals = zeroCounts();
  const eventNames = new Set<string>(adminAnalyticsEventNames);
  for (const row of eventRows) {
    if (!eventNames.has(row.name)) continue;
    const day = byDate.get(row.localDate);
    if (!day) continue;
    const name = row.name as keyof AdminAnalyticsEventCounts;
    const occurrences = count(row.eventCount);
    day[name] += occurrences;
    totals[name] += occurrences;
  }

  const registeredSources = { fresh: 0, stale: 0 };
  for (const source of sources) {
    const freshness = getSourceFreshness(
      source.observedAt,
      asOf,
      sourceFreshnessMaxAgeMs,
    );
    if (freshness === "FRESH") registeredSources.fresh += 1;
    else registeredSources.stale += 1;
  }
  const currentDutySourceFreshness = { fresh: 0, stale: 0, unknown: 0 };
  let currentDutyPeriodsExcludedByExceptions = 0;
  for (const duty of currentDuties) {
    if (duty.exceptions.length > 0) {
      currentDutyPeriodsExcludedByExceptions += 1;
      continue;
    }
    const freshness = getSourceFreshness(
      duty.source?.observedAt ?? null,
      asOf,
      sourceFreshnessMaxAgeMs,
    );
    currentDutySourceFreshness[
      freshness.toLowerCase() as keyof typeof currentDutySourceFreshness
    ] += 1;
  }

  return {
    data: {
      version: 1,
      window: selection,
      period: {
        timeZone: PRODUCT_TIME_ZONE,
        from: from.toISOString(),
        to: to.toISOString(),
        asOf: asOf.toISOString(),
      },
      events: { totals, daily },
      topPharmacies: topRows.map((row) => ({
        pharmacyId: row.pharmacyId,
        name: row.name,
        coordinates: coordinates(row),
        detailViews: count(row.detailViews),
      })),
      filterUsage: { districts, arrondissements },
      quality: {
        publishedPharmacies,
        pendingContributions,
        unresolvedReports,
        currentApprovedDutyPeriods: currentDuties.length,
        currentDutyPeriodsExcludedByExceptions,
        currentDutyPeriodsAfterExceptions:
          currentDuties.length - currentDutyPeriodsExcludedByExceptions,
        currentDutySourceFreshness,
        registeredSources,
      },
    },
  };
}
