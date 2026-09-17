import {
  adminDutyPathParamsSchema,
  adminDutyRevisionListQuerySchema,
  adminDutyRevisionPathParamsSchema,
  createAdminDutyRevisionRequestSchema,
  reviewAdminDutyRevisionRequestSchema,
  type AdminDutyRevision,
} from "@wanzila/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Prisma } from "../../generated/prisma/client.js";
import { sendBadRequest, sendNotFound } from "../shared/http-errors.js";
import {
  handlePrismaMutationError,
  pagination,
  sendMutationFailure,
  type AdminDutyRouteOptions,
  type AdminGuard,
} from "./shared.js";

const revisionSelect = {
  id: true,
  dutyPeriodId: true,
  status: true,
  baseVersion: true,
  beforeSourceId: true,
  beforeStartsAt: true,
  beforeEndsAt: true,
  proposedSourceId: true,
  proposedStartsAt: true,
  proposedEndsAt: true,
  submissionNote: true,
  submittedById: true,
  submittedByName: true,
  submittedAt: true,
  reviewNote: true,
  reviewedById: true,
  reviewedByName: true,
  reviewedAt: true,
} satisfies Prisma.DutyRevisionSelect;

type Revision = Prisma.DutyRevisionGetPayload<{
  select: typeof revisionSelect;
}>;

function serialize(revision: Revision): AdminDutyRevision {
  return {
    id: revision.id,
    dutyPeriodId: revision.dutyPeriodId,
    status: revision.status,
    baseVersion: revision.baseVersion,
    before: {
      sourceId: revision.beforeSourceId,
      startsAt: revision.beforeStartsAt.toISOString(),
      endsAt: revision.beforeEndsAt.toISOString(),
    },
    proposed: {
      sourceId: revision.proposedSourceId,
      startsAt: revision.proposedStartsAt.toISOString(),
      endsAt: revision.proposedEndsAt.toISOString(),
    },
    submittedBy: {
      id: revision.submittedById,
      displayName: revision.submittedByName,
    },
    submittedAt: revision.submittedAt.toISOString(),
    submissionNote: revision.submissionNote,
    reviewedBy:
      revision.reviewedById && revision.reviewedByName
        ? { id: revision.reviewedById, displayName: revision.reviewedByName }
        : null,
    reviewedAt: revision.reviewedAt?.toISOString() ?? null,
    reviewNote: revision.reviewNote,
  };
}

function actor(request: FastifyRequest) {
  const administrator =
    request.administratorAuthentication!.session.administrator;
  return { id: administrator.id, displayName: administrator.displayName };
}

