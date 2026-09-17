import { z } from "zod";

const environmentSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().url(),
  SERVE_WEB: z.enum(["true", "false"]).default("false"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  ROUTING_BASE_URL: z
    .string()
    .url()
    .default("https://routing.openstreetmap.de"),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
});

export function readEnvironment(environment: NodeJS.ProcessEnv) {
  const value = environmentSchema.parse(environment);
  return {
    port: value.API_PORT,
    webOrigin: value.WEB_ORIGIN,
    databaseUrl: value.DATABASE_URL,
    serveWeb: value.SERVE_WEB === "true",
    nodeEnvironment: value.NODE_ENV,
    routingBaseUrl: value.ROUTING_BASE_URL,
    trustedProxyHops: value.TRUSTED_PROXY_HOPS,
  };
}
