import { z } from "zod";
import { adminAnalyticsWindowSchema } from "./admin-analytics.js";

export const adminRouteOutcomesQuerySchema = z
  .object({ window: adminAnalyticsWindowSchema.default("7d") })
  .strict();

const countSchema = z.number().int().nonnegative();
export const adminRouteOutcomesResponseSchema = z
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
        counts: z
          .object({
            started: countSchema,
            gpsConfirmed: countSchema,
            userDeclared: countSchema,
            stopped: countSchema,
            alreadyNearby: countSchema,
            unknown: countSchema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type AdminRouteOutcomesResponse = z.infer<
  typeof adminRouteOutcomesResponseSchema
>;
