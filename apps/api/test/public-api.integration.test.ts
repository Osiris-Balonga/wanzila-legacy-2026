import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  apiErrorSchema,
  emergencyContactsResponseSchema,
  pharmacyDetailResponseSchema,
  pharmacyListResponseSchema,
} from "@wanzila/contracts";
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
const NOW = new Date("2026-09-14T12:00:00.000Z");
const workspaceRoot = resolve(import.meta.dirname, "../../..");

const ids = {
  alpha: "00000000-0000-4000-8000-000000001001",
  centrale: "00000000-0000-4000-8000-000000001002",
  nord: "00000000-0000-4000-8000-000000001003",
  draft: "00000000-0000-4000-8000-000000001004",
  archived: "00000000-0000-4000-8000-000000001005",
  pending: "00000000-0000-4000-8000-000000001006",
  rejected: "00000000-0000-4000-8000-000000001007",
  future: "00000000-0000-4000-8000-000000001008",
  expired: "00000000-0000-4000-8000-000000001009",
  exception: "00000000-0000-4000-8000-000000001010",
  inactive: "00000000-0000-4000-8000-000000001011",
  freshSource: "00000000-0000-4000-8000-000000001101",
  staleSource: "00000000-0000-4000-8000-000000001102",
  alphaDuty: "00000000-0000-4000-8000-000000001201",
  exceptionDuty: "00000000-0000-4000-8000-000000001202",
  exceptionRecord: "00000000-0000-4000-8000-000000001301",
  emergencyFirst: "00000000-0000-4000-8000-000000001401",
  emergencySecond: "00000000-0000-4000-8000-000000001402",
  emergencyDraft: "00000000-0000-4000-8000-000000001403",
} as const;

function currentDuty(overrides: {
  id: string;
  pharmacyId: string;
  sourceId?: string | null;
  status?: "APPROVED" | "PENDING" | "REJECTED";
  startsAt?: Date;
  endsAt?: Date;
}) {
  return {
    id: overrides.id,
    pharmacyId: overrides.pharmacyId,
    sourceId: overrides.sourceId ?? null,
    status: overrides.status ?? "APPROVED",
    startsAt: overrides.startsAt ?? new Date("2026-09-14T08:00:00.000Z"),
    endsAt: overrides.endsAt ?? new Date("2026-09-14T20:00:00.000Z"),
  };
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
}

