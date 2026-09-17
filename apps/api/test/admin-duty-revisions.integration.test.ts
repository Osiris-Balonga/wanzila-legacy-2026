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
const at = new Date("2026-09-16T12:00:00.000Z");
const START = "2026-09-16T08:00:00.000Z";
const END = "2026-09-16T20:00:00.000Z";
const PROPOSED_START = "2026-09-16T13:00:00.000Z";
const PROPOSED_END = "2026-09-16T23:00:00.000Z";
const ids = {
  pharmacy: "00000000-0000-4000-8000-000000007211",
  source: "00000000-0000-4000-8000-000000007212",
  otherSource: "00000000-0000-4000-8000-000000007213",
} as const;

function cookieFrom(headers: OutgoingHttpHeaders): string {
  const header = headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  const match =
    typeof value === "string"
      ? /^wanzila_admin_session=([^;]+)/.exec(value)
      : null;
  if (!match) throw new Error("Expected administrator cookie");
  return `wanzila_admin_session=${match[1]}`;
}

function data<T>(response: { json(): unknown }): T {
  return (response.json() as { data: T }).data;
}

function errorCode(response: { json(): unknown }): string {
  return (response.json() as { error: { code: string } }).error.code;
}

const proposal = () => ({
  sourceId: ids.otherSource,
  startsAt: PROPOSED_START,
  endsAt: PROPOSED_END,
  note: "Correction du bulletin",
});

it("protects the revision surface before any database access (RED #72)", async () => {
  const prisma = { $disconnect: async () => {} } as unknown as ApiPrismaClient;
  const app = await createApp({
    prisma,
    webOrigin: WEB_ORIGIN,
    now: () => at,
    nodeEnvironment: "test",
  });
  try {
    for (const url of [
      "/api/v1/admin/duties/00000000-0000-4000-8000-000000007299",
      "/api/v1/admin/duties/00000000-0000-4000-8000-000000007299/revisions",
    ]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(401);
      expect(errorCode(response)).toBe("AUTHENTICATION_REQUIRED");
    }
    const mutation = await app.inject({
      method: "POST",
      url: "/api/v1/admin/duties/00000000-0000-4000-8000-000000007299/revisions",
      payload: proposal(),
      headers: { origin: WEB_ORIGIN },
    });
    expect(mutation.statusCode).toBe(401);
  } finally {
    await app.close();
  }
});

