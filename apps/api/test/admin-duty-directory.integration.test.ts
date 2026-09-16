import { execFile } from "node:child_process";
import type { OutgoingHttpHeaders } from "node:http";
import { promisify } from "node:util";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  createPrismaClient,
  type ApiPrismaClient,
} from "../src/infrastructure/prisma.js";
import {
  ADMINISTRATOR,
  bootstrapAdministrator,
  clearAdministratorFixtures,
  WEB_ORIGIN,
  workspaceRoot,
} from "./support/admin-auth-fixtures.js";
import { getDisposableTestDatabaseUrl } from "./support/test-database.js";

const execFileAsync = promisify(execFile);
const databaseUrl = getDisposableTestDatabaseUrl(process.env) ?? "";
const NOW = new Date("2026-09-16T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const ids = {
  alpha: "00000000-0000-4000-8000-000000005601",
  beta: "00000000-0000-4000-8000-000000005602",
  gamma: "00000000-0000-4000-8000-000000005603",
  delta: "00000000-0000-4000-8000-000000005604",
  epsilon: "00000000-0000-4000-8000-000000005605",
  zeta: "00000000-0000-4000-8000-000000005606",
} as const;

function cookieFrom(headers: OutgoingHttpHeaders): string {
  const header = headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  const match =
    typeof value === "string"
      ? /^wanzila_admin_session=([^;]+)/.exec(value)
      : null;
  if (!match) throw new Error("Expected an administrator session cookie");
  return `wanzila_admin_session=${match[1]}`;
}

async function clearFixtures(prisma: ApiPrismaClient): Promise<void> {
  await prisma.dutyException.deleteMany();
  await prisma.dutyPeriod.deleteMany();
  await prisma.contribution.deleteMany();
  await prisma.report.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.emergencyContact.deleteMany();
  await prisma.scheduleSource.deleteMany();
  await prisma.pharmacy.deleteMany();
  await clearAdministratorFixtures(prisma);
}

async function pharmacy(
  prisma: ApiPrismaClient,
  id: string,
  name: string,
  district: string,
  arrondissement: string,
  status: "PUBLISHED" | "DRAFT" = "PUBLISHED",
): Promise<void> {
  await prisma.pharmacy.create({
    data: {
      id,
      name,
      address: "1 avenue du Test",
      district,
      arrondissement,
      latitude: "-4.2637080",
      longitude: "15.2428850",
      status,
    },
  });
}

async function duty(
  prisma: ApiPrismaClient,
  id: string,
  pharmacyId: string,
  status: "APPROVED" | "PENDING" | "REJECTED",
  startsAt: Date,
  endsAt: Date,
): Promise<void> {
  await prisma.dutyPeriod.create({
    data: { id, pharmacyId, status, startsAt, endsAt },
  });
}

function dutyId(suffix: number): string {
  return `00000000-0000-4000-8000-${String(5600 + suffix).padStart(12, "0")}`;
}

it("protects the new summary route before database access (RED #56)", async () => {
  const prisma = { $disconnect: async () => {} } as unknown as ApiPrismaClient;
  const app = await createApp({
    prisma,
    webOrigin: WEB_ORIGIN,
    now: () => NOW,
    nodeEnvironment: "test",
  });
  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/duties/summary",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  } finally {
    await app.close();
  }
});

