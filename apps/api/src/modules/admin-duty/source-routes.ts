import {
  adminScheduleSourceListQuerySchema,
  adminScheduleSourcePathParamsSchema,
  createAdminScheduleSourceRequestSchema,
  updateAdminScheduleSourceRequestSchema,
  type AdminScheduleSource,
} from "@wanzila/contracts";
import { getSourceFreshness } from "@wanzila/domain";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "../../generated/prisma/client.js";
import { sendBadRequest, sendNotFound } from "../shared/http-errors.js";
import {
  handlePrismaMutationError,
  pagination,
  type AdminDutyRouteOptions,
  type AdminGuard,
} from "./shared.js";

const sourceSelect = {
  id: true,
  name: true,
  description: true,
  reliability: true,
  observedAt: true,
  updatedAt: true,
} satisfies Prisma.ScheduleSourceSelect;
type SourceRecord = Prisma.ScheduleSourceGetPayload<{
  select: typeof sourceSelect;
}>;

function serialize(
  source: SourceRecord,
  at: Date,
  maxAgeMs: number,
): AdminScheduleSource {
  const freshness = getSourceFreshness(source.observedAt, at, maxAgeMs);
  if (freshness === "UNKNOWN")
    throw new Error("A persisted schedule source must have observedAt");
  return {
    id: source.id,
    name: source.name,
    ...(source.description === null ? {} : { description: source.description }),
    reliability: source.reliability,
    observedAt: source.observedAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
    freshness,
  };
}

export function registerAdminSourceRoutes(
  app: FastifyInstance,
  options: AdminDutyRouteOptions,
  requireAdministrator: AdminGuard,
  mutationGuards: AdminGuard[],
): void {
  app.get(
    "/admin/sources",
    { preHandler: requireAdministrator },
    async (request, reply) => {
      const query = adminScheduleSourceListQuerySchema.safeParse(request.query);
      if (!query.success) return sendBadRequest(reply);
      const [records, total] = await Promise.all([
        options.prisma.scheduleSource.findMany({
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: (query.data.page - 1) * query.data.pageSize,
          take: query.data.pageSize,
          select: sourceSelect,
        }),
        options.prisma.scheduleSource.count(),
      ]);
      const at = options.now();
      return {
        data: records.map((record) =>
          serialize(record, at, options.sourceFreshnessMaxAgeMs),
        ),
        pagination: pagination(query.data.page, query.data.pageSize, total),
      };
    },
  );

  app.post(
    "/admin/sources",
    { preHandler: mutationGuards },
    async (request, reply) => {
      const input = createAdminScheduleSourceRequestSchema.safeParse(
        request.body,
      );
      if (
        !input.success ||
        new Date(input.data.observedAt).getTime() > options.now().getTime()
      )
        return sendBadRequest(reply);
      try {
        const created = await options.prisma.scheduleSource.create({
          data: {
            name: input.data.name,
            observedAt: new Date(input.data.observedAt),
            ...(input.data.description
              ? { description: input.data.description }
              : {}),
            ...(input.data.reliability === undefined
              ? {}
              : { reliability: input.data.reliability }),
          },
          select: sourceSelect,
        });
        return reply.code(201).send({
          data: serialize(
            created,
            options.now(),
            options.sourceFreshnessMaxAgeMs,
          ),
        });
      } catch (error) {
        if (handlePrismaMutationError(reply, error)) return;
        throw error;
      }
    },
  );

  app.patch(
    "/admin/sources/:id",
    { preHandler: mutationGuards },
    async (request, reply) => {
      const params = adminScheduleSourcePathParamsSchema.safeParse(
        request.params,
      );
      const input = updateAdminScheduleSourceRequestSchema.safeParse(
        request.body,
      );
      if (
        !params.success ||
        !input.success ||
        (input.data.observedAt !== undefined &&
          new Date(input.data.observedAt).getTime() > options.now().getTime())
      )
        return sendBadRequest(reply);
      const existing = await options.prisma.scheduleSource.findUnique({
        where: { id: params.data.id },
        select: { id: true },
      });
      if (!existing) return sendNotFound(reply);
      try {
        const updated = await options.prisma.scheduleSource.update({
          where: { id: existing.id },
          data: {
            ...(input.data.name === undefined ? {} : { name: input.data.name }),
            ...(input.data.description === undefined
              ? {}
              : { description: input.data.description }),
            ...(input.data.reliability === undefined
              ? {}
              : { reliability: input.data.reliability }),
            ...(input.data.observedAt === undefined
              ? {}
              : { observedAt: new Date(input.data.observedAt) }),
          },
          select: sourceSelect,
        });
        return {
          data: serialize(
            updated,
            options.now(),
            options.sourceFreshnessMaxAgeMs,
          ),
        };
      } catch (error) {
        if (handlePrismaMutationError(reply, error)) return;
        throw error;
      }
    },
  );
}
