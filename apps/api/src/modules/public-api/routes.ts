import type {
  ActivePublicPharmacy,
  CurrentDuty,
  PharmacyDetailResponse,
  PharmacyListResponse,
  PublicPharmacy,
} from "@wanzila/contracts";
import {
  pharmacyListQuerySchema,
  pharmacyPathParamsSchema,
} from "@wanzila/contracts";
import {
  findActiveDuty,
  resolveDutyState,
  type DutyPeriodInput,
} from "@wanzila/domain";
import type { FastifyInstance } from "fastify";
import { Prisma } from "../../generated/prisma/client.js";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";
import { sendBadRequest, sendNotFound } from "../shared/http-errors.js";

const pharmacySelect = {
  id: true,
  name: true,
  phone: true,
  address: true,
  district: true,
  arrondissement: true,
  latitude: true,
  longitude: true,
  duties: {
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: {
      startsAt: true,
      endsAt: true,
      status: true,
      source: { select: { name: true, observedAt: true } },
      exceptions: {
        select: { kind: true, startsAt: true, endsAt: true },
      },
    },
  },
} satisfies Prisma.PharmacySelect;

type PharmacyRecord = Prisma.PharmacyGetPayload<{
  select: typeof pharmacySelect;
}>;

type DutyCandidate = DutyPeriodInput & {
  source: { name: string; observedAt: Date } | null;
};

export interface PublicApiRouteOptions {
  prisma: ApiPrismaClient;
  now: () => Date;
  sourceFreshnessMaxAgeMs: number;
}

function dutyForPharmacy(
  pharmacy: PharmacyRecord,
  at: Date,
  sourceFreshnessMaxAgeMs: number,
): CurrentDuty | undefined {
  const dutyCandidates: DutyCandidate[] = pharmacy.duties.map((duty) => ({
    ...duty,
    sourceObservedAt: duty.source?.observedAt ?? null,
  }));
  const activeDuty = findActiveDuty(dutyCandidates, {
    at,
    sourceFreshnessMaxAgeMs,
  });

  if (!activeDuty) {
    return undefined;
  }

  const state = resolveDutyState(activeDuty, {
    at,
    sourceFreshnessMaxAgeMs,
  });

  const duty: CurrentDuty = {
    state: "ACTIVE",
    startsAt: activeDuty.startsAt.toISOString(),
    endsAt: activeDuty.endsAt.toISOString(),
    sourceFreshness: state.sourceFreshness,
  };

  if (activeDuty.source) {
    duty.source = {
      name: activeDuty.source.name,
      observedAt: activeDuty.source.observedAt.toISOString(),
    };
  }

  return duty;
}

function serializePharmacy(
  pharmacy: PharmacyRecord,
  at: Date,
  sourceFreshnessMaxAgeMs: number,
): PublicPharmacy {
  const result: PublicPharmacy = {
    id: pharmacy.id,
    name: pharmacy.name,
    address: {
      line: pharmacy.address,
      district: pharmacy.district,
      arrondissement: pharmacy.arrondissement,
    },
    coordinates: {
      latitude: Number(pharmacy.latitude),
      longitude: Number(pharmacy.longitude),
    },
  };

  if (pharmacy.phone) {
    result.phone = pharmacy.phone;
  }

  const currentDuty = dutyForPharmacy(pharmacy, at, sourceFreshnessMaxAgeMs);
  if (currentDuty) {
    result.currentDuty = currentDuty;
  }

  return result;
}

function activeDutyWhere(at: Date): Prisma.DutyPeriodListRelationFilter {
  return {
    some: {
      startsAt: { lte: at },
      endsAt: { gt: at },
      status: "APPROVED",
      exceptions: {
        none: {
          startsAt: { lte: at },
          endsAt: { gt: at },
        },
      },
    },
  };
}

export function registerPublicPharmacyRoutes(
  app: FastifyInstance,
  options: PublicApiRouteOptions,
): void {
  app.get(
    "/pharmacies",
    async (request, reply): Promise<PharmacyListResponse | void> => {
      const query = pharmacyListQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply);
      }

      const at = options.now();
      const where: Prisma.PharmacyWhereInput = {
        status: "PUBLISHED",
        duties: activeDutyWhere(at),
      };
      if (query.data.q) {
        where.name = { contains: query.data.q };
      }
      if (query.data.district) {
        where.district = query.data.district;
      }
      if (query.data.arrondissement) {
        where.arrondissement = query.data.arrondissement;
      }

      const start = (query.data.page - 1) * query.data.pageSize;
      const [pharmacies, total] = await options.prisma.$transaction(
        [
          options.prisma.pharmacy.findMany({
            where,
            orderBy: [{ name: "asc" }, { id: "asc" }],
            skip: start,
            take: query.data.pageSize,
            select: pharmacySelect,
          }),
          options.prisma.pharmacy.count({ where }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      const activePharmacies: ActivePublicPharmacy[] = pharmacies.flatMap(
        (pharmacy) => {
          const serialized = serializePharmacy(
            pharmacy,
            at,
            options.sourceFreshnessMaxAgeMs,
          );
          return serialized.currentDuty
            ? [serialized as ActivePublicPharmacy]
            : [];
        },
      );

      return {
        data: activePharmacies,
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
    "/pharmacies/:id",
    async (request, reply): Promise<PharmacyDetailResponse | void> => {
      const params = pharmacyPathParamsSchema.safeParse(request.params);
      if (!params.success) {
        return sendBadRequest(reply);
      }

      const pharmacy = await options.prisma.pharmacy.findFirst({
        where: { id: params.data.id, status: "PUBLISHED" },
        select: pharmacySelect,
      });
      if (!pharmacy) {
        return sendNotFound(reply);
      }

      return {
        data: serializePharmacy(
          pharmacy,
          options.now(),
          options.sourceFreshnessMaxAgeMs,
        ),
      };
    },
  );
}
