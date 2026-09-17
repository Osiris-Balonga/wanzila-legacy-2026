import { z } from "zod";
import { adminAnalyticsWindowSchema } from "./admin-analytics.js";

const countSchema = z.number().int().nonnegative();
const metricSchema = z
  .object({
    current: countSchema,
    previous: countSchema,
    deltaPercent: z.number().finite().nullable(),
  })
  .strict()
  .superRefine((metric, context) => {
    if ((metric.previous === 0) !== (metric.deltaPercent === null)) {
      context.addIssue({
        code: "custom",
        message: "deltaPercent is null exactly when previous is zero",
        path: ["deltaPercent"],
      });
    }
  });

export const adminAnalyticsActivityMetricNames = [
  "discovery_viewed",
  "search_submitted",
  "pharmacy_detail_viewed",
  "pharmacy_call_started",
  "route_started",
  "arrival_confirmed",
] as const;

const paginationSchema = z
  .object({
    page: z.number().int().min(1).max(10_000),
    pageSize: z.number().int().min(1).max(100),
    total: countSchema,
    totalPages: countSchema,
  })
  .strict();

export const adminAnalyticsActivityQuerySchema = z
  .object({
    window: adminAnalyticsWindowSchema.default("7d"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();

export const adminAnalyticsActivityResponseSchema = z
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
            previousFrom: z.iso.datetime(),
            previousTo: z.iso.datetime(),
          })
          .strict(),
        comparisons: z
          .object(
            Object.fromEntries(
              adminAnalyticsActivityMetricNames.map((name) => [
                name,
                metricSchema,
              ]),
            ) as Record<
              (typeof adminAnalyticsActivityMetricNames)[number],
              typeof metricSchema
            >,
          )
          .strict(),
        pharmacyActivity: z
          .object({
            data: z
              .array(
                z
                  .object({
                    pharmacyId: z.uuid(),
                    name: z.string().min(1),
                    coordinates: z
                      .object({
                        latitude: z.number().finite().min(-90).max(90),
                        longitude: z.number().finite().min(-180).max(180),
                      })
                      .strict(),
                    detailViews: countSchema.positive(),
                  })
                  .strict(),
              )
              .max(100),
            pagination: paginationSchema,
            mappedDetailViews: countSchema,
            unmappedDetailViews: countSchema,
            totalDetailViews: countSchema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((response, context) => {
    const { period, comparisons, pharmacyActivity } = response.data;
    const currentDuration = Date.parse(period.to) - Date.parse(period.from);
    const previousDuration =
      Date.parse(period.previousTo) - Date.parse(period.previousFrom);
    if (
      period.to !== period.asOf ||
      period.previousTo !== period.from ||
      currentDuration <= 0 ||
      currentDuration !== previousDuration
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Comparison windows must be adjacent and equal in elapsed time",
        path: ["data", "period"],
      });
    }
    if (
      pharmacyActivity.mappedDetailViews +
        pharmacyActivity.unmappedDetailViews !==
        pharmacyActivity.totalDetailViews ||
      pharmacyActivity.totalDetailViews !==
        comparisons.pharmacy_detail_viewed.current
    ) {
      context.addIssue({
        code: "custom",
        message: "Pharmacy activity totals must reconcile",
        path: ["data", "pharmacyActivity"],
      });
    }
  });

export type AdminAnalyticsActivityQuery = z.infer<
  typeof adminAnalyticsActivityQuerySchema
>;
export type AdminAnalyticsActivityResponse = z.infer<
  typeof adminAnalyticsActivityResponseSchema
>;
export type AdminAnalyticsActivityMetricName =
  (typeof adminAnalyticsActivityMetricNames)[number];
