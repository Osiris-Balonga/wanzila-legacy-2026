import {
  adminDutyListQuerySchema,
  adminDutyPathParamsSchema,
  createAdminDutyRequestSchema,
  updateAdminDutyRequestSchema,
  type AdminDuty,
} from "@wanzila/contracts";
import { isValidInterval } from "@wanzila/domain";
import type { FastifyInstance } from "fastify";
import { Prisma } from "../../generated/prisma/client.js";
import { sendBadRequest, sendNotFound } from "../shared/http-errors.js";
import {
  handlePrismaMutationError,
  pagination,
  sendMutationFailure,
  type AdminDutyRouteOptions,
  type AdminGuard,
} from "./shared.js";

const dutySelect = {
  id: true,
  pharmacyId: true,
  sourceId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DutyPeriodSelect;
type DutyRecord = Prisma.DutyPeriodGetPayload<{ select: typeof dutySelect }>;

function serialize(duty: DutyRecord): AdminDuty {
  return {
    id: duty.id,
    pharmacyId: duty.pharmacyId,
    sourceId: duty.sourceId,
    startsAt: duty.startsAt.toISOString(),
    endsAt: duty.endsAt.toISOString(),
    status: duty.status,
    createdAt: duty.createdAt.toISOString(),
    updatedAt: duty.updatedAt.toISOString(),
  };
}

export function registerAdminDutyPeriodRoutes(
  app: FastifyInstance,
  options: AdminDutyRouteOptions,
  requireAdministrator: AdminGuard,
  mutationGuards: AdminGuard[],
): void {
  app.get(
    "/admin/duties",
    { preHandler: requireAdministrator },
    async (request, reply) => {
      const query = adminDutyListQuerySchema.safeParse(request.query);
      if (!query.success) return sendBadRequest(reply);
      const where: Prisma.DutyPeriodWhereInput = {
        ...(query.data.pharmacyId ? { pharmacyId: query.data.pharmacyId } : {}),
        ...(query.data.sourceId ? { sourceId: query.data.sourceId } : {}),
        ...(query.data.status ? { status: query.data.status } : {}),
        ...(query.data.from
          ? { endsAt: { gt: new Date(query.data.from) } }
          : {}),
        ...(query.data.to ? { startsAt: { lt: new Date(query.data.to) } } : {}),
      };
      const [records, total] = await Promise.all([
        options.prisma.dutyPeriod.findMany({
          where,
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          skip: (query.data.page - 1) * query.data.pageSize,
          take: query.data.pageSize,
          select: dutySelect,
        }),
        options.prisma.dutyPeriod.count({ where }),
      ]);
      return {
        data: records.map(serialize),
        pagination: pagination(query.data.page, query.data.pageSize, total),
      };
    },
  );

  app.post(
    "/admin/duties",
    { preHandler: mutationGuards },
    async (request, reply) => {
      const input = createAdminDutyRequestSchema.safeParse(request.body);
      if (!input.success) return sendBadRequest(reply);
      const [pharmacy, source] = await Promise.all([
        options.prisma.pharmacy.findUnique({
          where: { id: input.data.pharmacyId },
          select: { id: true },
        }),
        input.data.sourceId
          ? options.prisma.scheduleSource.findUnique({
              where: { id: input.data.sourceId },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
      if (!pharmacy || (input.data.sourceId && !source))
        return sendNotFound(reply);
      try {
        const created = await options.prisma.dutyPeriod.create({
          data: {
            pharmacyId: input.data.pharmacyId,
            sourceId: input.data.sourceId ?? null,
            startsAt: new Date(input.data.startsAt),
            endsAt: new Date(input.data.endsAt),
            status: "PENDING",
          },
          select: dutySelect,
        });
        return reply.code(201).send({ data: serialize(created) });
      } catch (error) {
        if (handlePrismaMutationError(reply, error)) return;
        throw error;
      }
    },
  );

  app.patch(
    "/admin/duties/:id",
    { preHandler: mutationGuards },
    async (request, reply) => {
      const params = adminDutyPathParamsSchema.safeParse(request.params);
      const input = updateAdminDutyRequestSchema.safeParse(request.body);
      if (!params.success || !input.success) return sendBadRequest(reply);
      try {
        const outcome = await options.prisma.$transaction(
          async (tx) => {
            const locked = await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM DutyPeriod WHERE id = ${params.data.id} FOR UPDATE`;
            if (locked.length === 0) return { failure: "NOT_FOUND" as const };
            const existing = await tx.dutyPeriod.findUniqueOrThrow({
              where: { id: params.data.id },
              select: dutySelect,
            });
            if (existing.status !== "PENDING")
              return { failure: "CONFLICT" as const };
            const startsAt = input.data.startsAt
              ? new Date(input.data.startsAt)
              : existing.startsAt;
            const endsAt = input.data.endsAt
              ? new Date(input.data.endsAt)
              : existing.endsAt;
            if (!isValidInterval({ startsAt, endsAt }))
              return { failure: "BAD_REQUEST" as const };
            if (
              input.data.pharmacyId &&
              input.data.pharmacyId !== existing.pharmacyId
            ) {
              const pharmacy = await tx.pharmacy.findUnique({
                where: { id: input.data.pharmacyId },
                select: { id: true },
              });
              if (!pharmacy) return { failure: "NOT_FOUND" as const };
            }
            if (
              input.data.sourceId &&
              input.data.sourceId !== existing.sourceId
            ) {
              const source = await tx.scheduleSource.findUnique({
                where: { id: input.data.sourceId },
                select: { id: true },
              });
              if (!source) return { failure: "NOT_FOUND" as const };
            }
            const updated = await tx.dutyPeriod.update({
              where: { id: existing.id },
              data: {
                ...(input.data.pharmacyId
                  ? { pharmacyId: input.data.pharmacyId }
                  : {}),
                ...(input.data.sourceId === undefined
                  ? {}
                  : { sourceId: input.data.sourceId }),
                startsAt,
                endsAt,
              },
              select: dutySelect,
            });
            return { data: serialize(updated) };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        if ("failure" in outcome)
          return sendMutationFailure(reply, outcome.failure);
        return outcome;
      } catch (error) {
        if (handlePrismaMutationError(reply, error)) return;
        throw error;
      }
    },
  );

  for (const [action, target] of [
    ["approve", "APPROVED"],
    ["reject", "REJECTED"],
  ] as const) {
    app.post(
      `/admin/duties/:id/${action}`,
      { preHandler: mutationGuards },
      async (request, reply) => {
        const params = adminDutyPathParamsSchema.safeParse(request.params);
        if (!params.success) return sendBadRequest(reply);
        try {
          const outcome = await options.prisma.$transaction(
            async (tx) => {
              // Lock duty first so concurrent PATCH/review cannot change its pharmacy or interval.
              const lockedDuty = await tx.$queryRaw<
                Array<{ id: string }>
              >`SELECT id FROM DutyPeriod WHERE id = ${params.data.id} FOR UPDATE`;
              if (lockedDuty.length === 0)
                return { failure: "NOT_FOUND" as const };
              const duty = await tx.dutyPeriod.findUniqueOrThrow({
                where: { id: params.data.id },
                select: dutySelect,
              });
              if (duty.status !== "PENDING")
                return { failure: "CONFLICT" as const };
              if (target === "APPROVED") {
                // Every approval for this pharmacy contends on the same row, including
                // initially empty duty ranges. The subsequent read sees the last commit.
                await tx.$queryRaw<
                  Array<{ id: string }>
                >`SELECT id FROM Pharmacy WHERE id = ${duty.pharmacyId} FOR UPDATE`;
                const conflict = await tx.dutyPeriod.findFirst({
                  where: {
                    pharmacyId: duty.pharmacyId,
                    status: "APPROVED",
                    startsAt: { lt: duty.endsAt },
                    endsAt: { gt: duty.startsAt },
                  },
                  select: { id: true },
                });
                if (conflict) return { failure: "CONFLICT" as const };
              }
              const updated = await tx.dutyPeriod.update({
                where: { id: duty.id },
                data: { status: target },
                select: dutySelect,
              });
              return { data: serialize(updated) };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
          );
          if ("failure" in outcome)
            return sendMutationFailure(
              reply,
              outcome.failure,
              "Invalid duty status transition or overlapping approved duty",
            );
          return outcome;
        } catch (error) {
          if (handlePrismaMutationError(reply, error)) return;
          throw error;
        }
      },
    );
  }
}
