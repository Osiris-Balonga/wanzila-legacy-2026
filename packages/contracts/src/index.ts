import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("wanzila-api"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./public-api.js";
export * from "./analytics.js";
export * from "./admin-auth.js";
export * from "./routing.js";
export * from "./route-attempt.js";
export * from "./admin-pharmacy.js";
export * from "./admin-duty.js";
export * from "./admin-duty-revision.js";
export * from "./admin-analytics.js";
export * from "./admin-route-outcomes.js";
export * from "./admin-analytics-quality.js";
export * from "./admin-analytics-activity.js";
export * from "./contributions.js";
