import {
  adminContributionCorrectionSchema,
  adminContributionDecisionSchema,
  adminContributionListQuerySchema,
  adminContributionParamsSchema,
  createContributionRequestSchema,
} from "@wanzila/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../generated/prisma/client.js";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";
import { pharmacyMatchKey } from "../../infrastructure/pharmacy-match-key.js";
import {
  createAdministratorAuthorizationPreHandler,
  createAllowedOriginPreHandler,
} from "../admin-auth/authorization.js";
import {
  sendBadRequest,
  sendConflict,
  sendNotFound,
  sendRateLimited,
} from "../shared/http-errors.js";
import {
  candidate,
  contributionInclude,
  findIndicators,
  serializeContribution,
  snapshot,
} from "./shared.js";

export interface ContributionRouteOptions {
  prisma: ApiPrismaClient;
  now: () => Date;
  webOrigin: string;
}

function actor(request: FastifyRequest) {
  return request.administratorAuthentication!.session.administrator;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function mutationError(reply: FastifyReply, error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034"].includes(error.code)
  ) {
    sendConflict(
      reply,
      "Contribution changed or matching pharmacy already exists",
    );
    return true;
  }
  return false;
}

function createSubmissionLimiter(now: () => Date) {
  const attempts = new Map<string, number[]>();
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const time = now().getTime();
    const history = (attempts.get(request.ip) ?? []).filter(
      (stamp) => stamp > time - 24 * 60 * 60 * 1000,
    );
    if (
      history.length >= 20 ||
      history.filter((stamp) => stamp > time - 60 * 60 * 1000).length >= 5
    ) {
      sendRateLimited(reply);
      return reply;
    }
    history.push(time);
    attempts.set(request.ip, history);
    if (attempts.size > 10_000) {
      for (const [ip, values] of attempts)
        if (values.every((stamp) => stamp <= time - 24 * 60 * 60 * 1000))
          attempts.delete(ip);
    }
  };
}

async function detail(
  prisma: ApiPrismaClient,
  id: string,
  reply: FastifyReply,
) {
  const record = await prisma.contribution.findUnique({
    where: { id },
    include: contributionInclude,
  });
  if (!record) return sendNotFound(reply);
  return { data: await serializeContribution(prisma, record) };
}

