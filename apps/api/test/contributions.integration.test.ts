import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import {
  adminContributionListResponseSchema,
  adminContributionResponseSchema,
} from "@wanzila/contracts";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  createPrismaClient,
  type ApiPrismaClient,
} from "../src/infrastructure/prisma.js";
import { runContributionRetention } from "../src/modules/contributions/retention.js";
import { getDisposableTestDatabaseUrl } from "./support/test-database.js";
import { WEB_ORIGIN, workspaceRoot } from "./support/admin-auth-fixtures.js";

const execFileAsync = promisify(execFile);
const databaseUrl = getDisposableTestDatabaseUrl(process.env);
const NOW = new Date("2026-09-17T12:00:00.000Z");
const ADMIN_ID = "00000000-0000-4000-8000-000000004101";
const SESSION_ID = "00000000-0000-4000-8000-000000004102";
const TOKEN = "contribution-test-session";
const COOKIE = `wanzila_admin_session=${TOKEN}`;
const input = {
  submissionId: "00000000-0000-4000-8000-000000004103",
  name: "Pharmacie Exemple",
  address: {
    line: "10 avenue Test",
    district: "Centre",
    arrondissement: "Poto-Poto",
  },
  note: "Note de contrôle",
};

describe.runIf(Boolean(databaseUrl))(
  "public contribution and admin review (MariaDB)",
  () => {
    let prisma: ApiPrismaClient;
    let app: Awaited<ReturnType<typeof createApp>>;

    beforeAll(async () => {
      const shell =
        process.platform === "win32"
          ? {
              file: "cmd.exe",
              args: ["/d", "/s", "/c", "pnpm --filter @wanzila/api db:migrate"],
            }
          : {
              file: "sh",
              args: ["-c", "pnpm --filter @wanzila/api db:migrate"],
            };
      await execFileAsync(shell.file, shell.args, {
        cwd: workspaceRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl! },
      });
    }, 60_000);

    beforeEach(async () => {
      prisma = createPrismaClient(databaseUrl!);
      await prisma.dutyException.deleteMany();
      await prisma.dutyRevision.deleteMany();
      await prisma.dutyPeriod.deleteMany();
      await prisma.report.deleteMany();
      await prisma.analyticsEvent.deleteMany();
      await prisma.emergencyContact.deleteMany();
      await prisma.scheduleSource.deleteMany();
      await prisma.contribution.deleteMany();
      await prisma.pharmacy.deleteMany();
      await prisma.adminSession.deleteMany();
      await prisma.adminUser.deleteMany();
      await prisma.adminUser.create({
        data: {
          id: ADMIN_ID,
          email: "reviewer@wanzila.test",
          passwordHash: "unused",
          displayName: "Relectrice",
        },
      });
      await prisma.adminSession.create({
        data: {
          id: SESSION_ID,
          adminUserId: ADMIN_ID,
          tokenDigest: createHash("sha256").update(TOKEN).digest("hex"),
          expiresAt: new Date("2026-09-18T12:00:00.000Z"),
        },
      });
      app = await createApp({
        prisma,
        now: () => NOW,
        webOrigin: WEB_ORIGIN,
        nodeEnvironment: "test",
      });
    });

    afterEach(async () => {
      await app.close();
    });

    const adminHeaders = { cookie: COOKIE, origin: WEB_ORIGIN };
    async function submit(
      app: Awaited<ReturnType<typeof createApp>>,
      payload: object = input,
    ) {
      return app.inject({
        method: "POST",
        url: "/api/v1/contributions",
        payload,
      });
    }

    it("accepts address-only once, keeps it private, and requires coordinates before approval", async () => {
      expect((await submit(app)).statusCode).toBe(202);
      expect((await submit(app)).statusCode).toBe(202);
      expect(await prisma.contribution.count()).toBe(1);
      expect(
        (await submit(app, { ...input, name: "Changed" })).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/v1/admin/contributions",
          })
        ).statusCode,
      ).toBe(401);
      const list = await app.inject({
        method: "GET",
        url: "/api/v1/admin/contributions?status=PENDING",
        headers: adminHeaders,
      });
      expect(list.statusCode).toBe(200);
      const contribution = adminContributionListResponseSchema.parse(
        list.json(),
      ).data[0]!;
      expect(contribution).toMatchObject({
        name: input.name,
        status: "PENDING",
        coordinates: null,
        version: 0,
      });
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/admin/contributions/${contribution.id}/approve`,
            headers: adminHeaders,
            payload: { expectedVersion: 0, reason: "Adresse vérifiée" },
          })
        ).statusCode,
      ).toBe(409);
      expect(await prisma.pharmacy.count()).toBe(0);
    });

    it("audits correction, approves only into DRAFT, and rejects a second decision", async () => {
      await submit(app);
      const id = (await prisma.contribution.findFirstOrThrow()).id;
      const correction = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/contributions/${id}`,
        headers: adminHeaders,
        payload: {
          expectedVersion: 0,
          reason: "Position vérifiée",
          coordinates: { latitude: -4.26, longitude: 15.24 },
        },
      });
      expect(correction.statusCode).toBe(200);
      expect(
        adminContributionResponseSchema.parse(correction.json()).data,
      ).toMatchObject({
        version: 1,
        corrections: [{ version: 1, correctedByName: "Relectrice" }],
      });
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/api/v1/admin/contributions/${id}`,
            headers: adminHeaders,
            payload: { expectedVersion: 0, reason: "Périmé", name: "Autre" },
          })
        ).statusCode,
      ).toBe(409);
      const approval = await app.inject({
        method: "POST",
        url: `/api/v1/admin/contributions/${id}/approve`,
        headers: adminHeaders,
        payload: { expectedVersion: 1, reason: "Données contrôlées" },
      });
      expect(approval.statusCode).toBe(200);
      expect(
        adminContributionResponseSchema.parse(approval.json()).data,
      ).toMatchObject({
        status: "APPROVED",
        version: 2,
        reviewedByName: "Relectrice",
      });
      expect((await prisma.pharmacy.findFirstOrThrow()).status).toBe("DRAFT");
      const publicList = await app.inject({
        method: "GET",
        url: "/api/v1/pharmacies?q=Exemple",
      });
      expect(publicList.statusCode).toBe(200);
      expect(publicList.json()).toMatchObject({ data: [] });
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/admin/contributions/${id}/reject`,
            headers: adminHeaders,
            payload: { expectedVersion: 2, reason: "Trop tard" },
          })
        ).statusCode,
      ).toBe(409);
      expect(await prisma.pharmacy.count()).toBe(1);
    });

    it("blocks an exact pharmacy match and requires a conscious decision for proximity", async () => {
      await prisma.pharmacy.create({
        data: {
          name: input.name,
          address: input.address.line,
          district: input.address.district,
          arrondissement: input.address.arrondissement,
          latitude: -4.26,
          longitude: 15.24,
          status: "PUBLISHED",
        },
      });
      await submit(app, {
        ...input,
        coordinates: { latitude: -4.2601, longitude: 15.2401 },
      });
      const id = (await prisma.contribution.findFirstOrThrow()).id;
      const details = await app.inject({
        method: "GET",
        url: `/api/v1/admin/contributions/${id}`,
        headers: adminHeaders,
      });
      expect(
        adminContributionResponseSchema.parse(details.json()).data.duplicates,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "EXACT_NAME_ADDRESS",
            target: "PHARMACY",
          }),
          expect.objectContaining({ kind: "NEARBY", target: "PHARMACY" }),
        ]),
      );
      const decision = {
        expectedVersion: 0,
        reason: "Vérification effectuée",
        confirmPossibleDuplicate: true,
      };
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/admin/contributions/${id}/approve`,
            headers: adminHeaders,
            payload: decision,
          })
        ).statusCode,
      ).toBe(409);
      const corrected = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/contributions/${id}`,
        headers: adminHeaders,
        payload: {
          expectedVersion: 0,
          reason: "Adresse distincte confirmée",
          address: { ...input.address, line: "12 avenue Test" },
        },
      });
      expect(corrected.statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/admin/contributions/${id}/approve`,
            headers: adminHeaders,
            payload: {
              ...decision,
              expectedVersion: 1,
              confirmPossibleDuplicate: false,
            },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/admin/contributions/${id}/approve`,
            headers: adminHeaders,
            payload: { ...decision, expectedVersion: 1 },
          })
        ).statusCode,
      ).toBe(200);
      expect(await prisma.pharmacy.count()).toBe(2);
    });

    it("validates input, enforces origin and a five-per-hour submission limit", async () => {
      expect(
        (
          await submit(app, {
            ...input,
            address: { ...input.address, line: "" },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await submit(app, {
            ...input,
            coordinates: { latitude: 200, longitude: 15 },
          })
        ).statusCode,
      ).toBe(400);
      for (let n = 0; n < 3; n++)
        await submit(app, {
          ...input,
          submissionId: `00000000-0000-4000-8000-00000000410${n}`,
        });
      expect(
        (
          await submit(app, {
            ...input,
            submissionId: "00000000-0000-4000-8000-000000004109",
          })
        ).statusCode,
      ).toBe(429);
      const id = (await prisma.contribution.findFirstOrThrow()).id;
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/admin/contributions/${id}/reject`,
            headers: { cookie: COOKIE, origin: "https://wrong.example" },
            payload: { expectedVersion: 0, reason: "No" },
          })
        ).statusCode,
      ).toBe(403);
    });

    it("scrubs notes and removes rejected records after 90 days", async () => {
      await submit(app);
      const id = (await prisma.contribution.findFirstOrThrow()).id;
      await prisma.contribution.update({
        where: { id },
        data: { createdAt: new Date("2026-06-01T00:00:00.000Z") },
      });
      await runContributionRetention(prisma, NOW);
      const scrubbed = await prisma.contribution.findUniqueOrThrow({
        where: { id },
      });
      expect(scrubbed.note).toBeNull();
      expect(scrubbed.original).toMatchObject({ note: null });
      await prisma.contribution.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      });
      await runContributionRetention(prisma, NOW);
      expect(await prisma.contribution.count()).toBe(0);
    });
  },
);
