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
const disposableTestDatabaseUrl =
  getDisposableTestDatabaseUrl(process.env) ?? "";
const NOW = new Date("2026-09-16T12:00:00.000Z");
const START = "2026-09-16T08:00:00.000Z";
const END = "2026-09-16T20:00:00.000Z";
const ids = {
  alpha: "00000000-0000-4000-8000-000000004811",
  bravo: "00000000-0000-4000-8000-000000004812",
  missing: "00000000-0000-4000-8000-000000004899",
  freshSource: "00000000-0000-4000-8000-000000004821",
  staleSource: "00000000-0000-4000-8000-000000004822",
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

function responseData<T>(response: { json(): unknown }): T {
  const body = response.json();
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new Error("Expected a data envelope");
  }
  return body.data as T;
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
    ],
  });
  await prisma.scheduleSource.createMany({
    data: [
      {
        id: ids.freshSource,
        name: "Bulletin frais",
        reliability: 90,
        observedAt: new Date("2026-09-16T11:00:00.000Z"),
      },
      {
        id: ids.staleSource,
        name: "Bulletin ancien",
        reliability: 40,
        observedAt: new Date("2026-09-15T00:00:00.000Z"),
      },
    ],
  });
}

it("registers protected duty administration routes before querying MariaDB (RED #48)", async () => {
  const prisma = { $disconnect: async () => {} } as unknown as ApiPrismaClient;
  const app = await createApp({
    prisma,
    webOrigin: WEB_ORIGIN,
    now: () => NOW,
    nodeEnvironment: "test",
  });
  try {
    for (const url of ["/api/v1/admin/sources", "/api/v1/admin/duties"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: { code: "AUTHENTICATION_REQUIRED" },
      });
    }
  } finally {
    await app.close();
  }
});

