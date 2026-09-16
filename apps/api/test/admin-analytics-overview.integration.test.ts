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
  alpha: "00000000-0000-4000-8000-000000005401",
  bravo: "00000000-0000-4000-8000-000000005402",
  draft: "00000000-0000-4000-8000-000000005403",
  fresh: "00000000-0000-4000-8000-000000005411",
  stale: "00000000-0000-4000-8000-000000005412",
  freshDuty: "00000000-0000-4000-8000-000000005421",
  staleDuty: "00000000-0000-4000-8000-000000005422",
  unsourcedDuty: "00000000-0000-4000-8000-000000005423",
  exceptedDuty: "00000000-0000-4000-8000-000000005424",
};

function overviewData(response: { json(): unknown }) {
  return adminAnalyticsOverviewResponseSchema.parse(response.json()).data;
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

async function seedPharmacies(prisma: ApiPrismaClient): Promise<void> {
  await prisma.pharmacy.createMany({
    data: [
      {
        id: ids.alpha,
        name: "Pharmacie Alpha",
        address: "1 avenue",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2637080",
        longitude: "15.2428850",
        status: "PUBLISHED",
      },
      {
        id: ids.bravo,
        name: "Pharmacie Bravo",
        address: "2 avenue",
        district: "Plateau",
        arrondissement: "Moungali",
        latitude: "-4.2637000",
        longitude: "15.2428000",
        status: "PUBLISHED",
      },
      {
        id: ids.draft,
        name: "Pharmacie Brouillon",
        address: "3 avenue",
        district: "Plateau",
        arrondissement: "Moungali",
        latitude: "-4.2637000",
        longitude: "15.2428000",
        status: "DRAFT",
      },
    ],
  });
}

it("protects the overview route before querying MariaDB (RED #54)", async () => {
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
      url: "/api/v1/admin/analytics/overview?window=7d",
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
  "administrator analytics overview HTTP contract (MariaDB RED #54)",
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

    it("returns truthful zeroes, all seven calendar dates, and validates query/auth without Origin on GET", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const data = overviewData(response);
      expect(data).toMatchObject({
        version: 1,
        window: "7d",
        period: {
          timeZone: "Africa/Brazzaville",
          from: "2026-09-09T23:00:00.000Z",
          to: NOW.toISOString(),
          asOf: NOW.toISOString(),
        },
        topPharmacies: [],
        filterUsage: { districts: [], arrondissements: [] },
        quality: {
          publishedPharmacies: 0,
          pendingContributions: 0,
          unresolvedReports: 0,
          currentApprovedDutyPeriods: 0,
          currentDutyPeriodsExcludedByExceptions: 0,
          currentDutyPeriodsAfterExceptions: 0,
          currentDutySourceFreshness: { fresh: 0, stale: 0, unknown: 0 },
          registeredSources: { fresh: 0, stale: 0 },
        },
      });
      expect(data.events.daily).toHaveLength(7);
      expect(data.events.daily[0]?.date).toBe("2026-09-10");
      expect(data.events.daily.at(-1)?.date).toBe("2026-09-16");
      expect(Object.values(data.events.totals)).toEqual(Array(7).fill(0));
      for (const query of [
        "window=1d",
        "window=365d",
        "window=7d&unexpected=true",
      ]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/api/v1/admin/analytics/overview?${query}`,
          headers: { cookie },
        });
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json()).toMatchObject({
          error: { code: "BAD_REQUEST" },
        });
      }
      const expired = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie: "wanzila_admin_session=invalid" },
      });
      expect(expired.statusCode).toBe(401);
    });

    it("counts event occurrences within half-open local bounds, zero-fills series and labels filters honestly", async () => {
      await seedPharmacies(prisma);
      await prisma.analyticsEvent.createMany({
        data: [
          {
            name: "discovery_viewed",
            sessionId: ids.alpha,
            occurredAt: new Date("2026-09-09T22:59:59.999Z"),
          },
          {
            name: "discovery_viewed",
            sessionId: ids.alpha,
            occurredAt: new Date("2026-09-09T23:00:00.000Z"),
          },
          {
            name: "search_submitted",
            sessionId: ids.alpha,
            properties: { queryLength: 4 },
            occurredAt: new Date("2026-09-15T23:00:00.000Z"),
          },
          {
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.alpha,
            sessionId: ids.alpha,
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          {
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.alpha,
            sessionId: ids.alpha,
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          {
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.bravo,
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          {
            name: "pharmacy_call_started",
            pharmacyId: ids.alpha,
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          {
            name: "route_started",
            pharmacyId: ids.alpha,
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          {
            name: "arrival_confirmed",
            pharmacyId: ids.alpha,
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          {
            name: "empty_results_shown",
            properties: { queryLength: 4, resultCount: 0 },
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          {
            name: "filters_applied",
            properties: { district: "Plateau", arrondissement: "Poto-Poto" },
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          {
            name: "filters_applied",
            properties: { district: "Plateau" },
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          {
            name: "discovery_failed",
            properties: { code: "NETWORK" },
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          { name: "discovery_viewed", occurredAt: NOW },
        ],
      });
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview?window=7d",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const data = overviewData(response);
      expect(data.events.totals).toEqual({
        discovery_viewed: 1,
        search_submitted: 1,
        pharmacy_detail_viewed: 3,
        pharmacy_call_started: 1,
        route_started: 1,
        arrival_confirmed: 1,
        empty_results_shown: 1,
      });
      expect(data.events.daily[0]).toMatchObject({
        date: "2026-09-10",
        counts: { discovery_viewed: 1 },
      });
      expect(data.events.daily[5]).toMatchObject({
        date: "2026-09-15",
        counts: { search_submitted: 0 },
      });
      expect(data.events.daily[6]).toMatchObject({
        date: "2026-09-16",
        counts: { search_submitted: 1, pharmacy_detail_viewed: 3 },
      });
      expect(data.topPharmacies).toEqual([
        {
          pharmacyId: ids.alpha,
          name: "Pharmacie Alpha",
          coordinates: { latitude: -4.263708, longitude: 15.242885 },
          detailViews: 2,
        },
        {
          pharmacyId: ids.bravo,
          name: "Pharmacie Bravo",
          coordinates: { latitude: -4.2637, longitude: 15.2428 },
          detailViews: 1,
        },
      ]);
      expect(data.filterUsage).toEqual({
        districts: [{ value: "Plateau", applications: 2 }],
        arrondissements: [{ value: "Poto-Poto", applications: 1 }],
      });
      expect(JSON.stringify(data)).not.toMatch(
        /queryLength|sessionId|NETWORK|resultCount/,
      );
      const thirty = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview?window=30d",
        headers: { cookie },
      });
      expect(thirty.statusCode).toBe(200);
      expect(overviewData(thirty).events.daily).toHaveLength(30);
      expect(overviewData(thirty).period.from).toBe("2026-08-17T23:00:00.000Z");
    });

    it("limits top lists and retains historical pharmacy IDs without inventing a name", async () => {
      await seedPharmacies(prisma);
      const historicalIds = Array.from(
        { length: 6 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(5501 + index).padStart(12, "0")}`,
      );
      await prisma.analyticsEvent.createMany({
        data: [
          {
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.alpha,
            occurredAt: new Date("2026-09-16T11:00:00.000Z"),
          },
          {
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.alpha,
            occurredAt: new Date("2026-09-16T11:01:00.000Z"),
          },
          ...historicalIds.map((pharmacyId) => ({
            name: "pharmacy_detail_viewed",
            pharmacyId,
            occurredAt: new Date("2026-09-16T11:02:00.000Z"),
          })),
          ...["Zulu", "Alpha", "Echo", "Bravo", "Delta", "Charlie"].map(
            (district) => ({
              name: "filters_applied",
              properties: { district },
              occurredAt: new Date("2026-09-16T11:03:00.000Z"),
            }),
          ),
        ],
      });
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const data = overviewData(response);
      expect(data.events.totals.pharmacy_detail_viewed).toBe(8);
      expect(data.topPharmacies).toHaveLength(5);
      expect(data.topPharmacies[0]).toEqual({
        pharmacyId: ids.alpha,
        name: "Pharmacie Alpha",
        coordinates: { latitude: -4.263708, longitude: 15.242885 },
        detailViews: 2,
      });
      expect(data.topPharmacies.slice(1)).toEqual(
        historicalIds.slice(0, 4).map((pharmacyId) => ({
          pharmacyId,
          name: null,
          coordinates: null,
          detailViews: 1,
        })),
      );
      expect(data.filterUsage.districts).toEqual(
        ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((value) => ({
          value,
          applications: 1,
        })),
      );
    });

    it("derives source freshness, current duty exceptions, publication and review quality from persisted rows", async () => {
      await seedPharmacies(prisma);
      await prisma.scheduleSource.createMany({
        data: [
          {
            id: ids.fresh,
            name: "Frais",
            observedAt: new Date("2026-09-16T11:00:00.000Z"),
          },
          {
            id: ids.stale,
            name: "Ancien",
            observedAt: new Date("2026-09-15T11:00:00.000Z"),
          },
        ],
      });
      const start = new Date("2026-09-16T08:00:00.000Z");
      const end = new Date("2026-09-16T20:00:00.000Z");
      await prisma.dutyPeriod.createMany({
        data: [
          {
            id: ids.freshDuty,
            pharmacyId: ids.alpha,
            sourceId: ids.fresh,
            startsAt: start,
            endsAt: end,
            status: "APPROVED",
          },
          {
            id: ids.staleDuty,
            pharmacyId: ids.alpha,
            sourceId: ids.stale,
            startsAt: start,
            endsAt: end,
            status: "APPROVED",
          },
          {
            id: ids.unsourcedDuty,
            pharmacyId: ids.bravo,
            startsAt: start,
            endsAt: end,
            status: "APPROVED",
          },
          {
            id: ids.exceptedDuty,
            pharmacyId: ids.bravo,
            sourceId: ids.stale,
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
            pharmacyId: ids.alpha,
            sourceId: ids.fresh,
            startsAt: start,
            endsAt: end,
            status: "PENDING",
          },
        ],
      });
      await prisma.dutyException.create({
        data: {
          dutyPeriodId: ids.exceptedDuty,
          kind: "CANCELLED",
          startsAt: start,
          endsAt: end,
        },
      });
      await prisma.contribution.createMany({
        data: [
          {
            pharmacyName: "Suggestion 1",
            address: "1 avenue",
            district: "Plateau",
            arrondissement: "Poto-Poto",
            latitude: "-4.2637080",
            longitude: "15.2428850",
            status: "PENDING",
          },
          {
            pharmacyName: "Suggestion 2",
            address: "2 avenue",
            district: "Plateau",
            arrondissement: "Poto-Poto",
            latitude: "-4.2637080",
            longitude: "15.2428850",
            status: "APPROVED",
          },
        ],
      });
      await prisma.report.createMany({
        data: [
          { pharmacyId: ids.alpha, category: "hours", status: "OPEN" },
          { pharmacyId: ids.alpha, category: "hours", status: "IN_REVIEW" },
          { pharmacyId: ids.bravo, category: "hours", status: "RESOLVED" },
        ],
      });
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(overviewData(response).quality).toEqual({
        publishedPharmacies: 2,
        pendingContributions: 1,
        unresolvedReports: 2,
        currentApprovedDutyPeriods: 4,
        currentDutyPeriodsExcludedByExceptions: 1,
        currentDutyPeriodsAfterExceptions: 3,
        currentDutySourceFreshness: { fresh: 1, stale: 1, unknown: 1 },
        registeredSources: { fresh: 1, stale: 1 },
      });
    });
  },
);
