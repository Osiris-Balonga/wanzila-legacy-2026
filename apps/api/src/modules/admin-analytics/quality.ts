import type {
  AdminAnalyticsQualityQuery,
  AdminAnalyticsQualityResponse,
} from "@wanzila/contracts";
import { getSourceFreshness, PRODUCT_TIME_ZONE } from "@wanzila/domain";
import { Prisma } from "../../generated/prisma/client.js";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";

interface CoverageRow {
  arrondissement: string;
  publishedPharmacies: bigint;
  withCurrentApprovedDuty: Prisma.Decimal;
}

interface CoverageTotalsRow {
  publishedPharmacies: bigint;
  withCurrentApprovedDuty: Prisma.Decimal;
  totalArrondissements: bigint;
}

function count(value: bigint | Prisma.Decimal): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error("Quality count exceeds safe integer range");
  return result;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function pagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export async function loadAdminAnalyticsQuality(options: {
  prisma: ApiPrismaClient;
  asOf: Date;
  query: AdminAnalyticsQualityQuery;
  sourceFreshnessMaxAgeMs: number;
}): Promise<AdminAnalyticsQualityResponse> {
  const { prisma, asOf, query, sourceFreshnessMaxAgeMs } = options;
  if (sourceFreshnessMaxAgeMs < 0)
    throw new RangeError("sourceFreshnessMaxAgeMs must not be negative.");
  const freshnessBoundary = new Date(asOf.getTime() - sourceFreshnessMaxAgeMs);
  const dutyWhere = {
    status: "APPROVED",
    startsAt: { lte: asOf },
    endsAt: { gt: asOf },
    pharmacy: { status: "PUBLISHED" },
    exceptions: {
      none: {
        kind: { in: ["CANCELLED", "UNAVAILABLE"] },
        startsAt: { lte: asOf },
        endsAt: { gt: asOf },
      },
    },
  } satisfies Prisma.DutyPeriodWhereInput;

  // One predicate is shared by the page and global aggregate, so both count
  // distinct published pharmacies with any qualifying duty, never duty rows.
  const hasCurrentDuty = Prisma.sql`
    EXISTS (
      SELECT 1 FROM DutyPeriod AS duty
      WHERE duty.pharmacyId = pharmacy.id
        AND duty.status = 'APPROVED'
        AND duty.startsAt <= ${asOf} AND duty.endsAt > ${asOf}
        AND NOT EXISTS (
          SELECT 1 FROM DutyException AS exceptionRow
          WHERE exceptionRow.dutyPeriodId = duty.id
            AND exceptionRow.kind IN ('CANCELLED', 'UNAVAILABLE')
            AND exceptionRow.startsAt <= ${asOf}
            AND exceptionRow.endsAt > ${asOf}
        )
    )
  `;

  return prisma.$transaction(
    async (tx) => {
      const [
        sourceRows,
        registered,
        fresh,
        currentDutyPeriodsAfterExceptions,
        withoutSourceCurrentDutyPeriods,
        coverageRows,
        coverageTotals,
      ] = await Promise.all([
        tx.scheduleSource.findMany({
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: (query.sourcePage - 1) * query.sourcePageSize,
          take: query.sourcePageSize,
          select: {
            id: true,
            name: true,
            description: true,
            observedAt: true,
            reliability: true,
          },
        }),
        tx.scheduleSource.count(),
        tx.scheduleSource.count({
          where: { observedAt: { gte: freshnessBoundary } },
        }),
        tx.dutyPeriod.count({ where: dutyWhere }),
        tx.dutyPeriod.count({ where: { ...dutyWhere, sourceId: null } }),
        tx.$queryRaw<CoverageRow[]>`
        SELECT pharmacy.arrondissement AS arrondissement,
               COUNT(*) AS publishedPharmacies,
               SUM(CASE WHEN ${hasCurrentDuty} THEN 1 ELSE 0 END) AS withCurrentApprovedDuty
        FROM Pharmacy AS pharmacy
        WHERE pharmacy.status = 'PUBLISHED'
        GROUP BY pharmacy.arrondissement
        ORDER BY pharmacy.arrondissement ASC
        LIMIT ${query.coveragePageSize} OFFSET ${(query.coveragePage - 1) * query.coveragePageSize}
      `,
        tx.$queryRaw<CoverageTotalsRow[]>`
        SELECT COUNT(*) AS publishedPharmacies,
               COALESCE(SUM(CASE WHEN ${hasCurrentDuty} THEN 1 ELSE 0 END), 0) AS withCurrentApprovedDuty,
               COUNT(DISTINCT pharmacy.arrondissement) AS totalArrondissements
        FROM Pharmacy AS pharmacy
        WHERE pharmacy.status = 'PUBLISHED'
      `,
      ]);

      const sourceIds = sourceRows.map((source) => source.id);
      const sourceDutyCounts =
        sourceIds.length === 0
          ? []
          : await tx.dutyPeriod.groupBy({
              by: ["sourceId"],
              where: { ...dutyWhere, sourceId: { in: sourceIds } },
              _count: { _all: true },
            });
      const countBySource = new Map(
        sourceDutyCounts.map((row) => [row.sourceId, row._count._all]),
      );
      const sourceData = sourceRows.map((source) => {
        const freshness = getSourceFreshness(
          source.observedAt,
          asOf,
          sourceFreshnessMaxAgeMs,
        );
        if (freshness === "UNKNOWN")
          throw new Error("A persisted source must have observedAt");
        return {
          id: source.id,
          name: source.name,
          description: source.description,
          observedAt: source.observedAt.toISOString(),
          reliability: source.reliability,
          freshness,
          currentApprovedDutyPeriods: countBySource.get(source.id) ?? 0,
        };
      });
      const coverageTotal = coverageTotals[0];
      if (!coverageTotal) throw new Error("Coverage aggregate returned no row");
      const publishedPharmacies = count(coverageTotal.publishedPharmacies);
      const withCurrentApprovedDuty = count(
        coverageTotal.withCurrentApprovedDuty,
      );
      const totalArrondissements = count(coverageTotal.totalArrondissements);

      return {
        data: {
          version: 1,
          asOf: asOf.toISOString(),
          timeZone: PRODUCT_TIME_ZONE,
          sources: {
            data: sourceData,
            pagination: pagination(
              query.sourcePage,
              query.sourcePageSize,
              registered,
            ),
            totals: {
              registered,
              fresh,
              stale: registered - fresh,
              withSourceCurrentDutyPeriods:
                currentDutyPeriodsAfterExceptions -
                withoutSourceCurrentDutyPeriods,
              withoutSourceCurrentDutyPeriods,
              currentDutyPeriodsAfterExceptions,
            },
          },
          coverage: {
            data: coverageRows.map((row) => {
              const published = count(row.publishedPharmacies);
              const withDuty = count(row.withCurrentApprovedDuty);
              return {
                arrondissement: row.arrondissement,
                publishedPharmacies: published,
                withCurrentApprovedDuty: withDuty,
                ratio: ratio(withDuty, published),
              };
            }),
            pagination: pagination(
              query.coveragePage,
              query.coveragePageSize,
              totalArrondissements,
            ),
            totals: {
              publishedPharmacies,
              withCurrentApprovedDuty,
              ratio: ratio(withCurrentApprovedDuty, publishedPharmacies),
            },
          },
        },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
