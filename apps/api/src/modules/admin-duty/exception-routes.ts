import {
  adminDutyExceptionListQuerySchema,
  adminDutyExceptionPathParamsSchema,
  adminDutyPathParamsSchema,
  createAdminDutyExceptionRequestSchema,
  fullAdminDutyCancellationRequestSchema,
  updateAdminDutyExceptionRequestSchema,
  type AdminDutyException,
} from "@wanzila/contracts";
import { intervalContains } from "@wanzila/domain";
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

const exceptionSelect = {
  id: true,
  dutyPeriodId: true,
  kind: true,
  startsAt: true,
  endsAt: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DutyExceptionSelect;
type ExceptionRecord = Prisma.DutyExceptionGetPayload<{
  select: typeof exceptionSelect;
}>;

function serialize(exception: ExceptionRecord): AdminDutyException {
  return {
    id: exception.id,
    dutyPeriodId: exception.dutyPeriodId,
    kind: exception.kind,
    startsAt: exception.startsAt.toISOString(),
    endsAt: exception.endsAt.toISOString(),
    ...(exception.reason === null ? {} : { reason: exception.reason }),
    createdAt: exception.createdAt.toISOString(),
    updatedAt: exception.updatedAt.toISOString(),
  };
}

export function registerAdminDutyExceptionRoutes(
  app: FastifyInstance,
  options: AdminDutyRouteOptions,
  requireAdministrator: AdminGuard,
  mutationGuards: AdminGuard[],
): void {
  app.get(
    "/admin/duties/:id/exceptions",
    { preHandler: requireAdministrator },
    async (request, reply) => {
      const params = adminDutyPathParamsSchema.safeParse(request.params);
      const query = adminDutyExceptionListQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) return sendBadRequest(reply);
      const parent = await options.prisma.dutyPeriod.findUnique({
        where: { id: params.data.id },
        select: { id: true },
      });
      if (!parent) return sendNotFound(reply);
      const where = { dutyPeriodId: parent.id };
      const [records, total] = await Promise.all([
        options.prisma.dutyException.findMany({
          where,
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          skip: (query.data.page - 1) * query.data.pageSize,
          take: query.data.pageSize,
          select: exceptionSelect,
        }),
        options.prisma.dutyException.count({ where }),
      ]);
      return {
        data: records.map(serialize),
        pagination: pagination(query.data.page, query.data.pageSize, total),
      };
    },
  );

  app.post(
    "/admin/duties/:id/exceptions",
    { preHandler: mutationGuards },
    async (request, reply) => {
      const params = adminDutyPathParamsSchema.safeParse(request.params);
      const input = createAdminDutyExceptionRequestSchema.safeParse(
        request.body,
      );
      if (!params.success || !input.success) return sendBadRequest(reply);
      try {
        const outcome = await options.prisma.$transaction(
          async (tx) => {
            // Serializing on the parent protects the non-overlap invariant even when
            // no exception row exists yet.
            const locked = await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM DutyPeriod WHERE id = ${params.data.id} FOR UPDATE`;
            if (locked.length === 0) return { failure: "NOT_FOUND" as const };
            const duty = await tx.dutyPeriod.findUniqueOrThrow({
              where: { id: params.data.id },
              select: { startsAt: true, endsAt: true, status: true },
            });
            if (duty.status !== "APPROVED")
              return { failure: "CONFLICT" as const };
            const startsAt = new Date(input.data.startsAt);
            const endsAt = new Date(input.data.endsAt);
            if (!intervalContains(duty, { startsAt, endsAt }))
              return { failure: "BAD_REQUEST" as const };
            const overlap = await tx.dutyException.findFirst({
              where: {
                dutyPeriodId: params.data.id,
                startsAt: { lt: endsAt },
                endsAt: { gt: startsAt },
              },
              select: { id: true },
            });
            if (overlap) return { failure: "CONFLICT" as const };
            const created = await tx.dutyException.create({
              data: {
                dutyPeriodId: params.data.id,
                kind: input.data.kind,
                startsAt,
                endsAt,
                ...(input.data.reason ? { reason: input.data.reason } : {}),
              },
              select: exceptionSelect,
            });
            return { data: serialize(created) };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        if ("failure" in outcome)
          return sendMutationFailure(
            reply,
            outcome.failure,
            "Invalid duty state or overlapping exception",
          );
        return reply.code(201).send(outcome);
      } catch (error) {
        if (handlePrismaMutationError(reply, error)) return;
        throw error;
      }
    },
  );

  app.post(
    "/admin/duties/:id/full-cancellation",
    { preHandler: mutationGuards },
    async (request, reply) => {
      const params = adminDutyPathParamsSchema.safeParse(request.params);
      const input = fullAdminDutyCancellationRequestSchema.safeParse(
        request.body ?? {},
      );
      if (!params.success || !input.success) return sendBadRequest(reply);
      try {
        const outcome = await options.prisma.$transaction(
          async (tx) => {
            const locked = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM DutyPeriod WHERE id = ${params.data.id} FOR UPDATE
            `;
            if (locked.length === 0) return { failure: "NOT_FOUND" as const };
            const duty = await tx.dutyPeriod.findUniqueOrThrow({
              where: { id: params.data.id },
              select: { startsAt: true, endsAt: true, status: true },
            });
            if (duty.status !== "APPROVED")
              return { failure: "CONFLICT" as const };
            const existing = await tx.dutyException.findFirst({
              where: {
                dutyPeriodId: params.data.id,
                kind: "CANCELLED",
                startsAt: duty.startsAt,
                endsAt: duty.endsAt,
              },
              select: exceptionSelect,
            });
            if (existing) return { data: serialize(existing), created: false };
            const created = await tx.dutyException.create({
              data: {
                dutyPeriodId: params.data.id,
                kind: "CANCELLED",
                startsAt: duty.startsAt,
                endsAt: duty.endsAt,
                reason: input.data.reason ?? "Annulation complète de la garde",
              },
              select: exceptionSelect,
            });
            return { data: serialize(created), created: true };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        if ("failure" in outcome)
          return sendMutationFailure(reply, outcome.failure);
        return reply.code(outcome.created ? 201 : 200).send({
          data: outcome.data,
        });
      } catch (error) {
        if (handlePrismaMutationError(reply, error)) return;
        throw error;
      }
    },
  );

  app.patch(
    "/admin/duties/:id/exceptions/:exceptionId",
    { preHandler: mutationGuards },
    async (request, reply) => {
      const params = adminDutyExceptionPathParamsSchema.safeParse(
        request.params,
      );
      const input = updateAdminDutyExceptionRequestSchema.safeParse(
        request.body,
      );
      if (!params.success || !input.success) return sendBadRequest(reply);
      try {
        const outcome = await options.prisma.$transaction(
          async (tx) => {
            const locked = await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM DutyPeriod WHERE id = ${params.data.id} FOR UPDATE`;
            if (locked.length === 0) return { failure: "NOT_FOUND" as const };
            const duty = await tx.dutyPeriod.findUniqueOrThrow({
              where: { id: params.data.id },
              select: { startsAt: true, endsAt: true, status: true },
            });
            const existing = await tx.dutyException.findFirst({
              where: {
                id: params.data.exceptionId,
                dutyPeriodId: params.data.id,
              },
              select: exceptionSelect,
            });
            if (!existing) return { failure: "NOT_FOUND" as const };
            if (duty.status !== "APPROVED")
              return { failure: "CONFLICT" as const };
            const fullCancellation = await tx.dutyException.findFirst({
              where: {
                dutyPeriodId: params.data.id,
                kind: "CANCELLED",
                startsAt: duty.startsAt,
                endsAt: duty.endsAt,
              },
              select: { id: true },
            });
            if (fullCancellation) return { failure: "CONFLICT" as const };
            const startsAt = input.data.startsAt
              ? new Date(input.data.startsAt)
              : existing.startsAt;
            const endsAt = input.data.endsAt
              ? new Date(input.data.endsAt)
              : existing.endsAt;
            if (!intervalContains(duty, { startsAt, endsAt }))
              return { failure: "BAD_REQUEST" as const };
            const overlap = await tx.dutyException.findFirst({
              where: {
                dutyPeriodId: params.data.id,
                id: { not: existing.id },
                startsAt: { lt: endsAt },
                endsAt: { gt: startsAt },
              },
              select: { id: true },
            });
            if (overlap) return { failure: "CONFLICT" as const };
            const updated = await tx.dutyException.update({
              where: { id: existing.id },
              data: {
                ...(input.data.kind ? { kind: input.data.kind } : {}),
                ...(input.data.reason === undefined
                  ? {}
                  : { reason: input.data.reason }),
                startsAt,
                endsAt,
              },
              select: exceptionSelect,
            });
            return { data: serialize(updated) };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        if ("failure" in outcome)
          return sendMutationFailure(
            reply,
            outcome.failure,
            "Invalid duty state or overlapping exception",
          );
        return outcome;
      } catch (error) {
        if (handlePrismaMutationError(reply, error)) return;
        throw error;
      }
    },
  );
}
