import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import fastify from "fastify";
import { type HealthResponse } from "@wanzila/contracts";
import {
  createPrismaClient,
  type ApiPrismaClient,
} from "./infrastructure/prisma.js";
import {
  registerAnalyticsRoutes,
  sendAnalyticsPayloadTooLarge,
  sendAnalyticsRateLimited,
} from "./modules/analytics/routes.js";
import { registerEmergencyContactRoutes } from "./modules/public-api/emergency-contact-routes.js";
import { registerPublicPharmacyRoutes } from "./modules/public-api/routes.js";
import { registerRoutingRoutes } from "./modules/routing/routes.js";
import { registerRouteAttemptRoutes } from "./modules/route-attempts/routes.js";
import { registerAdministratorAuthRoutes } from "./modules/admin-auth/routes.js";
import { registerAdminPharmacyRoutes } from "./modules/admin-pharmacy/routes.js";
import { registerAdminDutyRoutes } from "./modules/admin-duty/routes.js";
import { registerAdminAnalyticsRoutes } from "./modules/admin-analytics/routes.js";
import { registerContributionRoutes } from "./modules/contributions/routes.js";
import type { AdministratorAuthRouteOptions } from "./modules/admin-auth/routes.js";
import {
  internalError,
  sendClientError,
  sendNotFound,
} from "./modules/shared/http-errors.js";

const DEFAULT_SOURCE_FRESHNESS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_ANALYTICS_RATE_LIMIT_MAX = 30;

function isAnalyticsEventsRequest(url: string): boolean {
  return url.split("?")[0]?.endsWith("/analytics/events") ?? false;
}

function isKnownClientError(error: unknown): error is { statusCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  );
}

function statusCodeForClientError(error: unknown): number | undefined {
  if (isKnownClientError(error)) {
    return error.statusCode;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "FST_ERR_RATE_LIMIT"
  ) {
    return 429;
  }
  return undefined;
}

export interface AppOptions {
  webOrigin: string;
  webRoot?: string;
  logger?: boolean;
  databaseUrl?: string;
  prisma?: ApiPrismaClient;
  now?: () => Date;
  sourceFreshnessMaxAgeMs?: number;
  rateLimitMax?: number;
  analyticsRateLimitMax?: number;
  nodeEnvironment?: "development" | "test" | "production";
  verifyPassword?: AdministratorAuthRouteOptions["verifyPassword"];
  routingBaseUrl?: string;
  routingFetch?: typeof fetch;
  routingNowMs?: () => number;
  routingTimeoutMs?: number;
  trustedProxyHops?: number;
}

export async function createApp(options: AppOptions) {
  const app = fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustedProxyHops
      ? (_address, hop) => hop < options.trustedProxyHops!
      : false,
  });
  const prisma =
    options.prisma ??
    (options.databaseUrl ? createPrismaClient(options.databaseUrl) : undefined);
  const now = options.now ?? (() => new Date());
  const sourceFreshnessMaxAgeMs =
    options.sourceFreshnessMaxAgeMs ?? DEFAULT_SOURCE_FRESHNESS_MAX_AGE_MS;
  const rateLimitMax = options.rateLimitMax ?? 120;
  const analyticsRateLimitMax =
    options.analyticsRateLimitMax ?? DEFAULT_ANALYTICS_RATE_LIMIT_MAX;
  const nodeEnvironment = options.nodeEnvironment ?? "development";

  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: "1 minute",
    errorResponseBuilder: () => {
      const error = new Error("Rate limit exceeded");
      Object.assign(error, { statusCode: 429 });
      return error;
    },
  });
  await app.register(cors, {
    origin: options.webOrigin,
    credentials: true,
  });

  app.get<{ Reply: HealthResponse }>("/api/v1/health", () => ({
    status: "ok",
    service: "wanzila-api",
  }));

  registerAdministratorAuthRoutes(app, {
    prisma,
    now,
    webOrigin: options.webOrigin,
    nodeEnvironment,
    ...(options.verifyPassword === undefined
      ? {}
      : { verifyPassword: options.verifyPassword }),
  });

  if (prisma) {
    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
    registerAnalyticsRoutes(app, {
      prisma,
      now,
      rateLimitMax: analyticsRateLimitMax,
    });
    await app.register(
      (adminApi) => {
        registerAdminPharmacyRoutes(adminApi, {
          prisma,
          now,
          webOrigin: options.webOrigin,
        });
        registerAdminDutyRoutes(adminApi, {
          prisma,
          now,
          webOrigin: options.webOrigin,
          sourceFreshnessMaxAgeMs,
        });
        registerAdminAnalyticsRoutes(adminApi, {
          prisma,
          now,
          sourceFreshnessMaxAgeMs,
        });
        registerContributionRoutes(adminApi, {
          prisma,
          now,
          webOrigin: options.webOrigin,
        });
      },
      { prefix: "/api/v1" },
    );
    await app.register(
      (publicApi) => {
        registerPublicPharmacyRoutes(publicApi, {
          prisma,
          now,
          sourceFreshnessMaxAgeMs,
        });
        registerEmergencyContactRoutes(publicApi, prisma);
        registerRoutingRoutes(publicApi, {
          prisma,
          ...(options.routingBaseUrl
            ? { baseUrl: options.routingBaseUrl }
            : {}),
          ...(options.routingFetch ? { fetch: options.routingFetch } : {}),
          ...(options.routingNowMs ? { nowMs: options.routingNowMs } : {}),
          ...(options.routingTimeoutMs
            ? { timeoutMs: options.routingTimeoutMs }
            : {}),
        });
        registerRouteAttemptRoutes(publicApi, { prisma, now });
      },
      { prefix: "/api/v1" },
    );
  }

  app.setErrorHandler((error, request, reply) => {
    const statusCode = statusCodeForClientError(error);
    if (isAnalyticsEventsRequest(request.url)) {
      if (statusCode === 413) {
        return sendAnalyticsPayloadTooLarge(reply);
      }
      if (statusCode === 429) {
        return sendAnalyticsRateLimited(reply);
      }
    }
    if (statusCode) {
      return sendClientError(reply, statusCode);
    }
    request.log.error(error);
    return reply.code(500).send(internalError());
  });

  if (options.webRoot) {
    await app.register(staticFiles, { root: options.webRoot, wildcard: false });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/") || !options.webRoot) {
      return sendNotFound(reply);
    }
    return reply.sendFile("index.html");
  });

  return app;
}
