import {
  adminAnalyticsOverviewQuerySchema,
  adminAnalyticsOverviewResponseSchema,
} from "@wanzila/contracts";
import type { FastifyInstance } from "fastify";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";
import { createAdministratorAuthorizationPreHandler } from "../admin-auth/authorization.js";
import { sendBadRequest } from "../shared/http-errors.js";
import { loadAdminAnalyticsOverview } from "./overview.js";

export function registerAdminAnalyticsRoutes(
  app: FastifyInstance,
  options: {
    prisma: ApiPrismaClient;
    now: () => Date;
    sourceFreshnessMaxAgeMs: number;
  },
): void {
  const requireAdministrator = createAdministratorAuthorizationPreHandler({
    prisma: options.prisma,
    now: options.now,
  });
  app.get(
    "/admin/analytics/overview",
    { preHandler: requireAdministrator },
    async (request, reply) => {
      const query = adminAnalyticsOverviewQuerySchema.safeParse(request.query);
      if (!query.success) return sendBadRequest(reply);
      const asOf = options.now();
      const overview = await loadAdminAnalyticsOverview({
        prisma: options.prisma,
        asOf,
        window: query.data.window,
        sourceFreshnessMaxAgeMs: options.sourceFreshnessMaxAgeMs,
      });
      return adminAnalyticsOverviewResponseSchema.parse(overview);
    },
  );
}