describe.runIf(Boolean(databaseUrl))(
  "approved duty revisions (guarded MariaDB RED #72)",
  () => {
    let prisma: ApiPrismaClient;
    let app: Awaited<ReturnType<typeof createApp>>;
    let cookie: string;
    let adminId: string;
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
      currentTime = at;
      prisma = createPrismaClient(databaseUrl);
      const revisionTable = await prisma.$queryRawUnsafe<
        Array<{ tableName: string }>
      >("SHOW TABLES LIKE 'DutyRevision'");
      if (revisionTable.length)
        await prisma.$executeRawUnsafe("DELETE FROM DutyRevision");
      await prisma.dutyException.deleteMany();
      await prisma.dutyPeriod.deleteMany();
      await prisma.analyticsEvent.deleteMany();
      await prisma.contribution.deleteMany();
      await prisma.report.deleteMany();
      await prisma.scheduleSource.deleteMany();
      await prisma.pharmacy.deleteMany();
      await clearAdministratorFixtures(prisma);
      const bootstrap = await bootstrapAdministrator({
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        WZ_ADMIN_BOOTSTRAP_EMAIL: ADMINISTRATOR.email,
        WZ_ADMIN_BOOTSTRAP_PASSWORD: ADMINISTRATOR.password,
        WZ_ADMIN_BOOTSTRAP_DISPLAY_NAME: ADMINISTRATOR.displayName,
      });
      if (bootstrap.exitCode) throw new Error(bootstrap.output);
      adminId = (
        await prisma.adminUser.findUniqueOrThrow({
          where: { email: ADMINISTRATOR.email },
        })
      ).id;
      await prisma.pharmacy.create({
        data: {
          id: ids.pharmacy,
          name: "Pharmacie Révision",
          address: "Rue 1",
          district: "Centre",
          arrondissement: "Poto-Poto",
          latitude: "-4.2637080",
          longitude: "15.2428850",
          status: "PUBLISHED",
        },
      });
      await prisma.scheduleSource.createMany({
        data: [
          { id: ids.source, name: "Source initiale", observedAt: at },
          { id: ids.otherSource, name: "Source corrigée", observedAt: at },
        ],
      });
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

    async function approvedDuty(startsAt = START, endsAt = END) {
      return prisma.dutyPeriod.create({
        data: {
          pharmacyId: ids.pharmacy,
          sourceId: ids.source,
          startsAt: new Date(startsAt),
          endsAt: new Date(endsAt),
          status: "APPROVED",
        },
      });
    }
    const headers = (session = cookie, origin = WEB_ORIGIN) => ({
      cookie: session,
      origin,
      "content-type": "application/json",
    });
    const revisionUrl = (dutyId: string) =>
      `/api/v1/admin/duties/${dutyId}/revisions`;
    async function submit(dutyId: string, body = proposal()) {
      return app.inject({
        method: "POST",
        url: revisionUrl(dutyId),
        headers: headers(),
        payload: body,
      });
    }
    async function review(
      dutyId: string,
      revisionId: string,
      action: "approve" | "reject",
    ) {
      return app.inject({
        method: "POST",
        url: `${revisionUrl(dutyId)}/${revisionId}/${action}`,
        headers: headers(),
        payload: { note: "Revue documentée" },
      });
    }

    it("keeps the approved canonical duty public and all summary/quality counts unchanged while revision is PENDING", async () => {
      const duty = await approvedDuty();
      const qualityBefore = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality",
        headers: { cookie },
      });
      const overviewBefore = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie },
      });
      const created = await submit(duty.id);
      expect(created.statusCode).toBe(201);
      const revision = data<{
        id: string;
        status: string;
        before: { sourceId: string };
        proposed: { sourceId: string };
      }>(created);
      expect(revision).toMatchObject({
        status: "PENDING",
        before: { sourceId: ids.source },
        proposed: { sourceId: ids.otherSource },
      });
      const canonical = await prisma.dutyPeriod.findUniqueOrThrow({
        where: { id: duty.id },
      });
      expect(canonical).toMatchObject({
        id: duty.id,
        sourceId: ids.source,
        status: "APPROVED",
      });
      expect(canonical.startsAt.toISOString()).toBe(START);
      const publicList = await app.inject({
        method: "GET",
        url: "/api/v1/pharmacies",
      });
      expect(publicList.json()).toMatchObject({
        data: [
          {
            id: ids.pharmacy,
            currentDuty: {
              startsAt: START,
              source: { name: "Source initiale" },
            },
          },
        ],
        pagination: { total: 1 },
      });
      const publicDetail = await app.inject({
        method: "GET",
        url: `/api/v1/pharmacies/${ids.pharmacy}`,
      });
      expect(publicDetail.json()).toMatchObject({
        data: { currentDuty: { startsAt: START } },
      });
      const summary = await app.inject({
        method: "GET",
        url: "/api/v1/admin/duties/summary",
        headers: { cookie },
      });
      expect(summary.json()).toMatchObject({ data: { active: 1 } });
      const quality = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/quality",
        headers: { cookie },
      });
      expect(quality.statusCode).toBe(200);
      expect(
        data<{ coverage: unknown; sources: unknown }>(quality),
      ).toMatchObject(
        data<{ coverage: unknown; sources: unknown }>(qualityBefore),
      );
      const overview = await app.inject({
        method: "GET",
        url: "/api/v1/admin/analytics/overview",
        headers: { cookie },
      });
      expect(overview.statusCode).toBe(200);
      expect(data<{ quality: unknown }>(overview).quality).toEqual(
        data<{ quality: unknown }>(overviewBefore).quality,
      );
      const detail = await app.inject({
        method: "GET",
        url: `/api/v1/admin/duties/${duty.id}`,
        headers: { cookie },
      });
      expect(detail.json()).toMatchObject({
        data: { id: duty.id, status: "APPROVED", sourceId: ids.source },
      });
      const patch = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/duties/${duty.id}`,
        headers: headers(),
        payload: { startsAt: PROPOSED_START },
      });
      expect(patch.statusCode).toBe(409);
    });

    it("atomically replaces the same duty ID and records before/after, submitter, reviewer, dates and notes", async () => {
      const duty = await approvedDuty();
      const created = await submit(duty.id);
      const revisionId = data<{ id: string }>(created).id;
      const approved = await review(duty.id, revisionId, "approve");
      expect(approved.statusCode).toBe(200);
      const audit = data<{
        status: string;
        submittedBy: { id: string };
        reviewedBy: { id: string };
        submissionNote: string;
        reviewNote: string;
        reviewedAt: string;
        before: { startsAt: string };
        proposed: { startsAt: string };
      }>(approved);
      expect(audit).toMatchObject({
        status: "APPROVED",
        submittedBy: { id: adminId },
        reviewedBy: { id: adminId },
        submissionNote: "Correction du bulletin",
        reviewNote: "Revue documentée",
        before: { startsAt: START },
        proposed: { startsAt: PROPOSED_START },
      });
      expect(Date.parse(audit.reviewedAt)).toBeGreaterThan(0);
      const canonical = await prisma.dutyPeriod.findUniqueOrThrow({
        where: { id: duty.id },
      });
      expect(canonical.id).toBe(duty.id);
      expect(canonical.startsAt.toISOString()).toBe(PROPOSED_START);
      expect(canonical.sourceId).toBe(ids.otherSource);
      const list = await app.inject({
        method: "GET",
        url: `${revisionUrl(duty.id)}?page=1&pageSize=1`,
        headers: { cookie },
      });
      expect(list.json()).toMatchObject({
        data: [{ id: revisionId, status: "APPROVED" }],
        pagination: { total: 1, totalPages: 1 },
      });
      const publicList = await app.inject({
        method: "GET",
        url: "/api/v1/pharmacies",
      });
      expect(publicList.json()).toMatchObject({
        data: [],
        pagination: { total: 0 },
      });
    });

    it("rejects without changing publication, then permits a fresh revision and paginates honest history", async () => {
      const duty = await approvedDuty();
      const first = data<{ id: string }>(await submit(duty.id));
      const rejected = await review(duty.id, first.id, "reject");
      expect(rejected.statusCode).toBe(200);
      expect(rejected.json()).toMatchObject({
        data: { status: "REJECTED", reviewNote: "Revue documentée" },
      });
      expect(
        (
          await prisma.dutyPeriod.findUniqueOrThrow({ where: { id: duty.id } })
        ).startsAt.toISOString(),
      ).toBe(START);
      currentTime = new Date(at.getTime() + 1000);
      const second = await submit(duty.id);
      expect(second.statusCode).toBe(201);
      const page = await app.inject({
        method: "GET",
        url: `${revisionUrl(duty.id)}?page=1&pageSize=1`,
        headers: { cookie },
      });
      expect(page.json()).toMatchObject({
        pagination: { total: 2, totalPages: 2 },
        data: [{ status: "PENDING" }],
      });
      const olderPage = await app.inject({
        method: "GET",
        url: `${revisionUrl(duty.id)}?page=2&pageSize=1`,
        headers: { cookie },
      });
      expect(olderPage.json()).toMatchObject({
        data: [{ id: first.id, status: "REJECTED" }],
      });
    });

    it("does not synthesize a legacy approval actor, date or note", async () => {
      const duty = await approvedDuty();
      const history = await app.inject({
        method: "GET",
        url: revisionUrl(duty.id),
        headers: { cookie },
      });
      expect(history.json()).toEqual({
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      });
      const detail = await app.inject({
        method: "GET",
        url: `/api/v1/admin/duties/${duty.id}`,
        headers: { cookie },
      });
      expect(detail.json()).toMatchObject({ data: { id: duty.id } });
      expect(JSON.stringify(detail.json())).not.toMatch(
        /submittedBy|reviewedBy|reviewNote/,
      );
    });

    it("serializes two submissions and two approvals of the same revision", async () => {
      const duty = await approvedDuty();
      const submissions = await Promise.all([submit(duty.id), submit(duty.id)]);
      expect(submissions.map((result) => result.statusCode).sort()).toEqual([
        201, 409,
      ]);
      const revisionId = data<{ id: string }>(
        submissions.find((result) => result.statusCode === 201)!,
      ).id;
      const approvals = await Promise.all([
        review(duty.id, revisionId, "approve"),
        review(duty.id, revisionId, "approve"),
      ]);
      expect(approvals.map((result) => result.statusCode).sort()).toEqual([
        200, 409,
      ]);
      const current = await prisma.dutyPeriod.findUniqueOrThrow({
        where: { id: duty.id },
      });
      expect(current.startsAt.toISOString()).toBe(PROPOSED_START);
    });

    it("rejects a stale base version and leaves canonical publication and revision pending", async () => {
      const duty = await approvedDuty();
      const revisionId = data<{ id: string }>(await submit(duty.id)).id;
      await prisma.$executeRawUnsafe(
        "UPDATE DutyPeriod SET version = version + 1 WHERE id = ?",
        duty.id,
      );
      const result = await review(duty.id, revisionId, "approve");
      expect(result.statusCode).toBe(409);
      expect(
        (
          await prisma.dutyPeriod.findUniqueOrThrow({ where: { id: duty.id } })
        ).startsAt.toISOString(),
      ).toBe(START);
      const history = await app.inject({
        method: "GET",
        url: revisionUrl(duty.id),
        headers: { cookie },
      });
      expect(history.json()).toMatchObject({
        data: [{ id: revisionId, status: "PENDING" }],
      });
    });

    it("rechecks source, existing exceptions and overlapping APPROVED duties at approval, but permits adjacency", async () => {
      const duty = await approvedDuty();
      const revisionId = data<{ id: string }>(await submit(duty.id)).id;
      await prisma.dutyException.create({
        data: {
          dutyPeriodId: duty.id,
          kind: "CANCELLED",
          startsAt: new Date(START),
          endsAt: new Date("2026-09-16T09:00:00.000Z"),
        },
      });
      const outside = await review(duty.id, revisionId, "approve");
      expect(outside.statusCode).toBe(409);
      expect(
        (
          await prisma.dutyPeriod.findUniqueOrThrow({ where: { id: duty.id } })
        ).startsAt.toISOString(),
      ).toBe(START);
      await prisma.dutyException.deleteMany({
        where: { dutyPeriodId: duty.id },
      });
      await prisma.dutyPeriod.create({
        data: {
          pharmacyId: ids.pharmacy,
          startsAt: new Date(PROPOSED_END),
          endsAt: new Date("2026-09-17T04:00:00.000Z"),
          status: "APPROVED",
        },
      });
      expect((await review(duty.id, revisionId, "approve")).statusCode).toBe(
        200,
      );
    });

    it("rejects a newly overlapping duty or deleted proposed source without partial writes", async () => {
      const duty = await approvedDuty();
      const revisionId = data<{ id: string }>(await submit(duty.id)).id;
      const overlap = await prisma.dutyPeriod.create({
        data: {
          pharmacyId: ids.pharmacy,
          startsAt: new Date(END),
          endsAt: new Date("2026-09-17T01:00:00.000Z"),
          status: "APPROVED",
        },
      });
      expect((await review(duty.id, revisionId, "approve")).statusCode).toBe(
        409,
      );
      await prisma.dutyPeriod.delete({ where: { id: overlap.id } });
      await prisma.scheduleSource.delete({ where: { id: ids.otherSource } });
      expect((await review(duty.id, revisionId, "approve")).statusCode).toBe(
        409,
      );
      expect(
        (await prisma.dutyPeriod.findUniqueOrThrow({ where: { id: duty.id } }))
          .sourceId,
      ).toBe(ids.source);
    });

    it("validates strict payloads and protects GET and mutation routes with session/Origin", async () => {
      const duty = await approvedDuty();
      const url = revisionUrl(duty.id);
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/admin/duties/${duty.id}`,
          })
        ).statusCode,
      ).toBe(401);
      const unauth = await app.inject({
        method: "POST",
        url,
        headers: { origin: WEB_ORIGIN },
        payload: proposal(),
      });
      expect(errorCode(unauth)).toBe("AUTHENTICATION_REQUIRED");
      const wrongOrigin = await app.inject({
        method: "POST",
        url,
        headers: headers(cookie, "https://foreign.example"),
        payload: proposal(),
      });
      expect(wrongOrigin.statusCode).toBe(403);
      expect(errorCode(wrongOrigin)).toBe("ORIGIN_FORBIDDEN");
      for (const invalid of [
        { ...proposal(), pharmacyId: ids.pharmacy },
        { ...proposal(), note: " " },
        { ...proposal(), note: "x".repeat(501) },
        { ...proposal(), endsAt: PROPOSED_START },
      ]) {
        expect((await submit(duty.id, invalid)).statusCode).toBe(400);
      }
      expect(
        (
          await app.inject({
            method: "GET",
            url: `${url}?pageSize=51`,
            headers: { cookie },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/admin/duties/00000000-0000-4000-8000-000000007299`,
            headers: { cookie },
          })
        ).statusCode,
      ).toBe(404);
    });
  },
);