async function createFixtures(prisma: ApiPrismaClient): Promise<void> {
  await prisma.scheduleSource.createMany({
    data: [
      {
        id: ids.freshSource,
        name: "Bulletin de garde municipal",
        observedAt: new Date("2026-09-14T11:30:00.000Z"),
      },
      {
        id: ids.staleSource,
        name: "Bulletin archiv\u00e9",
        observedAt: new Date("2026-09-13T00:00:00.000Z"),
      },
    ],
  });
  await prisma.pharmacy.createMany({
    data: [
      {
        id: ids.alpha,
        name: "Pharmacie Alpha",
        phone: "+242060001001",
        address: "1 avenue de la Paix",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2637080",
        longitude: "15.2428850",
        status: "PUBLISHED",
      },
      {
        id: ids.centrale,
        name: "Pharmacie Centrale",
        phone: "+242060001002",
        address: "2 avenue de la Paix",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2637000",
        longitude: "15.2428000",
        status: "PUBLISHED",
      },
      {
        id: ids.nord,
        name: "Pharmacie Nord",
        address: "3 avenue du Nord",
        district: "Plateau",
        arrondissement: "Moungali",
        latitude: "-4.2600000",
        longitude: "15.2400000",
        status: "PUBLISHED",
      },
      {
        id: ids.draft,
        name: "Pharmacie Brouillon",
        address: "4 avenue",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2610000",
        longitude: "15.2410000",
        status: "DRAFT",
      },
      {
        id: ids.archived,
        name: "Pharmacie Archive",
        address: "5 avenue",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2620000",
        longitude: "15.2410000",
        status: "ARCHIVED",
      },
      {
        id: ids.pending,
        name: "Pharmacie En attente",
        address: "6 avenue",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2640000",
        longitude: "15.2410000",
        status: "PUBLISHED",
      },
      {
        id: ids.rejected,
        name: "Pharmacie Rejet\u00e9e",
        address: "7 avenue",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2650000",
        longitude: "15.2410000",
        status: "PUBLISHED",
      },
      {
        id: ids.future,
        name: "Pharmacie Future",
        address: "8 avenue",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2660000",
        longitude: "15.2410000",
        status: "PUBLISHED",
      },
      {
        id: ids.expired,
        name: "Pharmacie Expir\u00e9e",
        address: "9 avenue",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2670000",
        longitude: "15.2410000",
        status: "PUBLISHED",
      },
      {
        id: ids.exception,
        name: "Pharmacie Exception",
        address: "10 avenue",
        district: "Plateau",
        arrondissement: "Poto-Poto",
        latitude: "-4.2680000",
        longitude: "15.2410000",
        status: "PUBLISHED",
      },
      {
        id: ids.inactive,
        name: "Pharmacie Sans garde",
        address: "11 avenue",
        district: "Bacongo",
        arrondissement: "Bacongo",
        latitude: "-4.2690000",
        longitude: "15.2410000",
        status: "PUBLISHED",
      },
    ],
  });
  await prisma.dutyPeriod.createMany({
    data: [
      currentDuty({
        id: ids.alphaDuty,
        pharmacyId: ids.alpha,
        sourceId: ids.freshSource,
      }),
      currentDuty({
        id: "00000000-0000-4000-8000-000000001203",
        pharmacyId: ids.centrale,
        sourceId: ids.staleSource,
      }),
      currentDuty({
        id: "00000000-0000-4000-8000-000000001204",
        pharmacyId: ids.nord,
      }),
      currentDuty({
        id: "00000000-0000-4000-8000-000000001205",
        pharmacyId: ids.draft,
      }),
      currentDuty({
        id: "00000000-0000-4000-8000-000000001206",
        pharmacyId: ids.archived,
      }),
      currentDuty({
        id: "00000000-0000-4000-8000-000000001207",
        pharmacyId: ids.pending,
        status: "PENDING",
      }),
      currentDuty({
        id: "00000000-0000-4000-8000-000000001208",
        pharmacyId: ids.rejected,
        status: "REJECTED",
      }),
      currentDuty({
        id: "00000000-0000-4000-8000-000000001209",
        pharmacyId: ids.future,
        startsAt: new Date("2026-09-14T20:00:00.000Z"),
        endsAt: new Date("2026-09-15T08:00:00.000Z"),
      }),
      currentDuty({
        id: "00000000-0000-4000-8000-000000001210",
        pharmacyId: ids.expired,
        startsAt: new Date("2026-09-13T20:00:00.000Z"),
        endsAt: new Date("2026-09-14T08:00:00.000Z"),
      }),
      currentDuty({
        id: ids.exceptionDuty,
        pharmacyId: ids.exception,
        sourceId: ids.freshSource,
      }),
    ],
  });
  await prisma.dutyException.create({
    data: {
      id: ids.exceptionRecord,
      dutyPeriodId: ids.exceptionDuty,
      kind: "UNAVAILABLE",
      startsAt: new Date("2026-09-14T10:00:00.000Z"),
      endsAt: new Date("2026-09-14T15:00:00.000Z"),
    },
  });
  await prisma.emergencyContact.createMany({
    data: [
      {
        id: ids.emergencySecond,
        label: "Pompiers",
        phone: "118",
        position: 2,
        status: "PUBLISHED",
      },
      {
        id: ids.emergencyFirst,
        label: "SAMU",
        phone: "112",
        position: 1,
        status: "PUBLISHED",
      },
      {
        id: ids.emergencyDraft,
        label: "Interne",
        phone: "000",
        position: 0,
        status: "DRAFT",
      },
    ],
  });
}