export function registerContributionRoutes(
  app: FastifyInstance,
  options: ContributionRouteOptions,
): void {
  const requireAdministrator = createAdministratorAuthorizationPreHandler({
    prisma: options.prisma,
    now: options.now,
  });
  const requireOrigin = createAllowedOriginPreHandler({
    webOrigin: options.webOrigin,
  });
  const adminMutations = [requireAdministrator, requireOrigin];

  app.post(
    "/contributions",
    {
      bodyLimit: 4096,
      config: { rateLimit: false },
      preHandler: createSubmissionLimiter(options.now),
    },
    async (request, reply) => {
      const parsed = createContributionRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendBadRequest(reply);
      const input = parsed.data;
      const original = {
        name: input.name,
        address: input.address,
        phone: input.phone ?? null,
        coordinates: input.coordinates ?? null,
        note: input.note ?? null,
      };
      const existing = await options.prisma.contribution.findUnique({
        where: { submissionId: input.submissionId },
        select: { original: true },
      });
      if (existing) {
        if (canonicalJson(existing.original) !== canonicalJson(original))
          return sendConflict(reply, "Submission identifier already used");
        return reply.code(202).send({ status: "PENDING" });
      }
      try {
        await options.prisma.contribution.create({
          data: {
            submissionId: input.submissionId,
            original,
            pharmacyName: input.name,
            phone: input.phone ?? null,
            address: input.address.line,
            district: input.address.district,
            arrondissement: input.address.arrondissement,
            latitude: input.coordinates?.latitude ?? null,
            longitude: input.coordinates?.longitude ?? null,
            note: input.note ?? null,
            status: "PENDING",
            createdAt: options.now(),
          },
        });
        return reply.code(202).send({ status: "PENDING" });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const concurrent = await options.prisma.contribution.findUnique({
            where: { submissionId: input.submissionId },
            select: { original: true },
          });
          if (
            concurrent &&
            canonicalJson(concurrent.original) === canonicalJson(original)
          )
            return reply.code(202).send({ status: "PENDING" });
        }
        if (mutationError(reply, error)) return;
        throw error;
      }
    },
  );

  app.get(
    "/admin/contributions",
    { preHandler: requireAdministrator },
    async (request, reply) => {
      const parsed = adminContributionListQuerySchema.safeParse(request.query);
      if (!parsed.success) return sendBadRequest(reply);
      const { page, pageSize, status } = parsed.data;
      const where = status ? { status } : {};
      const [records, total] = await Promise.all([
        options.prisma.contribution.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: contributionInclude,
        }),
        options.prisma.contribution.count({ where }),
      ]);
      return {
        data: await Promise.all(
          records.map((record) =>
            serializeContribution(options.prisma, record),
          ),
        ),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    },
  );

  app.get(
    "/admin/contributions/:id",
    { preHandler: requireAdministrator },
    async (request, reply) => {
      const parsed = adminContributionParamsSchema.safeParse(request.params);
      if (!parsed.success) return sendBadRequest(reply);
      return detail(options.prisma, parsed.data.id, reply);
    },
  );

  app.patch(
    "/admin/contributions/:id",
    { preHandler: adminMutations },
    async (request, reply) => {
      const params = adminContributionParamsSchema.safeParse(request.params);
      const parsed = adminContributionCorrectionSchema.safeParse(request.body);
      if (!params.success || !parsed.success) return sendBadRequest(reply);
      const input = parsed.data;
      const administrator = actor(request);
      try {
        const result = await options.prisma.$transaction(
          async (tx) => {
            const locked = await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM Contribution WHERE id = ${params.data.id} FOR UPDATE`;
            if (!locked.length) return "NOT_FOUND" as const;
            const current = await tx.contribution.findUniqueOrThrow({
              where: { id: params.data.id },
              include: contributionInclude,
            });
            if (
              current.status !== "PENDING" ||
              current.version !== input.expectedVersion
            )
              return "CONFLICT" as const;
            if (
              current.notePurgedAt &&
              input.note !== undefined &&
              input.note !== null
            )
              return "NOTE_EXPIRED" as const;
            const before = snapshot(current);
            const after = {
              name: input.name ?? before.name,
              address: input.address ?? before.address,
              phone: input.phone === undefined ? before.phone : input.phone,
              coordinates:
                input.coordinates === undefined
                  ? before.coordinates
                  : input.coordinates,
              note: input.note === undefined ? before.note : input.note,
            };
            const updated = await tx.contribution.update({
              where: { id: current.id },
              data: {
                pharmacyName: after.name,
                address: after.address.line,
                district: after.address.district,
                arrondissement: after.address.arrondissement,
                phone: after.phone,
                latitude: after.coordinates?.latitude ?? null,
                longitude: after.coordinates?.longitude ?? null,
                note: after.note,
                version: { increment: 1 },
              },
            });
            await tx.contributionCorrection.create({
              data: {
                contributionId: current.id,
                version: updated.version,
                before,
                after,
                reason: input.reason,
                correctedById: administrator.id,
                correctedByName: administrator.displayName,
                createdAt: options.now(),
              },
            });
            return "OK" as const;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        if (result === "NOT_FOUND") return sendNotFound(reply);
        if (result === "CONFLICT")
          return sendConflict(
            reply,
            "Contribution changed or already reviewed",
          );
        if (result === "NOTE_EXPIRED")
          return sendConflict(reply, "Note retention period has expired");
        return detail(options.prisma, params.data.id, reply);
      } catch (error) {
        if (mutationError(reply, error)) return;
        throw error;
      }
    },
  );

  for (const action of ["approve", "reject"] as const) {
    app.post(
      `/admin/contributions/:id/${action}`,
      { preHandler: adminMutations },
      async (request, reply) => {
        const params = adminContributionParamsSchema.safeParse(request.params);
        const parsed = adminContributionDecisionSchema.safeParse(request.body);
        if (!params.success || !parsed.success) return sendBadRequest(reply);
        const input = parsed.data;
        const administrator = actor(request);
        try {
          const result = await options.prisma.$transaction(
            async (tx) => {
              const locked = await tx.$queryRaw<
                Array<{ id: string }>
              >`SELECT id FROM Contribution WHERE id = ${params.data.id} FOR UPDATE`;
              if (!locked.length) return "NOT_FOUND" as const;
              const current = await tx.contribution.findUniqueOrThrow({
                where: { id: params.data.id },
                include: contributionInclude,
              });
              if (
                current.status !== "PENDING" ||
                current.version !== input.expectedVersion
              )
                return "CONFLICT" as const;
              let pharmacyId: string | null = null;
              if (action === "approve") {
                if (current.latitude === null || current.longitude === null)
                  return "MISSING_COORDINATES" as const;
                const indicators = await findIndicators(tx, current);
                if (
                  indicators.some(
                    (value) =>
                      value.target === "PHARMACY" &&
                      value.kind === "EXACT_NAME_ADDRESS",
                  )
                )
                  return "EXACT_DUPLICATE" as const;
                if (
                  indicators.length &&
                  input.confirmPossibleDuplicate !== true
                )
                  return "POSSIBLE_DUPLICATE" as const;
                const created = await tx.pharmacy.create({
                  data: {
                    name: current.pharmacyName,
                    phone: current.phone,
                    address: current.address,
                    district: current.district,
                    arrondissement: current.arrondissement,
                    latitude: current.latitude,
                    longitude: current.longitude,
                    status: "DRAFT",
                    matchKey: pharmacyMatchKey(candidate(current)),
                  },
                  select: { id: true },
                });
                pharmacyId = created.id;
              }
              await tx.contribution.update({
                where: { id: current.id },
                data: {
                  status: action === "approve" ? "APPROVED" : "REJECTED",
                  pharmacyId,
                  reviewedById: administrator.id,
                  reviewedByName: administrator.displayName,
                  reviewedAt: options.now(),
                  reviewNote: input.reason,
                  version: { increment: 1 },
                },
              });
              return "OK" as const;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
          if (result === "NOT_FOUND") return sendNotFound(reply);
          if (result === "CONFLICT")
            return sendConflict(
              reply,
              "Contribution changed or already reviewed",
            );
          if (result === "MISSING_COORDINATES")
            return sendConflict(reply, "Coordinates required before approval");
          if (result === "EXACT_DUPLICATE")
            return sendConflict(reply, "Matching pharmacy already exists");
          if (result === "POSSIBLE_DUPLICATE")
            return sendConflict(
              reply,
              "Confirm the displayed duplicate indicators before approval",
            );
          return detail(options.prisma, params.data.id, reply);
        } catch (error) {
          if (mutationError(reply, error)) return;
          throw error;
        }
      },
    );
  }
}
