import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("wanzila-api"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./public-api.js";
export * from "./analytics.js";
export * from "./admin-auth.js";
export * from "./admin-pharmacy.js";