describe.runIf(Boolean(databaseUrl))(
  "admin duty directory search and summary (MariaDB RED #56)",
  () => {
    let prisma: ApiPrismaClient;
    let app: Awaited<ReturnType<typeof createApp>>;
    let cookie: string;
    let currentTime: Date;

    beforeAll(async () => {
      const command = "pnpm --filter @wanzila/api db:migrate";
      const shell =
        process.platform === "win32"
          ? { file: "cmd.exe", args: ["/d", "/s", "/c", command] }
          : { file: "sh", args: ["-c", command] };
      await execFileAsync(shell.file, shell.args, {
        cwd: workspaceRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
    }, 60_000);

    beforeEach(async () => {
      currentTime = NOW;
      prisma = createPrismaClient(databaseUrl);
      await clearFixtures(prisma);
      const bootstrap = await bootstrapAdministrator({
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        WZ_ADMIN_BOOTSTRAP_EMAIL: ADMINISTRATOR.email,
        WZ_ADMIN_BOOTSTRAP_PASSWORD: ADMINISTRATOR.password,
        WZ_ADMIN_BOOTSTRAP_DISPLAY_NAME: ADMINISTRATOR.displayName,
      });
      if (bootstrap.exitCode !== 0)
        throw new Error(`Administrator bootstrap failed: ${bootstrap.output}`);
      app = await createApp({
        prisma,
        webOrigin: WEB_ORIGIN,
        now: () => currentTime,
        nodeEnvironment: "test",
      });
      const signedIn = await app.inject({
        method: "POST",
        url: "/api/v1/admin/auth/sign-in",
        headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
        payload: {
          email: ADMINISTRATOR.email,
          password: ADMINISTRATOR.password,
        },
      });
      expect(signedIn.statusCode).toBe(200);
      cookie = cookieFrom(signedIn.headers);
    });

    afterEach(async () => {
      await app.close();
    });

    const summary = async (
      app: Awaited<ReturnType<typeof createApp>>,
      cookie: string,
    ) =>
      app.inject({
        method: "GET",
        url: "/api/v1/admin/duties/summary",
        headers: { cookie },
      });

    it("requires auth, rejects summary query parameters and returns exact zeros for an empty DB", async () => {
      const unauthenticated = await app.inject({
        method: "GET",
        url: "/api/v1/admin/duties/summary",
      });
      expect(unauthenticated.statusCode).toBe(401);
      expect(unauthenticated.json()).toMatchObject({
        error: { code: "AUTHENTICATION_REQUIRED" },
      });
      const invalid = await app.inject({
        method: "GET",
        url: "/api/v1/admin/duties/summary?page=1",
        headers: { cookie },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
      const response = await summary(app, cookie);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          asOf: NOW.toISOString(),
          active: 0,
          upcoming: 0,
          expired: 0,
          withoutRecentDuty: 0,
        },
      });
    });

    it("searches related pharmacy fields before stable pagination and count", async () => {
      await pharmacy(
        prisma,
        ids.alpha,
        "Pharmacie C++",
        "Plateau",
        "Poto-Poto",
      );
      await pharmacy(prisma, ids.beta, "Pharmacie Beta", "Plateau", "Moungali");
      await pharmacy(
        prisma,
        ids.gamma,
        "Pharmacie Gamma",
        "Plateau",
        "Poto-Poto",
      );
      await pharmacy(
        prisma,
        ids.delta,
        "Pharmacie Delta",
        "Bacongo",
        "Talangaï",
      );
      await pharmacy(
        prisma,
        ids.epsilon,
        "Pharmacie No. 1",
        "Plateau",
        "Moungali",
      );
      const start = new Date("2026-09-17T08:00:00.000Z");
      const end = new Date("2026-09-17T20:00:00.000Z");
      await duty(prisma, dutyId(1), ids.alpha, "APPROVED", start, end);
      await duty(prisma, dutyId(2), ids.beta, "PENDING", start, end);
      await duty(prisma, dutyId(3), ids.gamma, "REJECTED", start, end);
      await duty(
        prisma,
        dutyId(4),
        ids.delta,
        "APPROVED",
        new Date("2026-09-16T08:00:00.000Z"),
        end,
      );
      await duty(prisma, dutyId(5), ids.epsilon, "APPROVED", start, end);

      const first = await app.inject({
        method: "GET",
        url: "/api/v1/admin/duties?q=Plateau&page=1&pageSize=2",
        headers: { cookie },
      });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({
        data: [{ id: dutyId(1) }, { id: dutyId(2), status: "PENDING" }],
        pagination: { page: 1, pageSize: 2, total: 4, totalPages: 2 },
      });
      const second = await app.inject({
        method: "GET",
        url: "/api/v1/admin/duties?q=Plateau&page=2&pageSize=2",
        headers: { cookie },
      });
      expect(second.json()).toMatchObject({
        data: [{ id: dutyId(3), status: "REJECTED" }, { id: dutyId(5) }],
        pagination: { page: 2, pageSize: 2, total: 4, totalPages: 2 },
      });
      const punctuation = await app.inject({
        method: "GET",
        url: `/api/v1/admin/duties?q=${encodeURIComponent("  Pharmacie   C++  ")}`,
        headers: { cookie },
      });
      expect(punctuation.json()).toMatchObject({
        data: [{ id: dutyId(1) }],
        pagination: { total: 1 },
      });
      const arrondissement = await app.inject({
        method: "GET",
        url: `/api/v1/admin/duties?q=${encodeURIComponent("  pOtO-pOtO  ")}`,
        headers: { cookie },
      });
      expect(arrondissement.json()).toMatchObject({
        data: [{ id: dutyId(1) }, { id: dutyId(3) }],
        pagination: { total: 2 },
      });
      const combined = await app.inject({
        method: "GET",
        url: "/api/v1/admin/duties?q=Plateau&status=PENDING&page=1&pageSize=1",
        headers: { cookie },
      });
      expect(combined.json()).toMatchObject({
        data: [{ id: dutyId(2) }],
        pagination: { total: 1 },
      });
    });

    it("returns BAD_REQUEST for blank, overlong, repeated or unknown q inputs", async () => {
      for (const query of [
        "q=%20%20%20",
        `q=${"x".repeat(181)}`,
        "q=alpha&q=beta",
        "q=alpha&unexpected=1",
        "q=alpha&page=0",
      ]) {
        const response = await app.inject({
          method: "GET",
          url: `/api/v1/admin/duties?${query}`,
          headers: { cookie },
        });
        expect(response.statusCode, query).toBe(400);
        expect(response.json()).toMatchObject({
          error: { code: "BAD_REQUEST" },
        });
      }
    });

    it("counts approved active, upcoming and expired periods while covering exceptions suppress active only", async () => {
      for (const [id, name] of Object.entries(ids))
        await pharmacy(prisma, name, `Pharmacie ${id}`, "Plateau", "Poto-Poto");
      const activeStart = new Date("2026-09-16T08:00:00.000Z");
      const activeEnd = new Date("2026-09-16T20:00:00.000Z");
      await duty(
        prisma,
        dutyId(1),
        ids.alpha,
        "APPROVED",
        activeStart,
        activeEnd,
      );
      await duty(
        prisma,
        dutyId(2),
        ids.beta,
        "APPROVED",
        activeStart,
        activeEnd,
      );
      await duty(
        prisma,
        dutyId(3),
        ids.gamma,
        "APPROVED",
        new Date("2026-09-16T12:00:00.001Z"),
        activeEnd,
      );
      await duty(prisma, dutyId(4), ids.delta, "APPROVED", activeStart, NOW);
      await duty(
        prisma,
        dutyId(5),
        ids.epsilon,
        "PENDING",
        activeStart,
        activeEnd,
      );
      await duty(
        prisma,
        dutyId(6),
        ids.epsilon,
        "REJECTED",
        activeStart,
        activeEnd,
      );
      await duty(
        prisma,
        dutyId(7),
        ids.zeta,
        "APPROVED",
        activeStart,
        activeEnd,
      );
      await prisma.dutyException.createMany({
        data: [
          {
            dutyPeriodId: dutyId(2),
            kind: "CANCELLED",
            startsAt: NOW,
            endsAt: new Date("2026-09-16T14:00:00.000Z"),
          },
          {
            dutyPeriodId: dutyId(7),
            kind: "UNAVAILABLE",
            startsAt: NOW,
            endsAt: new Date("2026-09-16T14:00:00.000Z"),
          },
        ],
      });
      const response = await summary(app, cookie);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          asOf: NOW.toISOString(),
          active: 1,
          upcoming: 1,
          expired: 1,
          withoutRecentDuty: 2,
        },
      });
    });

    it("uses [start,end) and the prior [now−30d,now) window for published pharmacies", async () => {
      await pharmacy(
        prisma,
        ids.alpha,
        "Pharmacie Alpha",
        "Plateau",
        "Poto-Poto",
      );
      await pharmacy(
        prisma,
        ids.beta,
        "Pharmacie Beta",
        "Plateau",
        "Poto-Poto",
      );
      await pharmacy(
        prisma,
        ids.gamma,
        "Pharmacie Gamma",
        "Plateau",
        "Poto-Poto",
      );
      await pharmacy(
        prisma,
        ids.delta,
        "Pharmacie Draft",
        "Plateau",
        "Poto-Poto",
        "DRAFT",
      );
      await pharmacy(
        prisma,
        ids.epsilon,
        "Pharmacie Sans garde",
        "Plateau",
        "Poto-Poto",
      );
      const windowStart = new Date(NOW.getTime() - 30 * DAY_MS);
      await duty(
        prisma,
        dutyId(1),
        ids.alpha,
        "APPROVED",
        NOW,
        new Date(NOW.getTime() + 60 * 60 * 1000),
      );
      await duty(
        prisma,
        dutyId(2),
        ids.beta,
        "APPROVED",
        new Date(windowStart.getTime() - DAY_MS),
        windowStart,
      );
      await duty(
        prisma,
        dutyId(3),
        ids.gamma,
        "APPROVED",
        windowStart,
        new Date(windowStart.getTime() + DAY_MS),
      );
      await duty(
        prisma,
        dutyId(4),
        ids.epsilon,
        "PENDING",
        new Date(NOW.getTime() - DAY_MS),
        NOW,
      );
      const atStart = await summary(app, cookie);
      expect(atStart.json()).toEqual({
        data: {
          asOf: NOW.toISOString(),
          active: 1,
          upcoming: 0,
          expired: 2,
          withoutRecentDuty: 3,
        },
      });
      currentTime = new Date(NOW.getTime() + 1);
      const afterStart = await summary(app, cookie);
      expect(afterStart.json()).toEqual({
        data: {
          asOf: currentTime.toISOString(),
          active: 1,
          upcoming: 0,
          expired: 2,
          withoutRecentDuty: 2,
        },
      });
      currentTime = new Date(NOW.getTime() + 60 * 60 * 1000);
      const atEnd = await summary(app, cookie);
      expect(atEnd.json()).toEqual({
        data: {
          asOf: currentTime.toISOString(),
          active: 0,
          upcoming: 0,
          expired: 3,
          withoutRecentDuty: 2,
        },
      });
    });
  },
);
