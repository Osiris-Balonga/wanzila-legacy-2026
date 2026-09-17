import type { ApiPrismaClient } from "../../infrastructure/prisma.js";

export const ANALYTICS_RETENTION_DAYS = 30;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export async function cleanupExpiredAnalyticsEvents(options: {
  prisma: ApiPrismaClient;
  now: () => Date;
}): Promise<void> {
  const cutoff = new Date(
    options.now().getTime() - ANALYTICS_RETENTION_DAYS * DAY_IN_MILLISECONDS,
  );
  await options.prisma.analyticsEvent.deleteMany({
    where: { occurredAt: { lt: cutoff } },
  });
  await options.prisma.routeAttempt.deleteMany({
    where: { startedAt: { lt: cutoff } },
  });
}
