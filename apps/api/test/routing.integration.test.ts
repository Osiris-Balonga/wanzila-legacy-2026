import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createPrismaClient,
  type ApiPrismaClient,
} from "../src/infrastructure/prisma.js";
import { registerRoutingRoutes } from "../src/modules/routing/routes.js";
import { getDisposableTestDatabaseUrl } from "./support/test-database.js";

const execFileAsync = promisify(execFile);
const testDatabaseUrl = getDisposableTestDatabaseUrl(process.env);
const disposableTestDatabaseUrl = testDatabaseUrl ?? "";
const ids = {
  published: "00000000-0000-4000-8000-000000009801",
  draft: "00000000-0000-4000-8000-000000009802",
};
const route = {
  code: "Ok",
  waypoints: [{ distance: 1 }, { distance: 2 }],
  routes: [
    {
      distance: 345,
      duration: 70,
      geometry: {
        type: "LineString",
        coordinates: [
          [15.2492, -4.2792],
          [15.2429, -4.2636],
        ],
      },
      legs: [
        {
          steps: [
            {
              distance: 345,
              duration: 70,
              name: "Avenue de la Paix",
              maneuver: { type: "depart", location: [15.2492, -4.2792] },
            },
          ],
        },
      ],
    },
  ],
};

describe.runIf(Boolean(testDatabaseUrl))(
  "routing with published pharmacies (MariaDB)",
  () => {
    let prisma: ApiPrismaClient;
    const app = fastify();
    const providerFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json(route)),
    );

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
      await prisma.pharmacy.deleteMany({
        where: { id: { in: Object.values(ids) } },
      });
      await prisma.pharmacy.createMany({
        data: [
          {
            id: ids.published,
            name: "Pharmacie publiée",
            address: "1 avenue",
            district: "Plateau",
            arrondissement: "Poto-Poto",
            latitude: "-4.2636000",
            longitude: "15.2429000",
            status: "PUBLISHED",
          },
          {
            id: ids.draft,
            name: "Pharmacie brouillon",
            address: "2 avenue",
            district: "Plateau",
            arrondissement: "Poto-Poto",
            latitude: "-4.2600000",
            longitude: "15.2400000",
            status: "DRAFT",
          },
        ],
      });
      registerRoutingRoutes(app, {
        prisma,
        fetch: providerFetch,
        nowMs: () => 5_000,
      });
    }, 60_000);

    afterAll(async () => {
      await app.close();
      if (prisma) {
        await prisma.pharmacy.deleteMany({
          where: { id: { in: Object.values(ids) } },
        });
        await prisma.$disconnect();
      }
    });

    it("routes only the published pharmacy and reads its database coordinates", async () => {
      const post = async (pharmacyId: string) =>
        await app.inject({
          method: "POST",
          url: "/routes",
          headers: { "content-type": "application/json" },
          payload: JSON.stringify({
            pharmacyId,
            origin: { latitude: -4.2792, longitude: 15.2492 },
            mode: "car",
            locationConsent: true,
          }),
        });
      expect((await post(ids.draft)).statusCode).toBe(404);
      expect(providerFetch).not.toHaveBeenCalled();
      expect((await post(ids.published)).statusCode).toBe(200);
      const requestUrl = providerFetch.mock.calls[0]?.[0];
      expect(requestUrl).toBeInstanceOf(URL);
      if (!(requestUrl instanceof URL))
        throw new Error("Expected provider URL");
      expect(requestUrl.pathname).toContain("15.2429,-4.2636");
    });
  },
);
