import { z } from "zod";

export const adminAnalyticsWindowSchema = z.enum(["7d", "30d"]);

export const adminAnalyticsOverviewQuerySchema = z
  .object({ window: adminAnalyticsWindowSchema.default("7d") })
  .strict();

export const adminAnalyticsEventNames = [
  "discovery_viewed",
  "search_submitted",
  "pharmacy_detail_viewed",
  "pharmacy_call_started",
  "route_started",
  "arrival_confirmed",
  "empty_results_shown",
] as const;

const countSchema = z.number().int().nonnegative();
const eventCountsSchema = z
  .object(
    Object.fromEntries(
      adminAnalyticsEventNames.map((name) => [name, countSchema]),
    ) as Record<(typeof adminAnalyticsEventNames)[number], typeof countSchema>,
  )
  .strict();
const usageSchema = z
  .object({
    value: z.string().trim().min(1).max(120),
    applications: countSchema.positive(),
  })
  .strict();

export const adminAnalyticsOverviewResponseSchema = z
  .object({
    data: z
      .object({
        version: z.literal(1),
        window: adminAnalyticsWindowSchema,
        period: z
          .object({
            timeZone: z.literal("Africa/Brazzaville"),
            from: z.iso.datetime(),
            to: z.iso.datetime(),
            asOf: z.iso.datetime(),
          })
          .strict(),
        events: z
          .object({
            totals: eventCountsSchema,
            daily: z
              .array(
                z
                  .object({
                    date: z.iso.date(),
                    counts: eventCountsSchema,
                  })
                  .strict(),
              )
              .min(7)
              .max(30),
          })
          .strict(),
        topPharmacies: z
          .array(
            z
              .object({
                pharmacyId: z.uuid(),
                name: z.string().trim().min(1).nullable(),
                coordinates: z
                  .object({
                    latitude: z.number().finite().min(-90).max(90),
                    longitude: z.number().finite().min(-180).max(180),
                  })
                  .strict()
                  .nullable(),
                detailViews: countSchema.positive(),
              })
              .strict(),
          )
          .max(5),
        filterUsage: z
          .object({
            districts: z.array(usageSchema).max(5),
            arrondissements: z.array(usageSchema).max(5),
          })
          .strict(),
        quality: z
          .object({
            publishedPharmacies: countSchema,
            pendingContributions: countSchema,
            unresolvedReports: countSchema,
            currentApprovedDutyPeriods: countSchema,
            currentDutyPeriodsExcludedByExceptions: countSchema,
            currentDutyPeriodsAfterExceptions: countSchema,
            currentDutySourceFreshness: z
              .object({
                fresh: countSchema,
                stale: countSchema,
                unknown: countSchema,
              })
              .strict(),
            registeredSources: z
              .object({ fresh: countSchema, stale: countSchema })
              .strict(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type AdminAnalyticsWindow = z.infer<typeof adminAnalyticsWindowSchema>;
export type AdminAnalyticsOverviewQuery = z.infer<
  typeof adminAnalyticsOverviewQuerySchema
>;
export type AdminAnalyticsOverviewResponse = z.infer<
  typeof adminAnalyticsOverviewResponseSchema
>;
export type AdminAnalyticsEventCounts = z.infer<typeof eventCountsSchema>;
