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
  alpha: "00000000-0000-4000-8000-000000006301",
  beta: "00000000-0000-4000-8000-000000006302",
  draft: "00000000-0000-4000-8000-000000006303",
  invalid: "00000000-0000-4000-8000-000000006304",
  deleted: "00000000-0000-4000-8000-000000006305",
  session: "00000000-0000-4000-8000-000000006399",
} as const;

interface Metric {
  current: number;
  previous: number;
  deltaPercent: number | null;
}
interface ActivityData {
  version: number;
  window: string;
  period: {
    timeZone: string;
    from: string;
    to: string;
    asOf: string;
    previousFrom: string;
    previousTo: string;
  };
  comparisons: Record<
    | "discovery_viewed"
    | "search_submitted"
    | "pharmacy_detail_viewed"
    | "pharmacy_call_started"
    | "route_started"
    | "arrival_confirmed",
    Metric
  >;
  pharmacyActivity: {
    data: Array<{
      pharmacyId: string;
      name: string;
      coordinates: { latitude: number; longitude: number };
      detailViews: number;
    }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    mappedDetailViews: number;
    unmappedDetailViews: number;
    totalDetailViews: number;
  };
}

function dataFrom(response: { json(): unknown }): ActivityData {
  const body = response.json();
  if (!body || typeof body !== "object" || !("data" in body))
    throw new Error("Expected a data envelope");
  return body.data as ActivityData;
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
  const row = (
    id: string,
    name: string,
    status: "PUBLISHED" | "DRAFT",
    latitude: string,
  ) => ({
    id,
    name,
    address: "1 avenue",
    district: "Plateau",
    arrondissement: "Poto-Poto",
    latitude,
    longitude: "15.2428850",
    status,
  });
  await prisma.pharmacy.createMany({
    data: [
      row(ids.alpha, "Pharmacie Alpha", "PUBLISHED", "-4.2637080"),
      row(ids.beta, "Pharmacie Beta", "PUBLISHED", "-4.2637000"),
      row(ids.draft, "Pharmacie non publiée", "DRAFT", "-4.2637000"),
      row(ids.invalid, "Pharmacie mal géocodée", "PUBLISHED", "91.0000000"),
    ],
  });
}

