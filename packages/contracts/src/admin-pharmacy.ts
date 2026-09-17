import { z } from "zod";
import {
  pharmacyPhotoSchema,
  pharmacyRecordProvenanceSchema,
} from "./public-api.js";

const identifierSchema = z.uuid();
const textSchema = z.string().trim().min(1);
const phoneSchema = textSchema
  .max(32)
  .regex(/^\+?[0-9][0-9 .()-]{5,31}$/, "Invalid phone number");
const timestampSchema = z.string().datetime({ offset: true });

export const adminPharmacyStatusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);

export const adminPharmacyAddressSchema = z
  .object({
    line: textSchema.max(255),
    district: textSchema.max(120),
    arrondissement: textSchema.max(120),
  })
  .strict();

export const adminPharmacyCoordinatesSchema = z
  .object({
    latitude: z.number().finite().gte(-90).lte(90),
    longitude: z.number().finite().gte(-180).lte(180),
  })
  .strict();

export const adminPharmacySchema = z
  .object({
    id: identifierSchema,
    name: textSchema.max(180),
    address: adminPharmacyAddressSchema,
    phone: phoneSchema.optional(),
    coordinates: adminPharmacyCoordinatesSchema,
    status: adminPharmacyStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    photo: pharmacyPhotoSchema.optional(),
    recordProvenance: pharmacyRecordProvenanceSchema.optional(),
  })
  .strict();

export const adminPharmacyListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    name: textSchema.max(180).optional(),
    district: textSchema.max(120).optional(),
    arrondissement: textSchema.max(120).optional(),
    status: adminPharmacyStatusSchema.optional(),
  })
  .strict();

export const adminPharmacyPathParamsSchema = z
  .object({ id: identifierSchema })
  .strict();

export const createAdminPharmacyRequestSchema = z
  .object({
    name: textSchema.max(180),
    address: adminPharmacyAddressSchema,
    phone: phoneSchema.optional(),
    coordinates: adminPharmacyCoordinatesSchema,
    recordProvenance: pharmacyRecordProvenanceSchema.optional(),
  })
  .strict();

export const updateAdminPharmacyRequestSchema = createAdminPharmacyRequestSchema
  .partial()
  .extend({
    phone: phoneSchema.nullable().optional(),
    photo: pharmacyPhotoSchema.nullable().optional(),
    recordProvenance: pharmacyRecordProvenanceSchema.nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one pharmacy field is required.",
  );

export const adminPharmacyResponseSchema = z
  .object({ data: adminPharmacySchema })
  .strict();

export const adminPharmacyListResponseSchema = z
  .object({
    data: z.array(adminPharmacySchema),
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

export const adminPharmacyErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum([
          "BAD_REQUEST",
          "NOT_FOUND",
          "AUTHENTICATION_REQUIRED",
          "ORIGIN_FORBIDDEN",
          "CONFLICT",
        ]),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type AdminPharmacyStatus = z.infer<typeof adminPharmacyStatusSchema>;
export type AdminPharmacy = z.infer<typeof adminPharmacySchema>;
export type AdminPharmacyListQuery = z.infer<
  typeof adminPharmacyListQuerySchema
>;
export type CreateAdminPharmacyRequest = z.infer<
  typeof createAdminPharmacyRequestSchema
>;
export type UpdateAdminPharmacyRequest = z.infer<
  typeof updateAdminPharmacyRequestSchema
>;
export type AdminPharmacyResponse = z.infer<typeof adminPharmacyResponseSchema>;
export type AdminPharmacyListResponse = z.infer<
  typeof adminPharmacyListResponseSchema
>;
export type AdminPharmacyError = z.infer<typeof adminPharmacyErrorSchema>;
