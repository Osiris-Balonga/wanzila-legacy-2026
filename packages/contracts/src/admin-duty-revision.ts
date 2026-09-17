import { z } from "zod";

const id = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const note = z.string().trim().min(1).max(500);
const interval = {
  sourceId: id.nullable(),
  startsAt: timestamp,
  endsAt: timestamp,
};
const snapshot = z.object(interval).strict();
const actor = z
  .object({ id, displayName: z.string().min(1).max(120) })
  .strict();
const pagination = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const adminDutyRevisionPathParamsSchema = z
  .object({ id, revisionId: id })
  .strict();

export const createAdminDutyRevisionRequestSchema = z
  .object({ ...interval, note })
  .strict()
  .refine(
    (value) => Date.parse(value.startsAt) < Date.parse(value.endsAt),
    "endsAt must be strictly after startsAt",
  );

export const reviewAdminDutyRevisionRequestSchema = z
  .object({ note: note.optional() })
  .strict();

export const adminDutyRevisionListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const adminDutyRevisionSchema = z
  .object({
    id,
    dutyPeriodId: id,
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    baseVersion: z.number().int().nonnegative(),
    before: snapshot,
    proposed: snapshot,
    submittedBy: actor,
    submittedAt: timestamp,
    submissionNote: note,
    reviewedBy: actor.nullable(),
    reviewedAt: timestamp.nullable(),
    reviewNote: note.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.status === "PENDING"
        ? value.reviewedBy === null && value.reviewedAt === null
        : value.reviewedBy !== null && value.reviewedAt !== null,
    "review audit is required exactly for terminal revisions",
  );

export const adminDutyRevisionResponseSchema = z
  .object({ data: adminDutyRevisionSchema })
  .strict();

export const adminDutyRevisionListResponseSchema = z
  .object({ data: z.array(adminDutyRevisionSchema), pagination })
  .strict();

export type AdminDutyRevision = z.infer<typeof adminDutyRevisionSchema>;
