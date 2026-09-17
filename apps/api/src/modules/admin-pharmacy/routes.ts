import {
  adminPharmacyListQuerySchema,
  adminPharmacyResponseSchema,
  adminPharmacyPathParamsSchema,
  adminPharmacyStatusSchema,
  createAdminPharmacyRequestSchema,
  type AdminPharmacy,
  type AdminPharmacyListResponse,
  type AdminPharmacyResponse,
  updateAdminPharmacyRequestSchema,
} from "@wanzila/contracts";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "../../generated/prisma/client.js";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";
import {
  sendBadRequest,
  sendConflict,
  sendNotFound,
} from "../shared/http-errors.js";
import {
  createAdministratorAuthorizationPreHandler,
  createAllowedOriginPreHandler,
} from "../admin-auth/authorization.js";
import {
  approvedPhoto,
  serializedPhoto,
  serializedRecordProvenance,
} from "../shared/pharmacy-photo-registry.js";

const pharmacySelect = {
  id: true,
  name: true,
  phone: true,
  address: true,
  district: true,
  arrondissement: true,
  latitude: true,
  longitude: true,
  recordSource: true,
  recordVerifiedAt: true,
  photoAssetPath: true,
  photoSource: true,
  photoCredit: true,
  photoRights: true,
  photoVerifiedAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PharmacySelect;

type PharmacyRecord = Prisma.PharmacyGetPayload<{
  select: typeof pharmacySelect;
}>;

export interface AdminPharmacyRouteOptions {
  prisma: ApiPrismaClient;
  now: () => Date;
  webOrigin: string;
}

function serialize(pharmacy: PharmacyRecord): AdminPharmacy {
  const photo = serializedPhoto(pharmacy);
  const recordProvenance = serializedRecordProvenance(pharmacy);
  return {
    id: pharmacy.id,
    name: pharmacy.name,
    address: {
      line: pharmacy.address,
      district: pharmacy.district,
      arrondissement: pharmacy.arrondissement,
    },
    ...(pharmacy.phone ? { phone: pharmacy.phone } : {}),
    coordinates: {
      latitude: Number(pharmacy.latitude),
      longitude: Number(pharmacy.longitude),
    },
    status: pharmacy.status,
    createdAt: pharmacy.createdAt.toISOString(),
    updatedAt: pharmacy.updatedAt.toISOString(),
    ...(photo ? { photo } : {}),
    ...(recordProvenance ? { recordProvenance } : {}),
  };
}

function normalized(...values: string[]): string {
  return values.map((value) => value.trim().toLocaleLowerCase("fr")).join("|");
}

function duplicateKey(input: {
  name: string;
  address: { line: string; district: string; arrondissement: string };
}): string {
  return normalized(
    input.name,
    input.address.line,
    input.address.district,
    input.address.arrondissement,
  );
}

async function findPharmacy(
  prisma: ApiPrismaClient,
  id: string,
): Promise<PharmacyRecord | null> {
  return prisma.pharmacy.findUnique({ where: { id }, select: pharmacySelect });
}

export function registerAdminPharmacyRoutes(
  app: FastifyInstance,
  options: AdminPharmacyRouteOptions,
): void {
  const requireAdministrator = createAdministratorAuthorizationPreHandler({
    prisma: options.prisma,
    now: options.now,
  });
  const requireOrigin = createAllowedOriginPreHandler({
    webOrigin: options.webOrigin,
  });
  const mutationGuards = [requireAdministrator, requireOrigin];

  app.get(
    "/admin/pharmacies",
    { preHandler: requireAdministrator },
    async (request, reply): Promise<AdminPharmacyListResponse | void> => {
      const query = adminPharmacyListQuerySchema.safeParse(request.query);
      if (!query.success) return sendBadRequest(reply);
      const where: Prisma.PharmacyWhereInput = {};
      if (query.data.name) where.name = { contains: query.data.name };
      if (query.data.district) where.district = query.data.district;
      if (query.data.arrondissement)
        where.arrondissement = query.data.arrondissement;
      if (query.data.status) where.status = query.data.status;
      const skip = (query.data.page - 1) * query.data.pageSize;
      const [records, total] = await Promise.all([
        options.prisma.pharmacy.findMany({
          where,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip,
          take: query.data.pageSize,
          select: pharmacySelect,
        }),
        options.prisma.pharmacy.count({ where }),
      ]);
      return {
        data: records.map(serialize),
        pagination: {
          page: query.data.page,
          pageSize: query.data.pageSize,
          total,
          totalPages: Math.ceil(total / query.data.pageSize),
        },
      };
    },
  );

  app.get(
    "/admin/pharmacies/:id",
    { preHandler: requireAdministrator },
    async (request, reply): Promise<AdminPharmacyResponse | void> => {
      const params = adminPharmacyPathParamsSchema.safeParse(request.params);
      if (!params.success) return sendBadRequest(reply);
      const pharmacy = await findPharmacy(options.prisma, params.data.id);
      if (!pharmacy) return sendNotFound(reply);
      return adminPharmacyResponseSchema.parse({ data: serialize(pharmacy) });
    },
  );

  app.post(
    "/admin/pharmacies",
    { preHandler: mutationGuards },
    async (request, reply): Promise<AdminPharmacyResponse | void> => {
      const input = createAdminPharmacyRequestSchema.safeParse(request.body);
      if (!input.success) return sendBadRequest(reply);
      if (
        input.data.recordProvenance &&
        Date.parse(input.data.recordProvenance.verifiedAt) >
          options.now().getTime()
      )
        return sendBadRequest(reply);
      const inputKey = duplicateKey(input.data);
      const candidates = await options.prisma.pharmacy.findMany({
        select: {
          name: true,
          address: true,
          district: true,
          arrondissement: true,
        },
      });
      if (
        candidates.some(
          (candidate) =>
            normalized(
              candidate.name,
              candidate.address,
              candidate.district,
              candidate.arrondissement,
            ) === inputKey,
        )
      ) {
        return sendConflict(reply, "A matching pharmacy already exists");
      }
      const created = await options.prisma.pharmacy.create({
        data: {
          name: input.data.name,
          address: input.data.address.line,
          district: input.data.address.district,
          arrondissement: input.data.address.arrondissement,
          ...(input.data.phone ? { phone: input.data.phone } : {}),
          latitude: input.data.coordinates.latitude,
          longitude: input.data.coordinates.longitude,
          status: "DRAFT",
          ...(input.data.recordProvenance
            ? {
                recordSource: input.data.recordProvenance.source,
                recordVerifiedAt: new Date(
                  input.data.recordProvenance.verifiedAt,
                ),
              }
            : {}),
        },
        select: pharmacySelect,
      });
      return reply.code(201).send({ data: serialize(created) });
    },
  );

  app.patch(
    "/admin/pharmacies/:id",
    { preHandler: mutationGuards },
    async (request, reply): Promise<AdminPharmacyResponse | void> => {
      const params = adminPharmacyPathParamsSchema.safeParse(request.params);
      const input = updateAdminPharmacyRequestSchema.safeParse(request.body);
      if (!params.success || !input.success) return sendBadRequest(reply);
      if (
        (input.data.photo &&
          !approvedPhoto(input.data.photo, params.data.id)) ||
        (input.data.recordProvenance &&
          Date.parse(input.data.recordProvenance.verifiedAt) >
            options.now().getTime())
      )
        return sendBadRequest(reply);
      const existing = await findPharmacy(options.prisma, params.data.id);
      if (!existing) return sendNotFound(reply);
      const updated = await options.prisma.pharmacy.update({
        where: { id: params.data.id },
        data: {
          ...(input.data.name ? { name: input.data.name } : {}),
          ...(input.data.phone === undefined
            ? {}
            : { phone: input.data.phone }),
          ...(input.data.address
            ? {
                address: input.data.address.line,
                district: input.data.address.district,
                arrondissement: input.data.address.arrondissement,
              }
            : {}),
          ...(input.data.coordinates
            ? {
                latitude: input.data.coordinates.latitude,
                longitude: input.data.coordinates.longitude,
              }
            : {}),
          ...(input.data.recordProvenance === undefined
            ? {}
            : input.data.recordProvenance === null
              ? { recordSource: null, recordVerifiedAt: null }
              : {
                  recordSource: input.data.recordProvenance.source,
                  recordVerifiedAt: new Date(
                    input.data.recordProvenance.verifiedAt,
                  ),
                }),
          ...(input.data.photo === undefined
            ? {}
            : input.data.photo === null
              ? {
                  photoAssetPath: null,
                  photoSource: null,
                  photoCredit: null,
                  photoRights: null,
                  photoVerifiedAt: null,
                }
              : {
                  photoAssetPath: input.data.photo.assetPath,
                  photoSource: input.data.photo.source,
                  photoCredit: input.data.photo.credit,
                  photoRights: input.data.photo.rights,
                  photoVerifiedAt: new Date(input.data.photo.verifiedAt),
                }),
        },
        select: pharmacySelect,
      });
      return { data: serialize(updated) };
    },
  );

  for (const [action, target, allowed] of [
    ["publish", "PUBLISHED", ["DRAFT"]],
    ["archive", "ARCHIVED", ["DRAFT", "PUBLISHED"]],
  ] as const) {
    app.post(
      `/admin/pharmacies/:id/${action}`,
      { preHandler: mutationGuards },
      async (request, reply): Promise<AdminPharmacyResponse | void> => {
        const params = adminPharmacyPathParamsSchema.safeParse(request.params);
        if (!params.success) return sendBadRequest(reply);
        const pharmacy = await findPharmacy(options.prisma, params.data.id);
        if (!pharmacy) return sendNotFound(reply);
        if (!(allowed as readonly string[]).includes(pharmacy.status)) {
          return sendConflict(reply, "Invalid pharmacy status transition");
        }
        const status = adminPharmacyStatusSchema.parse(target);
        const updated = await options.prisma.pharmacy.update({
          where: { id: pharmacy.id },
          data: { status },
          select: pharmacySelect,
        });
        return { data: serialize(updated) };
      },
    );
  }
}
