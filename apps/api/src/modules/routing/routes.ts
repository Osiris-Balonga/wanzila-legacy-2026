import { routeRequestSchema, type RouteResponse } from "@wanzila/contracts";
import type { FastifyInstance } from "fastify";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";
import {
  sendBadRequest,
  sendNotFound,
  sendRateLimited,
} from "../shared/http-errors.js";
import { createOsrmProvider, type RoutingProviderOptions } from "./osrm.js";

export interface RoutingRouteOptions extends RoutingProviderOptions {
  prisma: ApiPrismaClient;
  nowMs?: () => number;
}

const routingUnavailable = {
  error: { code: "ROUTING_UNAVAILABLE", message: "Routing unavailable" },
} as const;
const routeNotFound = {
  error: { code: "ROUTE_NOT_FOUND", message: "No route found" },
} as const;

export function registerRoutingRoutes(
  app: FastifyInstance,
  options: RoutingRouteOptions,
): void {
  const route = createOsrmProvider(options);
  const nowMs = options.nowMs ?? (() => performance.now());
  let lastProviderRequestAt = Number.NEGATIVE_INFINITY;

  app.post("/routes", async (request, reply): Promise<RouteResponse | void> => {
    reply.header("Cache-Control", "no-store");
    const body = routeRequestSchema.safeParse(request.body);
    if (!body.success) return sendBadRequest(reply);

    const pharmacy = await options.prisma.pharmacy.findFirst({
      where: { id: body.data.pharmacyId, status: "PUBLISHED" },
      select: { latitude: true, longitude: true },
    });
    if (!pharmacy) return sendNotFound(reply);
    const destination = {
      latitude: Number(pharmacy.latitude),
      longitude: Number(pharmacy.longitude),
    };
    if (
      !Number.isFinite(destination.latitude) ||
      !Number.isFinite(destination.longitude) ||
      Math.abs(destination.latitude) > 90 ||
      Math.abs(destination.longitude) > 180
    ) {
      return void reply.code(503).send(routingUnavailable);
    }

    // One Fastify process is the deployment contract for the public FOSSGIS
    // demo service. A future multi-instance deployment needs a shared limiter.
    const now = nowMs();
    if (now - lastProviderRequestAt < 1_000) return sendRateLimited(reply);
    lastProviderRequestAt = now;
    const result = await route(body.data, destination);
    if (result.status === "no-route") {
      return void reply.code(422).send(routeNotFound);
    }
    if (result.status === "unavailable") {
      return void reply.code(503).send(routingUnavailable);
    }
    return result.response;
  });
}
