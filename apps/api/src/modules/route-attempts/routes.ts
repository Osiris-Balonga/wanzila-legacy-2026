import {
  routeAttemptOutcomeRequestSchema,
  routeAttemptResponseSchema,
  routeAttemptStartRequestSchema,
  type RouteAttemptResponse,
} from "@wanzila/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { RouteAttempt } from "../../generated/prisma/client.js";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";
import { sendBadRequest, sendNotFound } from "../shared/http-errors.js";

const conflict = {
  error: { code: "CONFLICT", message: "Route attempt already resolved" },
} as const;

function sendConflict(reply: FastifyReply) {
  return reply.code(409).send(conflict);
}

function response(attempt: RouteAttempt): RouteAttemptResponse {
  return routeAttemptResponseSchema.parse({
    data: {
      attemptId: attempt.id,
      pharmacyId: attempt.pharmacyId,
      outcome: attempt.outcome,
      startedAt: attempt.startedAt.toISOString(),
      resolvedAt: attempt.resolvedAt?.toISOString() ?? null,
    },
  });
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function registerRouteAttemptRoutes(
  app: FastifyInstance,
  options: { prisma: ApiPrismaClient; now: () => Date },
): void {
  app.post("/route-attempts", { bodyLimit: 1024 }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = routeAttemptStartRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply);
    const { attemptId, pharmacyId, sessionId } = parsed.data;

    const existing = await options.prisma.routeAttempt.findUnique({
      where: { id: attemptId },
    });
    if (existing) {
      return existing.pharmacyId === pharmacyId &&
        existing.sessionId === sessionId
        ? reply.code(200).send(response(existing))
        : sendConflict(reply);
    }

    const published = await options.prisma.pharmacy.findFirst({
      where: { id: pharmacyId, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!published) return sendNotFound(reply);

    try {
      const attempt = await options.prisma.$transaction(async (tx) => {
        const startedAt = options.now();
        const created = await tx.routeAttempt.create({
          data: { id: attemptId, pharmacyId, sessionId, startedAt },
        });
        await tx.analyticsEvent.create({
          data: {
            name: "route_started",
            pharmacyId,
            sessionId,
            properties: { attemptId },
            occurredAt: startedAt,
          },
        });
        return created;
      });
      return reply.code(201).send(response(attempt));
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const attempt = await options.prisma.routeAttempt.findUnique({
        where: { id: attemptId },
      });
      return attempt?.pharmacyId === pharmacyId &&
        attempt.sessionId === sessionId
        ? reply.code(200).send(response(attempt))
        : sendConflict(reply);
    }
  });

  app.patch(
    "/route-attempts/:id/outcome",
    { bodyLimit: 1024 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const params = routeAttemptStartRequestSchema.shape.attemptId.safeParse(
        (request.params as { id?: unknown }).id,
      );
      const body = routeAttemptOutcomeRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return sendBadRequest(reply);
      const id = params.data;
      const { sessionId, outcome } = body.data;
      const existing = await options.prisma.routeAttempt.findUnique({
        where: { id },
      });
      if (!existing || existing.sessionId !== sessionId)
        return sendNotFound(reply);
      if (existing.outcome === outcome) return response(existing);
      if (existing.outcome !== "UNKNOWN") return sendConflict(reply);

      const updated = await options.prisma.$transaction(async (tx) => {
        const resolvedAt = options.now();
        const change = await tx.routeAttempt.updateMany({
          where: { id, sessionId, outcome: "UNKNOWN" },
          data: { outcome, resolvedAt },
        });
        if (change.count === 0) return null;
        if (outcome === "GPS_CONFIRMED") {
          await tx.analyticsEvent.create({
            data: {
              name: "arrival_confirmed",
              pharmacyId: existing.pharmacyId,
              sessionId,
              properties: { attemptId: id },
              occurredAt: resolvedAt,
            },
          });
        }
        return tx.routeAttempt.findUniqueOrThrow({ where: { id } });
      });
      if (updated) return response(updated);

      const latest = await options.prisma.routeAttempt.findUnique({
        where: { id },
      });
      return latest?.outcome === outcome
        ? response(latest)
        : sendConflict(reply);
    },
  );
}
