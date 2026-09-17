import { z } from "zod";
import { adminPharmacyCoordinatesSchema } from "./admin-pharmacy.js";

const text = z.string().trim().min(1);
const phone = text.max(32).regex(/^\+?[0-9][0-9 .()-]{5,31}$/);
const address = z
  .object({
    line: text.max(255),
    district: text.max(120),
    arrondissement: text.max(120),
  })
  .strict();

export const contributionFieldsSchema = z
  .object({
    name: text.max(180),
    address,
    phone: phone.optional(),
    coordinates: adminPharmacyCoordinatesSchema.optional(),
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export const createContributionRequestSchema = contributionFieldsSchema
  .extend({
    submissionId: z.uuid(),
  })
  .strict();

export const contributionSubmissionResponseSchema = z
  .object({
    status: z.literal("PENDING"),
  })
  .strict();

export const adminContributionStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export const adminContributionListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    status: adminContributionStatusSchema.optional(),
  })
  .strict();

export const adminContributionParamsSchema = z
  .object({ id: z.uuid() })
  .strict();
export const adminContributionCorrectionSchema = contributionFieldsSchema
  .partial()
  .extend({
    phone: phone.nullable().optional(),
    coordinates: adminPharmacyCoordinatesSchema.nullable().optional(),
    note: z.string().trim().max(200).nullable().optional(),
    expectedVersion: z.number().int().nonnegative(),
    reason: text.max(500),
  })
  .strict()
  .refine((value) =>
    Object.keys(value).some(
      (key) => !["expectedVersion", "reason"].includes(key),
    ),
  );

export const adminContributionDecisionSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    reason: text.max(500),
    confirmPossibleDuplicate: z.boolean().optional(),
  })
  .strict();

export const contributionDuplicateSchema = z
  .object({
    kind: z.enum(["EXACT_NAME_ADDRESS", "PHONE", "NEARBY"]),
    target: z.enum(["PHARMACY", "CONTRIBUTION"]),
    id: z.uuid(),
    distanceMeters: z.number().nonnegative().optional(),
  })
  .strict();

export const adminContributionSchema = contributionFieldsSchema
  .omit({ note: true })
  .extend({
    id: z.uuid(),
    note: z.string().nullable(),
    coordinates: adminPharmacyCoordinatesSchema.nullable(),
    phone: phone.nullable(),
    original: z.unknown().nullable(),
    status: adminContributionStatusSchema,
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    reviewedAt: z.string().datetime().nullable(),
    reviewedByName: z.string().nullable(),
    reviewNote: z.string().nullable(),
    pharmacyId: z.uuid().nullable(),
    duplicates: z.array(contributionDuplicateSchema),
    corrections: z.array(
      z
        .object({
          version: z.number().int().positive(),
          before: z.unknown(),
          after: z.unknown(),
          reason: z.string(),
          correctedByName: z.string(),
          createdAt: z.string().datetime(),
        })
        .strict(),
    ),
  })
  .strict();

export const adminContributionResponseSchema = z
  .object({ data: adminContributionSchema })
  .strict();
export const adminContributionListResponseSchema = z
  .object({
    data: z.array(adminContributionSchema),
    pagination: z
      .object({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type CreateContributionRequest = z.infer<
  typeof createContributionRequestSchema
>;
export type AdminContribution = z.infer<typeof adminContributionSchema>;
