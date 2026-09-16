import { z } from "zod";

const publicIdSchema = z.uuid();
const nonEmptyTextSchema = z.string().trim().min(1);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "BAD_REQUEST",
      "NOT_FOUND",
      "RATE_LIMITED",
      "CLIENT_ERROR",
      "INTERNAL_ERROR",
      "AUTHENTICATION_REQUIRED",
      "AUTHENTICATION_FAILED",
      "ORIGIN_FORBIDDEN",
      "CONFLICT",
    ]),
    message: z.string(),
  }),
});

export const pharmacyListQuerySchema = z
  .object({
    q: nonEmptyTextSchema.max(180).optional(),
    district: nonEmptyTextSchema.max(120).optional(),
    arrondissement: nonEmptyTextSchema.max(120).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const pharmacyPathParamsSchema = z
  .object({ id: publicIdSchema })
  .strict();

export const sourceFreshnessSchema = z.enum(["FRESH", "STALE", "UNKNOWN"]);

export const currentDutySchema = z.object({
  state: z.literal("ACTIVE"),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  sourceFreshness: sourceFreshnessSchema,
  source: z
    .object({
      name: z.string(),
      observedAt: z.string().datetime(),
    })
    .optional(),
});

export const publicPharmacySchema = z.object({
  id: publicIdSchema,
  name: z.string(),
  address: z.object({
    line: z.string(),
    district: z.string(),
    arrondissement: z.string(),
  }),
  phone: z.string().optional(),
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  currentDuty: currentDutySchema.optional(),
});

export const activePublicPharmacySchema = publicPharmacySchema.extend({
  currentDuty: currentDutySchema,
});

export const pharmacyListResponseSchema = z.object({
  data: z.array(activePublicPharmacySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const pharmacyDetailResponseSchema = z.object({
  data: publicPharmacySchema,
});

export const emergencyContactSchema = z
  .object({
    id: publicIdSchema,
    label: z.string(),
    phone: z.string(),
    position: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const emergencyContactsResponseSchema = z
  .object({
    data: z.array(emergencyContactSchema),
  })
  .strict();

export type ApiError = z.infer<typeof apiErrorSchema>;
export type PharmacyListQuery = z.infer<typeof pharmacyListQuerySchema>;
export type PharmacyPathParams = z.infer<typeof pharmacyPathParamsSchema>;
export type CurrentDuty = z.infer<typeof currentDutySchema>;
export type PublicPharmacy = z.infer<typeof publicPharmacySchema>;
export type ActivePublicPharmacy = z.infer<typeof activePublicPharmacySchema>;
export type PharmacyListResponse = z.infer<typeof pharmacyListResponseSchema>;
export type PharmacyDetailResponse = z.infer<
  typeof pharmacyDetailResponseSchema
>;
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;
export type EmergencyContactsResponse = z.infer<
  typeof emergencyContactsResponseSchema
>;