export function registerAdminDutyRevisionRoutes(
  app: FastifyInstance,
  options: AdminDutyRouteOptions,
  requireAdministrator: AdminGuard,
  mutationGuards: AdminGuard[],
): void {
  app.get(
    "/admin/duties/:id/revisions",
    { preHandler: requireAdministrator },
    async (request, reply) => {
      const params = adminDutyPathParamsSchema.safeParse(request.params);
      const query = adminDutyRevisionListQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) return sendBadRequest(reply);
      const result = await options.prisma.$transaction(
        async (tx) => {
          const parent = await tx.dutyPeriod.findUnique({
            where: { id: params.data.id },
            select: { id: true },
          });
          if (!parent) return null;
          const where = { dutyPeriodId: parent.id };
          const [records, total] = await Promise.all([
            tx.dutyRevision.findMany({
              where,
              orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
              skip: (query.data.page - 1) * query.data.pageSize,
              take: query.data.pageSize,
              select: revisionSelect,
            }),
            tx.dutyRevision.count({ where }),
          ]);
          return {
            data: records.map(serialize),
            pagination: pagination(query.data.page, query.data.pageSize, total),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      return result ?? sendNotFound(reply);
    },
  );

  app.post(
    "/admin/duties/:id/revisions",
    { preHandler: mutationGuards },
    async (request, reply) => {
      const params = adminDutyPathParamsSchema.safeParse(request.params);
      const input = createAdminDutyRevisionRequestSchema.safeParse(
        request.body,
      );
      if (!params.success || !input.success) return sendBadRequest(reply);
      const submitter = actor(request);
      try {
        const result = await options.prisma.$transaction(
          async (tx) => {
            const locked = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM DutyPeriod WHERE id = ${params.data.id} FOR UPDATE
            `;
            if (!locked.length) return { failure: "NOT_FOUND" as const };
            const duty = await tx.dutyPeriod.findUniqueOrThrow({
              where: { id: params.data.id },
              select: {
                id: true,
                status: true,
                version: true,
                sourceId: true,
                startsAt: true,
                endsAt: true,
              },
            });
            if (duty.status !== "APPROVED")
              return { failure: "CONFLICT" as const };
            const open = await tx.dutyRevision.findFirst({
              where: { dutyPeriodId: duty.id, status: "PENDING" },
              select: { id: true },
            });
            if (open) return { failure: "CONFLICT" as const };
            if (input.data.sourceId) {
              const source = await tx.scheduleSource.findUnique({
                where: { id: input.data.sourceId },
                select: { id: true },
              });
              if (!source) return { failure: "NOT_FOUND" as const };
            }
            const created = await tx.dutyRevision.create({
              data: {
                dutyPeriodId: duty.id,
                status: "PENDING",
                openRevisionKey: "1",
                baseVersion: duty.version,
                beforeSourceId: duty.sourceId,
                beforeStartsAt: duty.startsAt,
                beforeEndsAt: duty.endsAt,
                proposedSourceId: input.data.sourceId,
                proposedStartsAt: new Date(input.data.startsAt),
                proposedEndsAt: new Date(input.data.endsAt),
                submissionNote: input.data.note,
                submittedById: submitter.id,
                submittedByName: submitter.displayName,
                submittedAt: options.now(),
              },
              select: revisionSelect,
            });
            return { data: serialize(created) };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        if ("failure" in result)
          return sendMutationFailure(reply, result.failure);
        return reply.code(201).send(result);
      } catch (error) {
        if (handlePrismaMutationError(reply, error)) return;
        throw error;
      }
    },
  );

  for (const action of ["approve", "reject"] as const) {
    app.post(
      `/admin/duties/:id/revisions/:revisionId/${action}`,
      { preHandler: mutationGuards },
      async (request, reply) => {
        const params = adminDutyRevisionPathParamsSchema.safeParse(
          request.params,
        );
        const input = reviewAdminDutyRevisionRequestSchema.safeParse(
          request.body ?? {},
        );
        if (!params.success || !input.success) return sendBadRequest(reply);
        const reviewer = actor(request);
        try {
          const result = await options.prisma.$transaction(
            async (tx) => {
              // All duty and exception writers take the parent lock first.
              const lockedDuty = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM DutyPeriod WHERE id = ${params.data.id} FOR UPDATE
              `;
              if (!lockedDuty.length) return { failure: "NOT_FOUND" as const };
              const lockedRevision = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM DutyRevision
                WHERE id = ${params.data.revisionId} AND dutyPeriodId = ${params.data.id}
                FOR UPDATE
              `;
              if (!lockedRevision.length)
                return { failure: "NOT_FOUND" as const };
              const duty = await tx.dutyPeriod.findUniqueOrThrow({
                where: { id: params.data.id },
                select: {
                  id: true,
                  pharmacyId: true,
                  status: true,
                  version: true,
                  sourceId: true,
                  startsAt: true,
                  endsAt: true,
                },
              });
              const revision = await tx.dutyRevision.findUniqueOrThrow({
                where: { id: params.data.revisionId },
                select: revisionSelect,
              });
              if (duty.status !== "APPROVED" || revision.status !== "PENDING")
                return { failure: "CONFLICT" as const };
              if (action === "approve") {
                if (
                  duty.version !== revision.baseVersion ||
                  duty.sourceId !== revision.beforeSourceId ||
                  duty.startsAt.getTime() !==
                    revision.beforeStartsAt.getTime() ||
                  duty.endsAt.getTime() !== revision.beforeEndsAt.getTime()
                )
                  return { failure: "CONFLICT" as const };
                if (revision.proposedSourceId) {
                  const source = await tx.scheduleSource.findUnique({
                    where: { id: revision.proposedSourceId },
                    select: { id: true },
                  });
                  if (!source) return { failure: "CONFLICT" as const };
                }
                const outsideException = await tx.dutyException.findFirst({
                  where: {
                    dutyPeriodId: duty.id,
                    OR: [
                      { startsAt: { lt: revision.proposedStartsAt } },
                      { endsAt: { gt: revision.proposedEndsAt } },
                    ],
                  },
                  select: { id: true },
                });
                if (outsideException) return { failure: "CONFLICT" as const };
                await tx.$queryRaw<Array<{ id: string }>>`
                  SELECT id FROM Pharmacy WHERE id = ${duty.pharmacyId} FOR UPDATE
                `;
                const overlap = await tx.dutyPeriod.findFirst({
                  where: {
                    id: { not: duty.id },
                    pharmacyId: duty.pharmacyId,
                    status: "APPROVED",
                    startsAt: { lt: revision.proposedEndsAt },
                    endsAt: { gt: revision.proposedStartsAt },
                  },
                  select: { id: true },
                });
                if (overlap) return { failure: "CONFLICT" as const };
                await tx.dutyPeriod.update({
                  where: { id: duty.id },
                  data: {
                    sourceId: revision.proposedSourceId,
                    startsAt: revision.proposedStartsAt,
                    endsAt: revision.proposedEndsAt,
                    version: { increment: 1 },
                  },
                });
              }
              const reviewed = await tx.dutyRevision.update({
                where: { id: revision.id },
                data: {
                  status: action === "approve" ? "APPROVED" : "REJECTED",
                  openRevisionKey: null,
                  reviewedById: reviewer.id,
                  reviewedByName: reviewer.displayName,
                  reviewedAt: options.now(),
                  reviewNote: input.data.note ?? null,
                },
                select: revisionSelect,
              });
              return { data: serialize(reviewed) };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
          );
          if ("failure" in result)
            return sendMutationFailure(reply, result.failure);
          return result;
        } catch (error) {
          if (handlePrismaMutationError(reply, error)) return;
          throw error;
        }
      },
    );
  }
}
