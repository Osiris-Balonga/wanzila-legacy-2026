import { createApp } from "./app.js";
import { readEnvironment } from "./config/environment.js";
import path from "node:path";

async function bootstrap() {
  const environment = readEnvironment(process.env);
  const app = await createApp({
    webOrigin: environment.webOrigin,
    databaseUrl: environment.databaseUrl,
    logger: environment.nodeEnvironment !== "test",
    nodeEnvironment: environment.nodeEnvironment,
    routingBaseUrl: environment.routingBaseUrl,
    ...(environment.serveWeb
      ? { webRoot: path.resolve(process.cwd(), "apps/web/dist") }
      : {}),
  });

  const shutdown = async () => {
    await app.close();
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
