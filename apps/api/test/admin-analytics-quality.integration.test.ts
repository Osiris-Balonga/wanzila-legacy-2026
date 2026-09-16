import { execFile } from "node:child_process";
import type { OutgoingHttpHeaders } from "node:http";
import { promisify } from "node:util";
import { adminAnalyticsOverviewResponseSchema } from "@wanzila/contracts";
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
const ids = {
  alpha: "00000000-0000-4000-8000-000000006111",
  beta: "00000000-0000-4000-8000-000000006112",
  charlie: "00000000-0000-4000-8000-000000006113",
  delta: "00000000-0000-4000-8000-000000006114",
  draft: "00000000-0000-4000-8000-000000006115",
  fresh: "00000000-0000-4000-8000-000000006121",
  stale: "00000000-0000-4000-8000-000000006122",
  idle: "00000000-0000-4000-8000-000000006123",
  excepted: "00000000-0000-4000-8000-000000006131",
  boundary: "00000000-0000-4000-8000-000000006132",
} as const;

interface QualityData {
  version: number;
  asOf: string;
  timeZone: string;
  sources: {
    data: Array<{
      id: string;
      name: string;
      description: string | null;
      observedAt: string;
      reliability: number;
      freshness: string;
      currentApprovedDutyPeriods: number;
    }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    totals: {
      registered: number;
      fresh: number;
      stale: number;
      withSourceCurrentDutyPeriods: number;
      withoutSourceCurrentDutyPeriods: number;
      currentDutyPeriodsAfterExceptions: number;
    };
  };
  coverage: {
    data: Array<{
      arrondissement: string;
      publishedPharmacies: number;
      withCurrentApprovedDuty: number;
      ratio: number | null;
    }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    totals: {
      publishedPharmacies: number;
      withCurrentApprovedDuty: number;
      ratio: number | null;
    };
  };
}

function dataFrom(response: { json(): unknown }): QualityData {
  const body = response.json();
  if (!body || typeof body !== "object" || !("data" in body))
    throw new Error("Expected a data envelope");
  return body.data as QualityData;
}

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

async function seed(prisma: ApiPrismaClient): Promise<void> {
  const pharmacy = (
    id: string,
    name: string,
    arrondissement: string,
    status: "PUBLISHED" | "DRAFT" = "PUBLISHED",
  ) => ({
    id,
    name,
    address: "1 avenue",
    district: "Plateau",
    arrondissement,
    latitude: "-4.2637080",
    longitude: "15.2428850",
    status,
  });
  await prisma.pharmacy.createMany({
    data: [
      pharmacy(ids.alpha, "Alpha", "Poto-Poto"),
      pharmacy(ids.beta, "Beta", "Poto-Poto"),
      pharmacy(ids.charlie, "Charlie", "Moungali"),
      pharmacy(ids.delta, "Delta", "Moungali"),
      pharmacy(ids.draft, "Brouillon", "Bacongo", "DRAFT"),
    ],
  });
  await prisma.scheduleSource.createMany({
    data: [
      {
        id: ids.fresh,
        name: "A Source fraîche",
        description: null,
        reliability: 90,
        observedAt: new Date("2026-09-16T06:00:00.000Z"),
      },
      {
        id: ids.stale,
        name: "B Source périmée",
        description: "Bulletin",
        reliability: 40,
        observedAt: new Date("2026-09-16T05:59:59.999Z"),
      },
      {
        id: ids.idle,
        name: "C Source inutilisée",
        reliability: 50,
        observedAt: new Date("2026-09-16T11:00:00.000Z"),
      },
    ],
  });
  const start = new Date("2026-09-16T08:00:00.000Z");
  const end = new Date("2026-09-16T20:00:00.000Z");
  await prisma.dutyPeriod.createMany({
    data: [
      {
        pharmacyId: ids.alpha,
        sourceId: ids.fresh,
        startsAt: NOW,
        endsAt: end,
        status: "APPROVED",
      },
      {
        pharmacyId: ids.alpha,
        sourceId: ids.stale,
        startsAt: start,
        endsAt: end,
        status: "APPROVED",
      },
      {
        pharmacyId: ids.beta,
        sourceId: ids.fresh,
        startsAt: start,
        endsAt: NOW,
        status: "APPROVED",
      },
      {
        pharmacyId: ids.beta,
        startsAt: start,
        endsAt: end,
        status: "APPROVED",
      },
      {
        id: ids.excepted,
        pharmacyId: ids.charlie,
        sourceId: ids.stale,
        startsAt: start,
        endsAt: end,
        status: "APPROVED",
      },
      {
        id: ids.boundary,
        pharmacyId: ids.charlie,
        sourceId: ids.fresh,
        startsAt: start,
        endsAt: end,
        status: "APPROVED",
      },
      {
        pharmacyId: ids.draft,
        sourceId: ids.fresh,
        startsAt: start,
        endsAt: end,
        status: "APPROVED",
      },
      {
        pharmacyId: ids.delta,
        sourceId: ids.fresh,
        startsAt: start,
        endsAt: end,
        status: "PENDING",
      },
    ],
  });
  await prisma.dutyException.createMany({
    data: [
      {
        dutyPeriodId: ids.excepted,
        kind: "CANCELLED",
        startsAt: start,
        endsAt: end,
      },
      {
        dutyPeriodId: ids.excepted,
        kind: "UNAVAILABLE",
        startsAt: start,
        endsAt: end,
      },
      {
        dutyPeriodId: ids.boundary,
        kind: "CANCELLED",
        startsAt: start,
        endsAt: NOW,
      },
    ],
  });
}

