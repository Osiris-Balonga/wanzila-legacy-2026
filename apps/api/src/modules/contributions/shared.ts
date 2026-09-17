import {
  duplicateIndicators,
  type ContributionCandidate,
} from "@wanzila/domain";
import type { AdminContribution } from "@wanzila/contracts";
import type { Prisma } from "../../generated/prisma/client.js";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";

export const contributionInclude = {
  corrections: { orderBy: { version: "asc" } },
} satisfies Prisma.ContributionInclude;

export type ContributionRecord = Prisma.ContributionGetPayload<{
  include: typeof contributionInclude;
}>;

export function candidate(record: {
  id: string;
  pharmacyName?: string;
  name?: string;
  phone: string | null;
  address: string;
  district: string;
  arrondissement: string;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
}): ContributionCandidate {
  return {
    id: record.id,
    name: record.pharmacyName ?? record.name ?? "",
    phone: record.phone,
    address: record.address,
    district: record.district,
    arrondissement: record.arrondissement,
    latitude: record.latitude === null ? null : Number(record.latitude),
    longitude: record.longitude === null ? null : Number(record.longitude),
  };
}

export async function findIndicators(
  prisma: ApiPrismaClient | Prisma.TransactionClient,
  record: ContributionRecord,
) {
  const [pharmacies, contributions] = await Promise.all([
    prisma.pharmacy.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        district: true,
        arrondissement: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.contribution.findMany({
      where: { status: "PENDING", id: { not: record.id } },
      select: {
        id: true,
        pharmacyName: true,
        phone: true,
        address: true,
        district: true,
        arrondissement: true,
        latitude: true,
        longitude: true,
      },
    }),
  ]);
  return duplicateIndicators(candidate(record), [
    ...pharmacies
      .filter((value) => value.id !== record.pharmacyId)
      .map((value) => ({
        target: "PHARMACY" as const,
        value: candidate(value),
      })),
    ...contributions.map((value) => ({
      target: "CONTRIBUTION" as const,
      value: candidate(value),
    })),
  ]);
}

export async function serializeContribution(
  prisma: ApiPrismaClient | Prisma.TransactionClient,
  record: ContributionRecord,
): Promise<AdminContribution> {
  return {
    id: record.id,
    name: record.pharmacyName,
    address: {
      line: record.address,
      district: record.district,
      arrondissement: record.arrondissement,
    },
    phone: record.phone,
    coordinates:
      record.latitude === null || record.longitude === null
        ? null
        : {
            latitude: Number(record.latitude),
            longitude: Number(record.longitude),
          },
    note: record.note,
    original: record.original,
    status: record.status,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    reviewedByName: record.reviewedByName,
    reviewNote: record.reviewNote,
    pharmacyId: record.pharmacyId,
    duplicates: await findIndicators(prisma, record),
    corrections: record.corrections.map((value) => ({
      version: value.version,
      before: value.before,
      after: value.after,
      reason: value.reason,
      correctedByName: value.correctedByName,
      createdAt: value.createdAt.toISOString(),
    })),
  };
}

export function snapshot(record: ContributionRecord) {
  return {
    name: record.pharmacyName,
    address: {
      line: record.address,
      district: record.district,
      arrondissement: record.arrondissement,
    },
    phone: record.phone,
    coordinates:
      record.latitude === null || record.longitude === null
        ? null
        : {
            latitude: Number(record.latitude),
            longitude: Number(record.longitude),
          },
    note: record.note,
  };
}
