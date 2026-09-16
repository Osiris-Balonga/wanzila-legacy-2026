import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { emergencyContactsResponseSchema } from "@wanzila/contracts";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  createPrismaClient,
  type ApiPrismaClient,
} from "../src/infrastructure/prisma.js";
import { getDisposableTestDatabaseUrl } from "./support/test-database.js";

const execFileAsync = promisify(execFile);
const testDatabaseUrl = getDisposableTestDatabaseUrl(process.env);
const disposableTestDatabaseUrl = testDatabaseUrl ?? "";
const runMariaDbTests = Boolean(testDatabaseUrl);
const workspaceRoot = resolve(import.meta.dirname, "../../..");

const ids = {
  first: "00000000-0000-4000-8000-000000001410",
  samePositionEarlierId: "00000000-0000-4000-8000-000000001411",
  samePositionLaterId: "00000000-0000-4000-8000-000000001412",
  draft: "00000000-0000-4000-8000-000000001413",
  archived: "00000000-0000-4000-8000-000000001414",
} as const;

const timestamps = {
  first: new Date("2026-09-10T07:08:09.010Z"),
  samePositionEarlierId: new Date("2026-09-11T07:08:09.011Z"),
  samePositionLaterId: new Date("2026-09-12T07:08:09.012Z"),
} as const;

async function seedEmergencyContacts(prisma: ApiPrismaClient): Promise<void> {
  await prisma.emergencyContact.deleteMany();
  await prisma.emergencyContact.createMany({
    data: [
      {
        id: ids.samePositionLaterId,
        label: "Pompiers Nord",
        phone: "118",
        position: 2,
        status: "PUBLISHED",
        updatedAt: timestamps.samePositionLaterId,
      },
      {
        id: ids.archived,
        label: "Archives internes",
        phone: "000",
        position: 0,
        status: "ARCHIVED",
        updatedAt: new Date("2026-09-13T07:08:09.013Z"),
      },
      {
        id: ids.first,
        label: "SAMU",
        phone: "112",
        position: 1,
        status: "PUBLISHED",
        updatedAt: timestamps.first,
      },
      {
        id: ids.draft,
        label: "Brouillon interne",
        phone: "111",
        position: 0,
        status: "DRAFT",
        updatedAt: new Date("2026-09-14T07:08:09.014Z"),
      },
      {
        id: ids.samePositionEarlierId,
        label: "Pompiers Centre",
        phone: "118",
        position: 2,
        status: "PUBLISHED",
        updatedAt: timestamps.samePositionEarlierId,
      },
    ],
  });
}

describe.runIf(runMariaDbTests)(
  "issue #12 public emergency contacts (guarded MariaDB)",
  () => {
    let prisma: ApiPrismaClient;
    let app: Awaited<ReturnType<typeof createApp>>;

    beforeAll(async () => {
      const command = "pnpm --filter @wanzila/api db:migrate";
      await execFileAsync(
        process.platform === "win32" ? "cmd.exe" : "sh",
        process.platform === "win32"
          ? ["/d", "/s", "/c", command]
          : ["-c", command],
        {
          cwd: workspaceRoot,
          env: { ...process.env, DATABASE_URL: disposableTestDatabaseUrl },
        },
      );
    }, 60_000);

    beforeEach(async () => {
      prisma = createPrismaClient(disposableTestDatabaseUrl);
      await seedEmergencyContacts(prisma);
      app = await createApp({
        webOrigin: "http://localhost:5173",
        prisma,
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it("returns only PUBLISHED contacts in position then ID order with their exact persistent timestamps", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/emergency-contacts",
      });

      expect(response.statusCode).toBe(200);
      expect(emergencyContactsResponseSchema.parse(response.json())).toEqual({
        data: [
          {
            id: ids.first,
            label: "SAMU",
            phone: "112",
            position: 1,
            updatedAt: timestamps.first.toISOString(),
          },
          {
            id: ids.samePositionEarlierId,
            label: "Pompiers Centre",
            phone: "118",
            position: 2,
            updatedAt: timestamps.samePositionEarlierId.toISOString(),
          },
          {
            id: ids.samePositionLaterId,
            label: "Pompiers Nord",
            phone: "118",
            position: 2,
            updatedAt: timestamps.samePositionLaterId.toISOString(),
          },
        ],
      });
    });
  },
);
