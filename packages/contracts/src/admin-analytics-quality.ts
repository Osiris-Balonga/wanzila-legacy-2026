import { z } from "zod";

const pageSchema = z.coerce.number().int().min(1).max(10_000);
const pageSizeSchema = z.coerce.number().int().min(1).max(50);
const countSchema = z.number().int().nonnegative();
const ratioSchema = z.number().finite().min(0).max(1).nullable();
const paginationSchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    total: countSchema,
    totalPages: countSchema,
  })
  .strict();

export const adminAnalyticsQualityQuerySchema = z
  .object({
    sourcePage: pageSchema.default(1),
    sourcePageSize: pageSizeSchema.default(20),
    coveragePage: pageSchema.default(1),
    coveragePageSize: pageSizeSchema.default(20),
  })
  .strict();

export const adminAnalyticsQualityResponseSchema = z
  .object({
    data: z
      .object({
        version: z.literal(1),
        asOf: z.iso.datetime(),
        timeZone: z.literal("Africa/Brazzaville"),
        sources: z
          .object({
            data: z
              .array(
                z
                  .object({
                    id: z.uuid(),
                    name: z.string().min(1),
                    description: z.string().nullable(),
                    observedAt: z.iso.datetime(),
                    reliability: z.number().int().min(0).max(100),
                    freshness: z.enum(["FRESH", "STALE"]),
                    currentApprovedDutyPeriods: countSchema,
                  })
                  .strict(),
              )
              .max(50),
            pagination: paginationSchema,
            totals: z
              .object({
                registered: countSchema,
                fresh: countSchema,
                stale: countSchema,
                withSourceCurrentDutyPeriods: countSchema,
                withoutSourceCurrentDutyPeriods: countSchema,
                currentDutyPeriodsAfterExceptions: countSchema,
              })
              .strict(),
          })
          .strict(),
        coverage: z
          .object({
            data: z
              .array(
                z
                  .object({
                    arrondissement: z.string().max(120),
                    publishedPharmacies: countSchema,
                    withCurrentApprovedDuty: countSchema,
                    ratio: ratioSchema,
                  })
                  .strict(),
              )
              .max(50),
            pagination: paginationSchema,
            totals: z
              .object({
                publishedPharmacies: countSchema,
                withCurrentApprovedDuty: countSchema,
                ratio: ratioSchema,
              })
              .strict(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type AdminAnalyticsQualityQuery = z.infer<
  typeof adminAnalyticsQualityQuerySchema
>;
export type AdminAnalyticsQualityResponse = z.infer<
  typeof adminAnalyticsQualityResponseSchema
>;
