import type { FastifyInstance } from "fastify";
import {
  createAdministratorAuthorizationPreHandler,
  createAllowedOriginPreHandler,
} from "../admin-auth/authorization.js";
import { registerAdminDutyPeriodRoutes } from "./duty-routes.js";
import { registerAdminDutyExceptionRoutes } from "./exception-routes.js";
import { registerAdminDutyRevisionRoutes } from "./revision-routes.js";
import { registerAdminSourceRoutes } from "./source-routes.js";
import type { AdminDutyRouteOptions } from "./shared.js";

export function registerAdminDutyRoutes(
  app: FastifyInstance,
  options: AdminDutyRouteOptions,
): void {
  const requireAdministrator = createAdministratorAuthorizationPreHandler({
    prisma: options.prisma,
    now: options.now,
  });
  const requireOrigin = createAllowedOriginPreHandler({
    webOrigin: options.webOrigin,
  });
  const mutationGuards = [requireAdministrator, requireOrigin];
  registerAdminSourceRoutes(app, options, requireAdministrator, mutationGuards);
  registerAdminDutyPeriodRoutes(
    app,
    options,
    requireAdministrator,
    mutationGuards,
  );
  registerAdminDutyExceptionRoutes(
    app,
    options,
    requireAdministrator,
    mutationGuards,
  );
  registerAdminDutyRevisionRoutes(
    app,
    options,
    requireAdministrator,
    mutationGuards,
  );
}
