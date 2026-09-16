import { z } from "zod";
import { sourceFreshnessSchema } from "./public-api.js";

const id = z.uuid();
const text = z.string().trim().min(1);
const timestamp = z.string().datetime({ offset: true });
const page = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(50).default(20);
const directorySearch = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1).max(180));
const pagination = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

const intervalFields = { startsAt: timestamp, endsAt: timestamp };
const validInterval = (value: { startsAt: string; endsAt: string }) =>
  new Date(value.startsAt).getTime() < new Date(value.endsAt).getTime();
const nonEmptyPatch = (value: object) => Object.keys(value).length > 0;
const validPartialInterval = (value: {
  startsAt?: string | undefined;
  endsAt?: string | undefined;
}) =>
  !value.startsAt ||
  !value.endsAt ||
  validInterval({ startsAt: value.startsAt, endsAt: value.endsAt });

export const adminScheduleSourcePathParamsSchema = z.object({ id }).strict();
export const adminDutyPathParamsSchema = z.object({ id }).strict();
export const adminDutyExceptionPathParamsSchema = z
  .object({ id, exceptionId: id })
  .strict();
export const adminDutyReviewStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export const adminDutyExceptionKindSchema = z.enum([
  "CANCELLED",
  "UNAVAILABLE",
]);

export const createAdminScheduleSourceRequestSchema = z
  .object({
    name: text.max(180),
    description: text.optional(),
    reliability: z.number().int().min(0).max(100).optional(),
    observedAt: timestamp,
  })
  .strict();

export const updateAdminScheduleSourceRequestSchema =
  createAdminScheduleSourceRequestSchema
    .partial()
    .extend({ description: text.nullable().optional() })
    .refine(nonEmptyPatch, "At least one source field is required.");

export const adminScheduleSourceSchema = z
  .object({
    id,
    name: text.max(180),
    description: text.optional(),
    reliability: z.number().int().min(0).max(100),
    observedAt: timestamp,
    updatedAt: timestamp,
    freshness: sourceFreshnessSchema.exclude(["UNKNOWN"]),
  })
  .strict();

export const adminScheduleSourceListQuerySchema = z
  .object({ page, pageSize })
  .strict();
export const adminScheduleSourceResponseSchema = z
  .object({ data: adminScheduleSourceSchema })
  .strict();
export const adminScheduleSourceListResponseSchema = z
  .object({
    data: z.array(adminScheduleSourceSchema),
    pagination,
  })
  .strict();

export const createAdminDutyRequestSchema = z
  .object({
    pharmacyId: id,
    sourceId: id.nullable().optional(),
    ...intervalFields,
  })
  .strict()
  .refine(validInterval, "endsAt must be strictly after startsAt.");

export const updateAdminDutyRequestSchema = z
  .object({
    pharmacyId: id.optional(),
    sourceId: id.nullable().optional(),
    startsAt: timestamp.optional(),
    endsAt: timestamp.optional(),
  })
  .strict()
  .refine(nonEmptyPatch, "At least one duty field is required.")
  .refine(validPartialInterval, "endsAt must be strictly after startsAt.");

export const adminDutySchema = z
  .object({
    id,
    pharmacyId: id,
    sourceId: id.nullable(),
    ...intervalFields,
    status: adminDutyReviewStatusSchema,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const adminDutyListQuerySchema = z
  .object({
    page,
    pageSize,
    q: directorySearch.optional(),
    pharmacyId: id.optional(),
    sourceId: id.optional(),
    status: adminDutyReviewStatusSchema.optional(),
    from: timestamp.optional(),
    to: timestamp.optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.from ||
      !value.to ||
      new Date(value.from).getTime() < new Date(value.to).getTime(),
    "to must be strictly after from.",
  );
export const adminDutyResponseSchema = z
  .object({ data: adminDutySchema })
  .strict();
export const adminDutyListResponseSchema = z
  .object({
    data: z.array(adminDutySchema),
    pagination,
  })
  .strict();

export const adminDutySummaryQuerySchema = z.object({}).strict();
export const adminDutySummaryResponseSchema = z
  .object({
    data: z
      .object({
        asOf: timestamp,
        active: z.number().int().nonnegative(),
        upcoming: z.number().int().nonnegative(),
        expired: z.number().int().nonnegative(),
        withoutRecentDuty: z
          .number()
          .int()
          .nonnegative()
          .describe(
            "Published pharmacies without an APPROVED duty period with startsAt <= asOf and endsAt > asOf minus 30 days; covering exceptions do not remove period presence.",
          ),
      })
      .strict(),
  })
  .strict();

export const createAdminDutyExceptionRequestSchema = z
  .object({
    kind: adminDutyExceptionKindSchema,
    ...intervalFields,
    reason: text.max(255).optional(),
  })
  .strict()
  .refine(validInterval, "endsAt must be strictly after startsAt.");

export const updateAdminDutyExceptionRequestSchema = z
  .object({
    kind: adminDutyExceptionKindSchema.optional(),
    startsAt: timestamp.optional(),
    endsAt: timestamp.optional(),
    reason: text.max(255).nullable().optional(),
  })
  .strict()
  .refine(nonEmptyPatch, "At least one exception field is required.")
  .refine(validPartialInterval, "endsAt must be strictly after startsAt.");

export const adminDutyExceptionSchema = z
  .object({
    id,
    dutyPeriodId: id,
    kind: adminDutyExceptionKindSchema,
    ...intervalFields,
    reason: text.max(255).optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const adminDutyExceptionListQuerySchema = z
  .object({ page, pageSize })
  .strict();
export const adminDutyExceptionResponseSchema = z
  .object({ data: adminDutyExceptionSchema })
  .strict();
export const adminDutyExceptionListResponseSchema = z
  .object({
    data: z.array(adminDutyExceptionSchema),
    pagination,
  })
  .strict();

export const adminDutyErrorSchema = z
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

export type AdminScheduleSource = z.infer<typeof adminScheduleSourceSchema>;
export type AdminDuty = z.infer<typeof adminDutySchema>;
export type AdminDutyException = z.infer<typeof adminDutyExceptionSchema>;
