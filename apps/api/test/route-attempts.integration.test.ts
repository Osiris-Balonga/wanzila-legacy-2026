import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  type ApiPrismaClient,
} from "../src/infrastructure/prisma.js";
import { loadAdminRouteOutcomes } from "../src/modules/admin-analytics/route-outcomes.js";
import { cleanupExpiredAnalyticsEvents } from "../src/modules/analytics/retention.js";
import { registerRouteAttemptRoutes } from "../src/modules/route-attempts/routes.js";
import { getDisposableTestDatabaseUrl } from "./support/test-database.js";

const execFileAsync = promisify(execFile);
const testDatabaseUrl = getDisposableTestDatabaseUrl(process.env);
const disposableTestDatabaseUrl = testDatabaseUrl ?? "";
const pharmacyId = "00000000-0000-4000-8000-000000010001";
const sessionId = "00000000-0000-4000-8000-000000010002";
const attemptId = "00000000-0000-4000-8000-000000010003";
const now = new Date("2026-09-17T12:00:00.000Z");

describe.runIf(Boolean(testDatabaseUrl))("route outcomes (MariaDB)", () => {
  let prisma: ApiPrismaClient;
  const app = fastify();

  beforeAll(async () => {
    const command = "pnpm --filter @wanzila/api db:migrate";
    const shell =
      process.platform === "win32"
        ? { file: "cmd.exe", args: ["/d", "/s", "/c", command] }
        : { file: "sh", args: ["-c", command] };
    await execFileAsync(shell.file, shell.args, {
      cwd: resolve(import.meta.dirname, "../../.."),
      env: { ...process.env, DATABASE_URL: disposableTestDatabaseUrl },
    });
    prisma = createPrismaClient(disposableTestDatabaseUrl);
    await prisma.routeAttempt.deleteMany({ where: { pharmacyId } });
    await prisma.analyticsEvent.deleteMany({ where: { pharmacyId } });
    await prisma.pharmacy.deleteMany({ where: { id: pharmacyId } });
    await prisma.pharmacy.create({
      data: {
        id: pharmacyId,
        name: "Pharmacie test issue 100",
        address: "1 avenue",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2636000",
        longitude: "15.2429000",
        status: "PUBLISHED",
      },
    });
    registerRouteAttemptRoutes(app, { prisma, now: () => now });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    if (prisma) {
      await prisma.routeAttempt.deleteMany({ where: { pharmacyId } });
      await prisma.analyticsEvent.deleteMany({ where: { pharmacyId } });
      await prisma.pharmacy.deleteMany({ where: { id: pharmacyId } });
      await prisma.$disconnect();
    }
  });

  const start = (id: string, otherSession = sessionId) =>
    app.inject({
      method: "POST",
      url: "/route-attempts",
      payload: { attemptId: id, pharmacyId, sessionId: otherSession },
    });
  const finish = (id: string, outcome: string, otherSession = sessionId) =>
    app.inject({
      method: "PATCH",
      url: `/route-attempts/${id}/outcome`,
      payload: { sessionId: otherSession, outcome },
    });

  it("starts once, resolves once, and never doubles the legacy event counts", async () => {
    expect((await start(attemptId)).statusCode).toBe(201);
    expect((await start(attemptId)).statusCode).toBe(200);
    expect((await start(attemptId, crypto.randomUUID())).statusCode).toBe(409);
    expect((await finish(attemptId, "GPS_CONFIRMED")).statusCode).toBe(200);
    expect((await finish(attemptId, "GPS_CONFIRMED")).statusCode).toBe(200);
    expect((await finish(attemptId, "USER_DECLARED")).statusCode).toBe(409);
    expect(
      (await finish(attemptId, "STOPPED", crypto.randomUUID())).statusCode,
    ).toBe(404);
    const attempt = await prisma.routeAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    expect(attempt.outcome).toBe("GPS_CONFIRMED");
    expect(attempt.resolvedAt).toEqual(now);
    const events = await prisma.analyticsEvent.findMany({
      where: { pharmacyId },
      orderBy: { name: "asc" },
    });
    expect(events.map((event) => event.name)).toEqual([
      "arrival_confirmed",
      "route_started",
    ]);
    expect(JSON.stringify(events)).not.toMatch(
      /latitude|longitude|routePoints/,
    );
  });

  it("allows only one winner when incompatible outcomes race", async () => {
    const racingId = "00000000-0000-4000-8000-000000011010";
    expect((await start(racingId)).statusCode).toBe(201);
    const responses = await Promise.all([
      finish(racingId, "STOPPED"),
      finish(racingId, "USER_DECLARED"),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
    const stored = await prisma.routeAttempt.findUniqueOrThrow({
      where: { id: racingId },
    });
    expect(["STOPPED", "USER_DECLARED"]).toContain(stored.outcome);
    expect((await finish(racingId, stored.outcome)).statusCode).toBe(200);
    expect(
      (
        await finish(
          racingId,
          stored.outcome === "STOPPED" ? "USER_DECLARED" : "STOPPED",
        )
      ).statusCode,
    ).toBe(409);
  });

  it("counts each distinct outcome, including silence as unknown", async () => {
    for (const [suffix, outcome] of [
      ["1004", "USER_DECLARED"],
      ["1005", "STOPPED"],
      ["1006", "ALREADY_NEARBY"],
      ["1007", "UNKNOWN"],
    ] as const) {
      const id = `00000000-0000-4000-8000-00000001${suffix}`;
      expect((await start(id)).statusCode).toBe(201);
      if (outcome !== "UNKNOWN") {
        expect((await finish(id, outcome)).statusCode).toBe(200);
      }
    }
    const result = await loadAdminRouteOutcomes({
      prisma,
      asOf: new Date("2026-09-17T13:00:00.000Z"),
      window: "7d",
    });
    const racing = await prisma.routeAttempt.findUniqueOrThrow({
      where: { id: "00000000-0000-4000-8000-000000011010" },
    });
    expect(result.data.counts).toEqual({
      started: 6,
      gpsConfirmed: 1,
      userDeclared: racing.outcome === "USER_DECLARED" ? 2 : 1,
      stopped: racing.outcome === "STOPPED" ? 2 : 1,
      alreadyNearby: 1,
      unknown: 1,
    });
  });

  it("rejects unpublished pharmacies and removes expired anonymous attempts", async () => {
    const missing = await app.inject({
      method: "POST",
      url: "/route-attempts",
      payload: {
        attemptId: crypto.randomUUID(),
        pharmacyId: crypto.randomUUID(),
        sessionId,
      },
    });
    expect(missing.statusCode).toBe(404);
    await prisma.routeAttempt.update({
      where: { id: attemptId },
      data: { startedAt: new Date("2026-08-17T11:59:59.999Z") },
    });
    await cleanupExpiredAnalyticsEvents({ prisma, now: () => now });
    expect(
      await prisma.routeAttempt.findUnique({ where: { id: attemptId } }),
    ).toBeNull();
  });
});
