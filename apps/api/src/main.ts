import { createApp } from "./app.js";
import { readEnvironment } from "./config/environment.js";
import path from "node:path";
import { createPrismaClient } from "./infrastructure/prisma.js";
import { runContributionRetention } from "./modules/contributions/retention.js";

async function bootstrap() {
  const environment = readEnvironment(process.env);
  const retentionPrisma = createPrismaClient(environment.databaseUrl);
  const runRetention = () =>
    runContributionRetention(retentionPrisma, new Date()).catch(console.error);
  const retentionTimer = setInterval(
    () => void runRetention(),
    24 * 60 * 60 * 1000,
  );
  retentionTimer.unref();
  void runRetention();
  const app = await createApp({
    webOrigin: environment.webOrigin,
    databaseUrl: environment.databaseUrl,
    logger: environment.nodeEnvironment !== "test",
    nodeEnvironment: environment.nodeEnvironment,
    routingBaseUrl: environment.routingBaseUrl,
    trustedProxyHops: environment.trustedProxyHops,
    ...(environment.serveWeb
      ? { webRoot: path.resolve(process.cwd(), "apps/web/dist") }
      : {}),
  });

  const shutdown = async () => {
    clearInterval(retentionTimer);
    await app.close();
    await retentionPrisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await app.listen({ port: environment.port, host: "0.0.0.0" });
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
