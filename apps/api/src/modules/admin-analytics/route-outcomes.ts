import type { AdminRouteOutcomesResponse } from "@wanzila/contracts";
import { createAdminAnalyticsWindow, PRODUCT_TIME_ZONE } from "@wanzila/domain";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";

export async function loadAdminRouteOutcomes(options: {
  prisma: ApiPrismaClient;
  asOf: Date;
  window: "7d" | "30d";
}): Promise<AdminRouteOutcomesResponse> {
  const { from, to } = createAdminAnalyticsWindow(options.asOf, options.window);
  const rows = await options.prisma.routeAttempt.groupBy({
    by: ["outcome"],
    where: { startedAt: { gte: from, lt: to } },
    _count: { _all: true },
  });
  const totals = new Map(rows.map((row) => [row.outcome, row._count._all]));
  const counts = {
    gpsConfirmed: totals.get("GPS_CONFIRMED") ?? 0,
    userDeclared: totals.get("USER_DECLARED") ?? 0,
    stopped: totals.get("STOPPED") ?? 0,
    alreadyNearby: totals.get("ALREADY_NEARBY") ?? 0,
    unknown: totals.get("UNKNOWN") ?? 0,
  };
  return {
    data: {
      version: 1,
      window: options.window,
      period: {
        timeZone: PRODUCT_TIME_ZONE,
        from: from.toISOString(),
        to: to.toISOString(),
        asOf: options.asOf.toISOString(),
      },
      counts: {
        started: Object.values(counts).reduce((sum, value) => sum + value, 0),
        ...counts,
      },
    },
  };
}