describe.runIf(Boolean(disposableTestDatabaseUrl))(
  "admin duty/source/exception HTTP contract (MariaDB RED #48)",
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
        env: { ...process.env, DATABASE_URL: disposableTestDatabaseUrl },
      });
    }, 60_000);

    beforeEach(async () => {
      currentTime = NOW;
      prisma = createPrismaClient(disposableTestDatabaseUrl);
      await clearFixtures(prisma);
      const bootstrap = await bootstrapAdministrator({
        ...process.env,
        DATABASE_URL: disposableTestDatabaseUrl,
        NODE_ENV: "test",
        WZ_ADMIN_BOOTSTRAP_EMAIL: ADMINISTRATOR.email,
        WZ_ADMIN_BOOTSTRAP_PASSWORD: ADMINISTRATOR.password,
        WZ_ADMIN_BOOTSTRAP_DISPLAY_NAME: ADMINISTRATOR.displayName,
      });
      if (bootstrap.exitCode !== 0)
        throw new Error(`Administrator bootstrap failed: ${bootstrap.output}`);
      await seed(prisma);
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

    const mutationHeaders = (session: string) => ({
      cookie: session,
      origin: WEB_ORIGIN,
      "content-type": "application/json",
    });
    const errorCode = (response: { json(): unknown }) =>
      (response.json() as { error: { code: string } }).error.code;

    it("lists sources in stable order, paginates, and derives freshness from observedAt, not updatedAt", async () => {
      const list = await app.inject({
        method: "GET",
        url: "/api/v1/admin/sources?page=1&pageSize=1",
        headers: { cookie },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({
        data: [{ id: ids.staleSource, freshness: "STALE" }],
        pagination: { page: 1, pageSize: 1, total: 2, totalPages: 2 },
      });
      const second = await app.inject({
        method: "GET",
        url: "/api/v1/admin/sources?page=2&pageSize=1",
        headers: { cookie },
      });
      expect(second.json()).toMatchObject({
        data: [{ id: ids.freshSource, freshness: "FRESH" }],
      });
      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/sources/${ids.staleSource}`,
        headers: mutationHeaders(cookie),
        payload: { name: "Bulletin ancien corrigé" },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        data: { observedAt: "2026-09-15T00:00:00.000Z", freshness: "STALE" },
      });
    });

    it("creates and updates a source with explicit observation timestamp and validated metadata", async () => {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/admin/sources",
        headers: mutationHeaders(cookie),
        payload: {
          name: "Bulletin nouveau",
          reliability: 80,
          observedAt: "2026-09-16T11:30:00.000Z",
        },
      });
      expect(created.statusCode).toBe(201);
      const source = responseData<{ id: string; freshness: string }>(created);
      expect(source.freshness).toBe("FRESH");
      const corrected = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/sources/${source.id}`,
        headers: mutationHeaders(cookie),
        payload: {
          observedAt: "2026-09-15T00:00:00.000Z",
          description: "Correction",
        },
      });
      expect(corrected.statusCode).toBe(200);
      expect(corrected.json()).toMatchObject({
        data: { id: source.id, freshness: "STALE", description: "Correction" },
      });
      expect(
        (
          await prisma.scheduleSource.findUniqueOrThrow({
            where: { id: source.id },
          })
        ).observedAt.toISOString(),
      ).toBe("2026-09-15T00:00:00.000Z");
      const futureCorrection = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/sources/${source.id}`,
        headers: mutationHeaders(cookie),
        payload: { observedAt: "2026-09-16T12:00:00.001Z" },
      });
      expect(futureCorrection.statusCode).toBe(400);
      expect(errorCode(futureCorrection)).toBe("BAD_REQUEST");
      expect(
        (
          await prisma.scheduleSource.findUniqueOrThrow({
            where: { id: source.id },
          })
        ).observedAt.toISOString(),
      ).toBe("2026-09-15T00:00:00.000Z");
    });

    it("creates PENDING duties, filters and paginates them, then publishes only after approval", async () => {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/admin/duties",
        headers: mutationHeaders(cookie),
        payload: {
          pharmacyId: ids.alpha,
          sourceId: ids.freshSource,
          startsAt: START,
          endsAt: END,
        },
      });
      expect(created.statusCode).toBe(201);
      const duty = responseData<{ id: string; status: string }>(created);
      expect(duty.status).toBe("PENDING");
      const pendingPublic = await app.inject({
        method: "GET",
        url: "/api/v1/pharmacies",
      });
      expect(responseData<Array<{ id: string }>>(pendingPublic)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: ids.alpha })]),
      );
      const list = await app.inject({
        method: "GET",
        url: `/api/v1/admin/duties?pharmacyId=${ids.alpha}&status=PENDING&page=1&pageSize=1`,
        headers: { cookie },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({
        data: [{ id: duty.id }],
        pagination: { page: 1, pageSize: 1, total: 1, totalPages: 1 },
      });
      const approved = await app.inject({
        method: "POST",
        url: `/api/v1/admin/duties/${duty.id}/approve`,
        headers: { cookie, origin: WEB_ORIGIN },
      });
      expect(approved.statusCode).toBe(200);
      expect(approved.json()).toMatchObject({
        data: { id: duty.id, status: "APPROVED" },
      });
      const publicList = await app.inject({
        method: "GET",
        url: "/api/v1/pharmacies",
      });
      expect(publicList.json()).toMatchObject({
        data: [
          {
            id: ids.alpha,
            currentDuty: {
              state: "ACTIVE",
              sourceFreshness: "FRESH",
              source: { name: "Bulletin frais" },
            },
          },
        ],
      });
      const terminalPatch = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/duties/${duty.id}`,
        headers: mutationHeaders(cookie),
        payload: { endsAt: "2026-09-16T21:00:00.000Z" },
      });
      expect(terminalPatch.statusCode).toBe(409);
      expect(errorCode(terminalPatch)).toBe("CONFLICT");
      expect(
        (
          await prisma.dutyPeriod.findUniqueOrThrow({ where: { id: duty.id } })
        ).endsAt.toISOString(),
      ).toBe(END);
    });

    it("updates only PENDING duty metadata and rejects foreign source IDs", async () => {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/admin/duties",
        headers: mutationHeaders(cookie),
        payload: { pharmacyId: ids.alpha, startsAt: START, endsAt: END },
      });
      expect(created.statusCode).toBe(201);
      const dutyId = responseData<{ id: string }>(created).id;
      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/duties/${dutyId}`,
        headers: mutationHeaders(cookie),
        payload: {
          sourceId: ids.staleSource,
          endsAt: "2026-09-16T21:00:00.000Z",
        },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        data: {
          id: dutyId,
          status: "PENDING",
          sourceId: ids.staleSource,
          endsAt: "2026-09-16T21:00:00.000Z",
        },
      });
      const foreign = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/duties/${dutyId}`,
        headers: mutationHeaders(cookie),
        payload: { sourceId: ids.missing },
      });
      expect(foreign.statusCode).toBe(404);
      expect(errorCode(foreign)).toBe("NOT_FOUND");
      expect(
        (await prisma.dutyPeriod.findUniqueOrThrow({ where: { id: dutyId } }))
          .sourceId,
      ).toBe(ids.staleSource);
    });

    it("keeps rejection out of public discovery and rejects repeated or terminal transitions", async () => {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/admin/duties",
        headers: mutationHeaders(cookie),
        payload: { pharmacyId: ids.alpha, startsAt: START, endsAt: END },
      });
      const dutyId = responseData<{ id: string }>(created).id;
      const rejected = await app.inject({
        method: "POST",
        url: `/api/v1/admin/duties/${dutyId}/reject`,
        headers: { cookie, origin: WEB_ORIGIN },
      });
      expect(rejected.statusCode).toBe(200);
      expect(rejected.json()).toMatchObject({ data: { status: "REJECTED" } });
      const retry = await app.inject({
        method: "POST",
        url: `/api/v1/admin/duties/${dutyId}/approve`,
        headers: { cookie, origin: WEB_ORIGIN },
      });
      expect(retry.statusCode).toBe(409);
      expect(errorCode(retry)).toBe("CONFLICT");
      const terminalPatch = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/duties/${dutyId}`,
        headers: mutationHeaders(cookie),
        payload: { endsAt: "2026-09-16T21:00:00.000Z" },
      });
      expect(terminalPatch.statusCode).toBe(409);
      expect(errorCode(terminalPatch)).toBe("CONFLICT");
      const persisted = await prisma.dutyPeriod.findUniqueOrThrow({
        where: { id: dutyId },
      });
      expect(persisted.status).toBe("REJECTED");
      expect(persisted.endsAt.toISOString()).toBe(END);
      const publicList = await app.inject({
        method: "GET",
        url: "/api/v1/pharmacies",
      });
      expect(responseData<Array<{ id: string }>>(publicList)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: ids.alpha })]),
      );
    });

    it("rejects overlapping approvals for one pharmacy, permits adjacency and another pharmacy, including a publish race", async () => {
      const create = (pharmacyId: string, startsAt: string, endsAt: string) =>
        prisma.dutyPeriod.create({
          data: {
            pharmacyId,
            startsAt: new Date(startsAt),
            endsAt: new Date(endsAt),
            status: "PENDING",
          },
        });
      const first = await create(ids.alpha, START, END);
      const overlapping = await create(
        ids.alpha,
        "2026-09-16T10:00:00.000Z",
        "2026-09-16T21:00:00.000Z",
      );
      const otherPharmacy = await create(ids.bravo, START, END);
      const approve = (id: string) =>
        app.inject({
          method: "POST",
          url: `/api/v1/admin/duties/${id}/approve`,
          headers: { cookie, origin: WEB_ORIGIN },
        });
      const race = await Promise.all([
        approve(first.id),
        approve(overlapping.id),
      ]);
      expect(race.map((result) => result.statusCode).sort()).toEqual([
        200, 409,
      ]);
      expect(
        await prisma.dutyPeriod.count({
          where: { pharmacyId: ids.alpha, status: "APPROVED" },
        }),
      ).toBe(1);
      const winner = await prisma.dutyPeriod.findFirstOrThrow({
        where: { pharmacyId: ids.alpha, status: "APPROVED" },
      });
      const adjacent = await create(
        ids.alpha,
        winner.endsAt.toISOString(),
        "2026-09-17T08:00:00.000Z",
      );
      expect((await approve(adjacent.id)).statusCode).toBe(200);
      expect((await approve(otherPharmacy.id)).statusCode).toBe(200);
    });

    it("keeps public discovery inside the approved half-open [start,end) window", async () => {
      await prisma.dutyPeriod.create({
        data: {
          pharmacyId: ids.alpha,
          startsAt: new Date(START),
          endsAt: new Date(END),
          status: "APPROVED",
        },
      });
      for (const [instant, visible] of [
        ["2026-09-16T07:59:59.999Z", false],
        [START, true],
        ["2026-09-16T19:59:59.999Z", true],
        [END, false],
      ] as const) {
        currentTime = new Date(instant);
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/pharmacies",
        });
        expect(response.statusCode).toBe(200);
        const pharmacies = responseData<Array<{ id: string }>>(response);
        expect(pharmacies.some((pharmacy) => pharmacy.id === ids.alpha)).toBe(
          visible,
        );
      }
    });

    it("applies bounded cancellation/unavailability and rejects overlapping exceptions", async () => {
      const duty = await prisma.dutyPeriod.create({
        data: {
          pharmacyId: ids.alpha,
          startsAt: new Date(START),
          endsAt: new Date(END),
          status: "APPROVED",
        },
      });
      const base = `/api/v1/admin/duties/${duty.id}/exceptions`;
      const created = await app.inject({
        method: "POST",
        url: base,
        headers: mutationHeaders(cookie),
        payload: {
          kind: "CANCELLED",
          startsAt: "2026-09-16T10:00:00.000Z",
          endsAt: "2026-09-16T14:00:00.000Z",
          reason: "Fermeture",
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        data: { dutyPeriodId: duty.id, kind: "CANCELLED" },
      });
      const exceptionId = responseData<{ id: string }>(created).id;
      const amended = await app.inject({
        method: "PATCH",
        url: `${base}/${exceptionId}`,
        headers: mutationHeaders(cookie),
        payload: { reason: "Fermeture confirmée" },
      });
      expect(amended.statusCode).toBe(200);
      expect(amended.json()).toMatchObject({
        data: { id: exceptionId, reason: "Fermeture confirmée" },
      });
      const publicList = await app.inject({
        method: "GET",
        url: "/api/v1/pharmacies",
      });
      expect(responseData<Array<{ id: string }>>(publicList)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: ids.alpha })]),
      );
      const overlap = await app.inject({
        method: "POST",
        url: base,
        headers: mutationHeaders(cookie),
        payload: {
          kind: "UNAVAILABLE",
          startsAt: "2026-09-16T12:00:00.000Z",
          endsAt: "2026-09-16T16:00:00.000Z",
        },
      });
      expect(overlap.statusCode).toBe(409);
      expect(errorCode(overlap)).toBe("CONFLICT");
      const outside = await app.inject({
        method: "POST",
        url: base,
        headers: mutationHeaders(cookie),
        payload: {
          kind: "UNAVAILABLE",
          startsAt: "2026-09-16T19:00:00.000Z",
          endsAt: "2026-09-16T21:00:00.000Z",
        },
      });
      expect(outside.statusCode).toBe(400);
      expect(errorCode(outside)).toBe("BAD_REQUEST");
      const adjacent = await app.inject({
        method: "POST",
        url: base,
        headers: mutationHeaders(cookie),
        payload: {
          kind: "UNAVAILABLE",
          startsAt: "2026-09-16T14:00:00.000Z",
          endsAt: END,
        },
      });
      expect(adjacent.statusCode).toBe(201);
      for (const [payload, statusCode, code] of [
        [{ startsAt: "2026-09-16T07:59:59.999Z" }, 400, "BAD_REQUEST"],
        [{ endsAt: "2026-09-16T15:00:00.000Z" }, 409, "CONFLICT"],
      ] as const) {
        const invalidPatch = await app.inject({
          method: "PATCH",
          url: `${base}/${exceptionId}`,
          headers: mutationHeaders(cookie),
          payload,
        });
        expect(invalidPatch.statusCode).toBe(statusCode);
        expect(errorCode(invalidPatch)).toBe(code);
      }
      const persistedException = await prisma.dutyException.findUniqueOrThrow({
        where: { id: exceptionId },
      });
      expect(persistedException.startsAt.toISOString()).toBe(
        "2026-09-16T10:00:00.000Z",
      );
      expect(persistedException.endsAt.toISOString()).toBe(
        "2026-09-16T14:00:00.000Z",
      );
      const list = await app.inject({
        method: "GET",
        url: `${base}?page=1&pageSize=2`,
        headers: { cookie },
      });
      expect(list.json()).toMatchObject({
        data: [{ kind: "CANCELLED" }, { kind: "UNAVAILABLE" }],
        pagination: { total: 2 },
      });
    });

    it("atomically cancels an approved duty with partial history and keeps public reads unambiguous", async () => {
      const duty = await prisma.dutyPeriod.create({
        data: {
          pharmacyId: ids.alpha,
          startsAt: new Date(START),
          endsAt: new Date(END),
          status: "APPROVED",
        },
      });
      await prisma.dutyException.createMany({
        data: [
          {
            dutyPeriodId: duty.id,
            kind: "UNAVAILABLE",
            startsAt: new Date("2026-09-16T09:00:00.000Z"),
            endsAt: new Date("2026-09-16T10:00:00.000Z"),
            reason: "Interruption annoncée",
          },
          {
            dutyPeriodId: duty.id,
            kind: "CANCELLED",
            startsAt: new Date("2026-09-16T16:00:00.000Z"),
            endsAt: new Date("2026-09-16T17:00:00.000Z"),
            reason: "Fermeture partielle",
          },
        ],
      });
      const path = `/api/v1/admin/duties/${duty.id}/full-cancellation`;
      const before = await app.inject({
        method: "GET",
        url: `/api/v1/pharmacies/${ids.alpha}`,
      });
      expect(
        responseData<{ currentDuty?: unknown }>(before).currentDuty,
      ).toBeDefined();

      const unauthenticated = await app.inject({ method: "POST", url: path });
      expect(unauthenticated.statusCode).toBe(401);
      const forbidden = await app.inject({
        method: "POST",
        url: path,
        headers: { cookie, origin: "https://foreign.example" },
        payload: {},
      });
      expect(forbidden.statusCode).toBe(403);
      const invalid = await app.inject({
        method: "POST",
        url: path,
        headers: mutationHeaders(cookie),
        payload: { kind: "CANCELLED" },
      });
      expect(invalid.statusCode).toBe(400);

      const [first, second] = await Promise.all([
        app.inject({
          method: "POST",
          url: path,
          headers: mutationHeaders(cookie),
          payload: { reason: "Fermeture complète confirmée" },
        }),
        app.inject({
          method: "POST",
          url: path,
          headers: mutationHeaders(cookie),
          payload: { reason: "Nouvelle tentative" },
        }),
      ]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 201]);
      const markerId = responseData<{ id: string }>(first).id;
      expect(responseData<{ id: string }>(second).id).toBe(markerId);
      const rows = await prisma.dutyException.findMany({
        where: { dutyPeriodId: duty.id },
        orderBy: { startsAt: "asc" },
      });
      expect(rows).toHaveLength(3);
      expect(rows.map((row) => row.reason)).toContain("Interruption annoncée");
      expect(rows.map((row) => row.reason)).toContain("Fermeture partielle");
      const marker = rows.find((row) => row.id === markerId);
      expect(marker).toMatchObject({ kind: "CANCELLED" });
      expect(marker?.startsAt.toISOString()).toBe(START);
      expect(marker?.endsAt.toISOString()).toBe(END);
      expect(
        (await prisma.dutyPeriod.findUniqueOrThrow({ where: { id: duty.id } }))
          .status,
      ).toBe("APPROVED");

      const after = await app.inject({
        method: "GET",
        url: `/api/v1/pharmacies/${ids.alpha}`,
      });
      expect(
        responseData<{ currentDuty?: unknown }>(after).currentDuty,
      ).toBeUndefined();
      const listed = await app.inject({
        method: "GET",
        url: "/api/v1/pharmacies",
      });
      expect(responseData<Array<{ id: string }>>(listed)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: ids.alpha })]),
      );
      const summary = await app.inject({
        method: "GET",
        url: "/api/v1/admin/duties/summary",
        headers: { cookie },
      });
      expect(summary.json()).toMatchObject({ data: { active: 0 } });
      const overview = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie },
      });
      expect(overview.json()).toMatchObject({
        data: { quality: { currentDutyPeriodsAfterExceptions: 0 } },
      });
      const quality = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality",
        headers: { cookie },
      });
      expect(quality.json()).toMatchObject({
        data: {
          sources: { totals: { currentDutyPeriodsAfterExceptions: 0 } },
        },
      });
      const ordinary = await app.inject({
        method: "POST",
        url: `/api/v1/admin/duties/${duty.id}/exceptions`,
        headers: mutationHeaders(cookie),
        payload: {
          kind: "UNAVAILABLE",
          startsAt: "2026-09-16T11:00:00.000Z",
          endsAt: "2026-09-16T13:00:00.000Z",
        },
      });
      expect(ordinary.statusCode).toBe(409);
      for (const exceptionId of [
        markerId,
        rows.find((row) => row.id !== markerId)!.id,
      ]) {
        const patch = await app.inject({
          method: "PATCH",
          url: `/api/v1/admin/duties/${duty.id}/exceptions/${exceptionId}`,
          headers: mutationHeaders(cookie),
          payload: { reason: "Tentative tardive" },
        });
        expect(patch.statusCode).toBe(409);
      }
      const pending = await prisma.dutyPeriod.create({
        data: {
          pharmacyId: ids.bravo,
          startsAt: new Date(START),
          endsAt: new Date(END),
          status: "PENDING",
        },
      });
      const pendingResponse = await app.inject({
        method: "POST",
        url: `/api/v1/admin/duties/${pending.id}/full-cancellation`,
        headers: mutationHeaders(cookie),
        payload: {},
      });
      expect(pendingResponse.statusCode).toBe(409);
      const missing = await app.inject({
        method: "POST",
        url: `/api/v1/admin/duties/${ids.missing}/full-cancellation`,
        headers: mutationHeaders(cookie),
        payload: {},
      });
      expect(missing.statusCode).toBe(404);
    });

    it("enforces session, Origin, malformed/foreign IDs, and stable error envelopes", async () => {
      for (const url of [
        "/api/v1/admin/sources",
        "/api/v1/admin/duties",
        `/api/v1/admin/duties/${ids.missing}/exceptions`,
      ]) {
        const unauthenticated = await app.inject({ method: "GET", url });
        expect(unauthenticated.statusCode).toBe(401);
        expect(errorCode(unauthenticated)).toBe("AUTHENTICATION_REQUIRED");
      }
      for (const [method, url, payload] of [
        ["POST", "/api/v1/admin/sources", { name: "X", observedAt: START }],
        [
          "POST",
          "/api/v1/admin/duties",
          { pharmacyId: ids.alpha, startsAt: START, endsAt: END },
        ],
        [
          "POST",
          `/api/v1/admin/duties/${ids.missing}/exceptions`,
          { kind: "CANCELLED", startsAt: START, endsAt: END },
        ],
      ] as const) {
        const noSession = await app.inject({
          method,
          url,
          headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
          payload,
        });
        expect(noSession.statusCode).toBe(401);
        expect(errorCode(noSession)).toBe("AUTHENTICATION_REQUIRED");
        const wrongOrigin = await app.inject({
          method,
          url,
          headers: {
            cookie,
            origin: "https://foreign.example",
            "content-type": "application/json",
          },
          payload,
        });
        expect(wrongOrigin.statusCode).toBe(403);
        expect(errorCode(wrongOrigin)).toBe("ORIGIN_FORBIDDEN");
      }
      for (const url of [
        "/api/v1/admin/sources?page=0",
        "/api/v1/admin/duties?status=INVALID",
        "/api/v1/admin/duties?pageSize=51",
      ]) {
        const invalid = await app.inject({
          method: "GET",
          url,
          headers: { cookie },
        });
        expect(invalid.statusCode).toBe(400);
        expect(errorCode(invalid)).toBe("BAD_REQUEST");
      }
      for (const payload of [
        { pharmacyId: ids.missing, startsAt: START, endsAt: END },
        { pharmacyId: ids.alpha, startsAt: END, endsAt: START },
      ]) {
        const invalid = await app.inject({
          method: "POST",
          url: "/api/v1/admin/duties",
          headers: mutationHeaders(cookie),
          payload,
        });
        expect(invalid.statusCode).toBe(
          payload.pharmacyId === ids.missing ? 404 : 400,
        );
        expect(errorCode(invalid)).toBe(
          payload.pharmacyId === ids.missing ? "NOT_FOUND" : "BAD_REQUEST",
        );
      }
      for (const payload of [
        { name: "Bulletin invalide", reliability: 101, observedAt: START },
        {
          name: "Bulletin futur",
          reliability: 80,
          observedAt: "2026-09-17T00:00:00.000Z",
        },
      ]) {
        const invalid = await app.inject({
          method: "POST",
          url: "/api/v1/admin/sources",
          headers: mutationHeaders(cookie),
          payload,
        });
        expect(invalid.statusCode).toBe(400);
        expect(errorCode(invalid)).toBe("BAD_REQUEST");
      }
      const invalidException = await app.inject({
        method: "POST",
        url: `/api/v1/admin/duties/${ids.missing}/exceptions`,
        headers: mutationHeaders(cookie),
        payload: { kind: "CLOSED", startsAt: START, endsAt: END },
      });
      expect(invalidException.statusCode).toBe(400);
      expect(errorCode(invalidException)).toBe("BAD_REQUEST");
      const missing = await app.inject({
        method: "POST",
        url: `/api/v1/admin/duties/${ids.missing}/approve`,
        headers: { cookie, origin: WEB_ORIGIN },
      });
      expect(missing.statusCode).toBe(404);
      expect(errorCode(missing)).toBe("NOT_FOUND");
    });
  },
);
