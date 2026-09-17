import type { ApiPrismaClient } from "../../infrastructure/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";

const DAYS_90_MS = 90 * 24 * 60 * 60 * 1000;

function redactNote(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) return Prisma.JsonNull;
  if (typeof value !== "object" || Array.isArray(value)) return value;
  return { ...value, note: null };
}

export async function runContributionRetention(
  prisma: ApiPrismaClient,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - DAYS_90_MS);
  await prisma.contribution.deleteMany({
    where: { status: "REJECTED", reviewedAt: { lte: cutoff } },
  });
  while (true) {
    const expired = await prisma.contribution.findMany({
      where: { createdAt: { lte: cutoff }, notePurgedAt: null },
      select: { id: true },
      take: 100,
      orderBy: { createdAt: "asc" },
    });
    if (!expired.length) break;
    for (const { id } of expired) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.contribution.findUnique({
          where: { id },
          include: { corrections: true },
        });
        if (!current || current.notePurgedAt) return;
        for (const correction of current.corrections) {
          await tx.contributionCorrection.update({
            where: { id: correction.id },
            data: {
              before: redactNote(correction.before),
              after: redactNote(correction.after),
            },
          });
        }
        await tx.contribution.update({
          where: { id },
          data: {
            note: null,
            original: redactNote(current.original),
            notePurgedAt: now,
          },
        });
      });
    }
  }
}