it("protects the dedicated activity route before touching MariaDB (RED #63)", async () => {
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
      url: "/api/v1/admin/analytics/activity?window=7d",
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
  "admin analytics activity HTTP contract (MariaDB RED #63)",
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

    it("returns honest zeroes, rejects unbounded queries and hides data from unauthenticated callers", async () => {
      const denied = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity",
      });
      expect(denied.statusCode).toBe(401);
      expect(JSON.stringify(denied.json())).not.toMatch(
        /comparisons|pharmacyActivity/,
      );
      const invalidCookie = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity",
        headers: { cookie: "wanzila_admin_session=invalid" },
      });
      expect(invalidCookie.statusCode).toBe(401);
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const data = dataFrom(response);
      expect(data).toMatchObject({
        version: 1,
        window: "7d",
        period: {
          timeZone: "Africa/Brazzaville",
          from: "2026-09-09T23:00:00.000Z",
          to: NOW.toISOString(),
          asOf: NOW.toISOString(),
          previousFrom: "2026-09-03T10:00:00.000Z",
          previousTo: "2026-09-09T23:00:00.000Z",
        },
        pharmacyActivity: {
          data: [],
          pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
          mappedDetailViews: 0,
          unmappedDetailViews: 0,
          totalDetailViews: 0,
        },
      });
      for (const metric of Object.values(data.comparisons))
        expect(metric).toEqual({ current: 0, previous: 0, deltaPercent: null });
      const thirty = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity?window=30d",
        headers: { cookie },
      });
      expect(thirty.statusCode).toBe(200);
      expect(dataFrom(thirty).period.from).toBe("2026-08-17T23:00:00.000Z");
      for (const query of ["window=1d", "page=0", "pageSize=101", "extra=x"]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/api/v1/admin/analytics/activity?${query}`,
          headers: { cookie },
        });
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json()).toMatchObject({
          error: { code: "BAD_REQUEST" },
        });
      }
    });

    it("uses equal elapsed windows and excludes every upper bound, including previousTo and asOf", async () => {
      await prisma.analyticsEvent.createMany({
        data: [
          {
            name: "discovery_viewed",
            occurredAt: new Date("2026-09-03T09:59:59.999Z"),
          },
          {
            name: "discovery_viewed",
            occurredAt: new Date("2026-09-03T10:00:00.000Z"),
          },
          {
            name: "discovery_viewed",
            occurredAt: new Date("2026-09-09T22:59:59.999Z"),
          },
          {
            name: "discovery_viewed",
            occurredAt: new Date("2026-09-09T23:00:00.000Z"),
          },
          {
            name: "discovery_viewed",
            occurredAt: new Date("2026-09-16T11:59:59.999Z"),
          },
          { name: "discovery_viewed", occurredAt: NOW },
          {
            name: "search_submitted",
            properties: { queryLength: 5 },
            occurredAt: new Date("2026-09-16T11:00:00.000Z"),
          },
          {
            name: "arrival_confirmed",
            pharmacyId: ids.deleted,
            occurredAt: new Date("2026-09-03T12:00:00.000Z"),
          },
          {
            name: "empty_results_shown",
            properties: { queryLength: 5, resultCount: 0 },
            occurredAt: new Date("2026-09-16T11:00:00.000Z"),
          },
        ],
      });
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const data = dataFrom(response);
      expect(
        new Date(data.period.to).getTime() -
          new Date(data.period.from).getTime(),
      ).toBe(
        new Date(data.period.previousTo).getTime() -
          new Date(data.period.previousFrom).getTime(),
      );
      expect(data.comparisons.discovery_viewed).toEqual({
        current: 2,
        previous: 2,
        deltaPercent: 0,
      });
      expect(data.comparisons.search_submitted).toEqual({
        current: 1,
        previous: 0,
        deltaPercent: null,
      });
      expect(data.comparisons.arrival_confirmed).toEqual({
        current: 0,
        previous: 1,
        deltaPercent: -100,
      });
      const overview = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie },
      });
      const overviewData = adminAnalyticsOverviewResponseSchema.parse(
        overview.json(),
      ).data;
      expect(data.comparisons.discovery_viewed.current).toBe(
        overviewData.events.totals.discovery_viewed,
      );
      expect(overviewData.events.daily).toHaveLength(7);
      expect(overviewData.events.totals.empty_results_shown).toBe(1);
    });

    it("maps only published geocoded pharmacies and counts every unmapped detail event", async () => {
      await seedPharmacies(prisma);
      const occurredAt = new Date("2026-09-16T11:00:00.000Z");
      await prisma.analyticsEvent.createMany({
        data: [
          ...Array.from({ length: 3 }, () => ({
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.alpha,
            sessionId: ids.session,
            occurredAt,
          })),
          ...Array.from({ length: 2 }, () => ({
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.beta,
            occurredAt,
          })),
          { name: "pharmacy_detail_viewed", pharmacyId: ids.draft, occurredAt },
          {
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.invalid,
            occurredAt,
          },
          {
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.deleted,
            occurredAt,
          },
          { name: "pharmacy_detail_viewed", occurredAt },
          {
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.alpha,
            occurredAt: new Date("2026-09-03T12:00:00.000Z"),
          },
          {
            name: "pharmacy_detail_viewed",
            pharmacyId: ids.alpha,
            occurredAt: new Date("2026-09-03T13:00:00.000Z"),
          },
          {
            name: "filters_applied",
            properties: { district: "Plateau" },
            occurredAt,
          },
        ],
      });
      const first = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity?pageSize=1",
        headers: { cookie },
      });
      expect(first.statusCode).toBe(200);
      const data = dataFrom(first);
      expect(data.comparisons.pharmacy_detail_viewed).toEqual({
        current: 9,
        previous: 2,
        deltaPercent: 350,
      });
      expect(data.pharmacyActivity).toEqual({
        data: [
          {
            pharmacyId: ids.alpha,
            name: "Pharmacie Alpha",
            coordinates: { latitude: -4.263708, longitude: 15.242885 },
            detailViews: 3,
          },
        ],
        pagination: { page: 1, pageSize: 1, total: 2, totalPages: 2 },
        mappedDetailViews: 5,
        unmappedDetailViews: 4,
        totalDetailViews: 9,
      });
      const second = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity?page=2&pageSize=1",
        headers: { cookie },
      });
      expect(dataFrom(second).pharmacyActivity).toMatchObject({
        data: [{ pharmacyId: ids.beta, detailViews: 2 }],
        pagination: { page: 2, total: 2 },
        mappedDetailViews: 5,
        unmappedDetailViews: 4,
      });
      const beyond = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity?page=3&pageSize=1",
        headers: { cookie },
      });
      expect(dataFrom(beyond).pharmacyActivity.data).toEqual([]);
      expect(JSON.stringify(data)).not.toMatch(
        /sessionId|queryLength|filters_applied|visitor|routePoints/,
      );
      const overview = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie },
      });
      expect(data.pharmacyActivity.totalDetailViews).toBe(
        adminAnalyticsOverviewResponseSchema.parse(overview.json()).data.events
          .totals.pharmacy_detail_viewed,
      );
    });

    it("caps a dense map to 100 points per page with deterministic pharmacyId ties", async () => {
      const idsForMap = Array.from(
        { length: 101 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(630100 + index).padStart(12, "0")}`,
      );
      await prisma.pharmacy.createMany({
        data: idsForMap.map((id, index) => ({
          id,
          name: `Pharmacie ${index}`,
          address: "1 avenue",
          district: "Plateau",
          arrondissement: "Poto-Poto",
          latitude: "-4.2637080",
          longitude: "15.2428850",
          status: "PUBLISHED" as const,
        })),
      });
      await prisma.analyticsEvent.createMany({
        data: idsForMap.map((pharmacyId) => ({
          name: "pharmacy_detail_viewed",
          pharmacyId,
          occurredAt: new Date("2026-09-16T11:00:00.000Z"),
        })),
      });
      const first = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity",
        headers: { cookie },
      });
      expect(first.statusCode).toBe(200);
      const pageOne = dataFrom(first).pharmacyActivity;
      expect(pageOne.pagination).toEqual({
        page: 1,
        pageSize: 100,
        total: 101,
        totalPages: 2,
      });
      expect(pageOne.data).toHaveLength(100);
      expect(pageOne.data.map((point) => point.pharmacyId)).toEqual(
        idsForMap.slice(0, 100),
      );
      expect(pageOne.mappedDetailViews).toBe(101);
      const second = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/activity?page=2",
        headers: { cookie },
      });
      expect(
        dataFrom(second).pharmacyActivity.data.map((point) => point.pharmacyId),
      ).toEqual(idsForMap.slice(100));
    });
  },
);