describe.runIf(runMariaDbTests)("public pharmacy API (MariaDB)", () => {
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
    await clearFixtures(prisma);
    await createFixtures(prisma);
    app = await createApp({
      webOrigin: "http://localhost:5173",
      prisma,
      now: () => NOW,
      sourceFreshnessMaxAgeMs: 60 * 60 * 1000,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("searches and combines district and arrondissement filters", async () => {
    const search = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies?q=Centrale",
    });
    const searchResponse = pharmacyListResponseSchema.parse(search.json());
    expect(searchResponse.data.map((pharmacy) => pharmacy.name)).toEqual([
      "Pharmacie Centrale",
    ]);

    const district = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies?district=Plateau",
    });
    const districtResponse = pharmacyListResponseSchema.parse(district.json());
    expect(districtResponse.data.map((pharmacy) => pharmacy.name)).toEqual([
      "Pharmacie Alpha",
      "Pharmacie Centrale",
      "Pharmacie Nord",
    ]);

    const combined = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies?q=Pharmacie&district=Plateau&arrondissement=Poto-Poto",
    });
    const combinedResponse = pharmacyListResponseSchema.parse(combined.json());
    expect(combinedResponse.data.map((pharmacy) => pharmacy.name)).toEqual([
      "Pharmacie Alpha",
      "Pharmacie Centrale",
    ]);
  });

  it("paginates in stable name and ID order", async () => {
    const first = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies?page=1&pageSize=2",
    });
    expect(pharmacyListResponseSchema.parse(first.json())).toMatchObject({
      pagination: { page: 1, pageSize: 2, total: 3, totalPages: 2 },
      data: [{ name: "Pharmacie Alpha" }, { name: "Pharmacie Centrale" }],
    });

    const second = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies?page=2&pageSize=2",
    });
    expect(pharmacyListResponseSchema.parse(second.json())).toMatchObject({
      data: [{ name: "Pharmacie Nord" }],
    });
  });

  it("excludes unpublished, non-active, unapproved, temporal, and exception-overridden duties", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies",
    });
    expect(response.statusCode).toBe(200);
    const pharmacyResponse = pharmacyListResponseSchema.parse(response.json());
    expect(pharmacyResponse.data.map((pharmacy) => pharmacy.id)).toEqual([
      ids.alpha,
      ids.centrale,
      ids.nord,
    ]);
  });

  it("exposes source freshness without inventing absent optional values", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies?pageSize=50",
    });
    const pharmacies = pharmacyListResponseSchema.parse(response.json()).data;
    const alpha = pharmacies.find((pharmacy) => pharmacy.id === ids.alpha);
    const centrale = pharmacies.find(
      (pharmacy) => pharmacy.id === ids.centrale,
    );
    const nord = pharmacies.find((pharmacy) => pharmacy.id === ids.nord);

    if (!alpha || !centrale || !nord) {
      throw new Error("Expected all active pharmacy fixtures in the response.");
    }

    expect(alpha.currentDuty).toMatchObject({
      sourceFreshness: "FRESH",
      source: {
        name: "Bulletin de garde municipal",
        observedAt: "2026-09-14T11:30:00.000Z",
      },
    });
    expect(centrale.currentDuty.sourceFreshness).toBe("STALE");
    expect(nord.phone).toBeUndefined();
    expect(nord.currentDuty.sourceFreshness).toBe("UNKNOWN");
    expect(nord.currentDuty.source).toBeUndefined();
  });

  it("returns published pharmacy details and omits a missing current duty", async () => {
    const found = await app.inject({
      method: "GET",
      url: `/api/v1/pharmacies/${ids.alpha}`,
    });
    expect(found.statusCode).toBe(200);
    expect(pharmacyDetailResponseSchema.parse(found.json())).toMatchObject({
      data: {
        id: ids.alpha,
        address: {
          line: "1 avenue de la Paix",
          district: "Plateau",
          arrondissement: "Poto-Poto",
        },
        coordinates: { latitude: -4.263708, longitude: 15.242885 },
        currentDuty: { state: "ACTIVE", startsAt: "2026-09-14T08:00:00.000Z" },
      },
    });

    const inactive = await app.inject({
      method: "GET",
      url: `/api/v1/pharmacies/${ids.inactive}`,
    });
    expect(inactive.statusCode).toBe(200);
    expect(
      pharmacyDetailResponseSchema.parse(inactive.json()).data.currentDuty,
    ).toBeUndefined();
  });

  it("normalizes invalid requests and distinguishes an absent valid ID", async () => {
    const invalidQuery = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies?pageSize=51",
    });
    expect(invalidQuery.statusCode).toBe(400);
    expect(apiErrorSchema.parse(invalidQuery.json())).toEqual({
      error: { code: "BAD_REQUEST", message: "Invalid request parameters" },
    });

    const unknownQuery = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies?unexpected=value",
    });
    expect(unknownQuery.statusCode).toBe(400);
    expect(apiErrorSchema.parse(unknownQuery.json()).error.code).toBe(
      "BAD_REQUEST",
    );

    const invalidId = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies/not-an-id",
    });
    expect(invalidId.statusCode).toBe(400);
    expect(apiErrorSchema.parse(invalidId.json()).error.code).toBe(
      "BAD_REQUEST",
    );

    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/pharmacies/00000000-0000-4000-8000-000000009999",
    });
    expect(missing.statusCode).toBe(404);
    expect(apiErrorSchema.parse(missing.json())).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });

    const missingRoute = await app.inject({
      method: "GET",
      url: "/api/v1/unknown",
    });
    expect(missingRoute.statusCode).toBe(404);
    expect(apiErrorSchema.parse(missingRoute.json())).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
  });

  it("publishes emergency contacts in deterministic position order", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/emergency-contacts",
    });
    expect(response.statusCode).toBe(200);
    expect(emergencyContactsResponseSchema.parse(response.json())).toEqual({
      data: [
        {
          id: ids.emergencyFirst,
          label: "SAMU",
          phone: "112",
          position: 1,
          updatedAt: expect.any(String) as unknown as string,
        },
        {
          id: ids.emergencySecond,
          label: "Pompiers",
          phone: "118",
          position: 2,
          updatedAt: expect.any(String) as unknown as string,
        },
      ],
    });
  });
});
