import {
  adminAnalyticsActivityMetricNames,
  type AdminAnalyticsActivityMetricName,
  type AdminAnalyticsActivityQuery,
  type AdminAnalyticsActivityResponse,
} from "@wanzila/contracts";
import {
  createAdminAnalyticsComparisonWindow,
  PRODUCT_TIME_ZONE,
} from "@wanzila/domain";
import { Prisma } from "../../generated/prisma/client.js";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";

interface ComparisonRow {
  name: string;
  currentCount: Prisma.Decimal;
  previousCount: Prisma.Decimal;
}

interface ActivityTotalsRow {
  totalDetailViews: bigint;
  mappedDetailViews: Prisma.Decimal;
  mappedPharmacies: bigint;
}

interface PharmacyPointRow {
  pharmacyId: string;
  name: string;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  detailViews: bigint;
}

function count(value: bigint | Prisma.Decimal): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error("Activity count exceeds safe integer range");
  return result;
}

function deltaPercent(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}

function point(row: PharmacyPointRow) {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("Mapped pharmacy has invalid static coordinates");
  }
  return {
    pharmacyId: row.pharmacyId,
    name: row.name,
    coordinates: { latitude, longitude },
    detailViews: count(row.detailViews),
  };
}

export async function loadAdminAnalyticsActivity(options: {
  prisma: ApiPrismaClient;
  asOf: Date;
  query: AdminAnalyticsActivityQuery;
}): Promise<AdminAnalyticsActivityResponse> {
  const { prisma, asOf, query } = options;
  const { from, to, previousFrom, previousTo } =
    createAdminAnalyticsComparisonWindow(asOf, query.window);

  // Only persisted pharmacy coordinates are used. All other detail events are
  // counted in unmappedDetailViews, including null/deleted IDs and non-public
  // or invalidly geocoded pharmacy rows.
  const mappedPharmacy = Prisma.sql`
    pharmacy.status = 'PUBLISHED'
      AND pharmacy.latitude BETWEEN -90 AND 90
      AND pharmacy.longitude BETWEEN -180 AND 180
  `;

  const [comparisonRows, activityTotalsRows, pointRows] =
    await prisma.$transaction(
      async (tx) =>
        Promise.all([
          tx.$queryRaw<ComparisonRow[]>`
        SELECT name,
               SUM(CASE WHEN occurredAt >= ${from} AND occurredAt < ${to} THEN 1 ELSE 0 END) AS currentCount,
               SUM(CASE WHEN occurredAt >= ${previousFrom} AND occurredAt < ${previousTo} THEN 1 ELSE 0 END) AS previousCount
        FROM AnalyticsEvent
        WHERE name IN (${Prisma.join(adminAnalyticsActivityMetricNames)})
          AND occurredAt >= ${previousFrom} AND occurredAt < ${to}
        GROUP BY name
      `,
          tx.$queryRaw<ActivityTotalsRow[]>`
        SELECT COUNT(*) AS totalDetailViews,
               COALESCE(SUM(CASE WHEN ${mappedPharmacy} THEN 1 ELSE 0 END), 0) AS mappedDetailViews,
               COUNT(DISTINCT CASE WHEN ${mappedPharmacy} THEN pharmacy.id END) AS mappedPharmacies
        FROM AnalyticsEvent AS event
        LEFT JOIN Pharmacy AS pharmacy ON pharmacy.id = event.pharmacyId
        WHERE event.name = 'pharmacy_detail_viewed'
          AND event.occurredAt >= ${from} AND event.occurredAt < ${to}
      `,
          tx.$queryRaw<PharmacyPointRow[]>`
        SELECT event.pharmacyId AS pharmacyId, pharmacy.name AS name,
               pharmacy.latitude AS latitude, pharmacy.longitude AS longitude,
               COUNT(*) AS detailViews
        FROM AnalyticsEvent AS event
        JOIN Pharmacy AS pharmacy ON pharmacy.id = event.pharmacyId
        WHERE event.name = 'pharmacy_detail_viewed'
          AND event.occurredAt >= ${from} AND event.occurredAt < ${to}
          AND ${mappedPharmacy}
        GROUP BY event.pharmacyId, pharmacy.name, pharmacy.latitude, pharmacy.longitude
        ORDER BY detailViews DESC, event.pharmacyId ASC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
      `,
        ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

  const byName = new Map(comparisonRows.map((row) => [row.name, row]));
  const comparisons = Object.fromEntries(
    adminAnalyticsActivityMetricNames.map((name) => {
      const row = byName.get(name);
      const current = row ? count(row.currentCount) : 0;
      const previous = row ? count(row.previousCount) : 0;
      return [
        name,
        { current, previous, deltaPercent: deltaPercent(current, previous) },
      ];
    }),
  ) as Record<
    AdminAnalyticsActivityMetricName,
    { current: number; previous: number; deltaPercent: number | null }
  >;
  const activityTotals = activityTotalsRows[0];
  if (!activityTotals) throw new Error("Activity aggregate returned no row");
  const totalDetailViews = count(activityTotals.totalDetailViews);
  const mappedDetailViews = count(activityTotals.mappedDetailViews);
  const totalMappedPharmacies = count(activityTotals.mappedPharmacies);

  return {
    data: {
      version: 1,
      window: query.window,
      period: {
        timeZone: PRODUCT_TIME_ZONE,
        from: from.toISOString(),
        to: to.toISOString(),
        asOf: asOf.toISOString(),
        previousFrom: previousFrom.toISOString(),
        previousTo: previousTo.toISOString(),
      },
      comparisons,
      pharmacyActivity: {
        data: pointRows.map(point),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: totalMappedPharmacies,
          totalPages: Math.ceil(totalMappedPharmacies / query.pageSize),
        },
        mappedDetailViews,
        unmappedDetailViews: totalDetailViews - mappedDetailViews,
        totalDetailViews,
      },
    },
  };
}