it("protects the quality route before querying MariaDB (RED #61)", async () => {
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
      url: "/api/v1/admin/analytics/quality",
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
  "admin analytics quality HTTP contract (MariaDB RED #61)",
  () => {
    let prisma: ApiPrismaClient;
    let app: Awaited<ReturnType<typeof createApp>>;
    let cookie: string;

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
        now: () => NOW,
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

    it("keeps empty totals truthful and hides all data without a valid administrator session", async () => {
      const denied = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality",
      });
      expect(denied.statusCode).toBe(401);
      expect(JSON.stringify(denied.json())).not.toMatch(
        /sources|coverage|arrondissement/,
      );
      const invalidSession = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality",
        headers: { cookie: "wanzila_admin_session=invalid" },
      });
      expect(invalidSession.statusCode).toBe(401);
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(dataFrom(response)).toMatchObject({
        version: 1,
        asOf: NOW.toISOString(),
        timeZone: "Africa/Brazzaville",
        sources: {
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          totals: {
            registered: 0,
            fresh: 0,
            stale: 0,
            withSourceCurrentDutyPeriods: 0,
            withoutSourceCurrentDutyPeriods: 0,
            currentDutyPeriodsAfterExceptions: 0,
          },
        },
        coverage: {
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          totals: {
            publishedPharmacies: 0,
            withCurrentApprovedDuty: 0,
            ratio: null,
          },
        },
      });
    });

    it("counts boundary duties, overlapping exceptions, distinct pharmacies and freshness threshold", async () => {
      await seed(prisma);
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const quality = dataFrom(response);
      expect(quality.sources.data).toEqual([
        {
          id: ids.fresh,
          name: "A Source fraîche",
          description: null,
          observedAt: "2026-09-16T06:00:00.000Z",
          reliability: 90,
          freshness: "FRESH",
          currentApprovedDutyPeriods: 2,
        },
        {
          id: ids.stale,
          name: "B Source périmée",
          description: "Bulletin",
          observedAt: "2026-09-16T05:59:59.999Z",
          reliability: 40,
          freshness: "STALE",
          currentApprovedDutyPeriods: 1,
        },
        {
          id: ids.idle,
          name: "C Source inutilisée",
          description: null,
          observedAt: "2026-09-16T11:00:00.000Z",
          reliability: 50,
          freshness: "FRESH",
          currentApprovedDutyPeriods: 0,
        },
      ]);
      expect(quality.sources.totals).toEqual({
        registered: 3,
        fresh: 2,
        stale: 1,
        withSourceCurrentDutyPeriods: 3,
        withoutSourceCurrentDutyPeriods: 1,
        currentDutyPeriodsAfterExceptions: 4,
      });
      expect(quality.coverage.data).toEqual([
        {
          arrondissement: "Moungali",
          publishedPharmacies: 2,
          withCurrentApprovedDuty: 1,
          ratio: 0.5,
        },
        {
          arrondissement: "Poto-Poto",
          publishedPharmacies: 2,
          withCurrentApprovedDuty: 2,
          ratio: 1,
        },
      ]);
      expect(quality.coverage.totals).toEqual({
        publishedPharmacies: 4,
        withCurrentApprovedDuty: 3,
        ratio: 0.75,
      });
      const overview = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie },
      });
      expect(overview.statusCode).toBe(200);
      const overviewData = adminAnalyticsOverviewResponseSchema.parse(
        overview.json(),
      ).data;
      expect(quality.asOf).toBe(overviewData.period.asOf);
      expect({
        fresh: quality.sources.totals.fresh,
        stale: quality.sources.totals.stale,
      }).toEqual(overviewData.quality.registeredSources);
      expect(quality.sources.totals.currentDutyPeriodsAfterExceptions).toBe(
        overviewData.quality.currentDutyPeriodsAfterExceptions,
      );
      expect(quality.coverage.totals.publishedPharmacies).toBe(
        overviewData.quality.publishedPharmacies,
      );
      expect(JSON.stringify(quality)).not.toMatch(
        /sessionId|overallQuality|frequency|anomalies/,
      );
    });

    it("paginates sources and coverage independently with stable order and global totals", async () => {
      await seed(prisma);
      const first = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality?sourcePageSize=1&coveragePageSize=1",
        headers: { cookie },
      });
      expect(first.statusCode).toBe(200);
      expect(dataFrom(first)).toMatchObject({
        sources: {
          data: [{ id: ids.fresh }],
          pagination: { page: 1, pageSize: 1, total: 3, totalPages: 3 },
          totals: { currentDutyPeriodsAfterExceptions: 4 },
        },
        coverage: {
          data: [{ arrondissement: "Moungali" }],
          pagination: { page: 1, pageSize: 1, total: 2, totalPages: 2 },
          totals: { publishedPharmacies: 4 },
        },
      });
      const later = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality?sourcePage=2&sourcePageSize=1&coveragePage=2&coveragePageSize=1",
        headers: { cookie },
      });
      expect(later.statusCode).toBe(200);
      expect(dataFrom(later)).toMatchObject({
        sources: { data: [{ id: ids.stale }], pagination: { page: 2 } },
        coverage: {
          data: [{ arrondissement: "Poto-Poto" }],
          pagination: { page: 2 },
        },
      });
      const beyond = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality?sourcePage=10&coveragePage=10",
        headers: { cookie },
      });
      expect(beyond.statusCode).toBe(200);
      expect(dataFrom(beyond)).toMatchObject({
        sources: { data: [], pagination: { total: 3 } },
        coverage: { data: [], pagination: { total: 2 } },
      });
      for (const query of [
        "sourcePage=0",
        "sourcePageSize=51",
        "coveragePageSize=0",
        "coveragePage=1.5",
        "unknown=x",
      ]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/api/v1/admin/analytics/quality?${query}`,
          headers: { cookie },
        });
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json()).toMatchObject({
          error: { code: "BAD_REQUEST" },
        });
      }
    });
  },
);
