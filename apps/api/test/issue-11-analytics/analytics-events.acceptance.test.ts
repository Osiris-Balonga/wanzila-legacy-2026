import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/app.js";
import type { ApiPrismaClient } from "../../src/infrastructure/prisma.js";
import { getDisposableTestDatabaseUrl } from "../support/test-database.js";

const execFileAsync = promisify(execFile);
const testDatabaseUrl = getDisposableTestDatabaseUrl(process.env);
const runMariaDbTests = Boolean(testDatabaseUrl);
const disposableTestDatabaseUrl = testDatabaseUrl ?? "";
const workspaceRoot = resolve(import.meta.dirname, "../../../..");

const NOW = new Date("2026-09-15T12:00:00.000Z");
const SESSION_ID = "00000000-0000-4000-8000-000000001111";
const PHARMACY_ID = "00000000-0000-4000-8000-000000002222";
const ANALYTICS_PATH = "/api/v1/analytics/events";
const ANALYTICS_BODY_LIMIT_BYTES = 16 * 1024;
const ANALYTICS_RATE_LIMIT = 2;
const retentionModule = "../../src/modules/analytics/retention.js";

const acceptedResponseSchema = z
  .object({
    data: z
      .object({ id: z.uuid(), receivedAt: z.string().datetime() })
      .strict(),
  })
  .strict();
const badRequestResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("BAD_REQUEST"),
        message: z.literal("Invalid analytics event"),
      })
      .strict(),
  })
  .strict();
const payloadTooLargeResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("PAYLOAD_TOO_LARGE"),
        message: z.literal("Analytics payload too large"),
      })
      .strict(),
  })
  .strict();
const rateLimitedResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("RATE_LIMITED"),
        message: z.literal("Too many analytics events"),
      })
      .strict(),
  })
  .strict();
const healthResponseSchema = z
  .object({ status: z.literal("ok"), service: z.literal("wanzila-api") })
  .strict();
const publicProbeResponseSchema = z
  .object({ status: z.literal("ok") })
  .strict();

type AnalyticsEventName =
  | "discovery_viewed"
  | "search_submitted"
  | "filters_applied"
  | "empty_results_shown"
  | "pharmacy_detail_viewed"
  | "pharmacy_call_started"
  | "route_started"
  | "arrival_confirmed"
  | "discovery_failed";

type AnalyticsEnvelope = {
  schemaVersion: 1;
  name: AnalyticsEventName;
  sessionId: string;
  properties: Record<string, unknown>;
};

type StoredEvent = {
  id: string;
  name: string;
  sessionId: string;
  pharmacyId: string | null;
  properties: Record<string, unknown>;
  occurredAt: Date;
};

type RetentionCommand = (options: {
  prisma: ApiPrismaClient;
  now: () => Date;
}) => Promise<void>;

function event(
  name: AnalyticsEventName,
  properties: Record<string, unknown>,
): AnalyticsEnvelope {
  return {
    schemaVersion: 1,
    name,
    sessionId: SESSION_ID,
    properties,
  };
}

function expectedStoredEvent(
  payload: AnalyticsEnvelope,
): Omit<StoredEvent, "id"> {
  const { pharmacyId, ...properties } = payload.properties;
  return {
    name: payload.name,
    sessionId: payload.sessionId,
    pharmacyId: typeof pharmacyId === "string" ? pharmacyId : null,
    properties,
    occurredAt: NOW,
  };
}

function acceptedResponse(response: unknown) {
  const parsed = acceptedResponseSchema.parse(response);
  expect(parsed.data.receivedAt).toBe(NOW.toISOString());
  return parsed;
}

function isRetentionModule(
  candidate: unknown,
): candidate is { cleanupExpiredAnalyticsEvents: RetentionCommand } {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "cleanupExpiredAnalyticsEvents" in candidate &&
    typeof candidate.cleanupExpiredAnalyticsEvents === "function"
  );
}

async function loadRetentionCommand(): Promise<RetentionCommand> {
  const candidate: unknown = await import(/* @vite-ignore */ retentionModule);
  if (!isRetentionModule(candidate)) {
    throw new Error("Analytics retention command is unavailable.");
  }
  return candidate.cleanupExpiredAnalyticsEvents;
}

const validEvents: readonly AnalyticsEnvelope[] = [
  event("discovery_viewed", {}),
  event("search_submitted", { queryLength: 12 }),
  event("filters_applied", {
    district: "Plateau",
    arrondissement: "Poto-Poto",
  }),
  event("empty_results_shown", { queryLength: 12, resultCount: 0 }),
  event("pharmacy_detail_viewed", { pharmacyId: PHARMACY_ID }),
  event("pharmacy_call_started", { pharmacyId: PHARMACY_ID }),
  event("route_started", { pharmacyId: PHARMACY_ID }),
  event("arrival_confirmed", { pharmacyId: PHARMACY_ID }),
  event("discovery_failed", { code: "NETWORK_ERROR" }),
];

class AnalyticsPrismaStub {
  readonly stored: StoredEvent[] = [];
  readonly cleanupCalls: unknown[] = [];
  private nextId = 1;

  readonly analyticsEvent = {
    create: (argument: unknown) => {
      const data = (argument as { data: Omit<StoredEvent, "id"> }).data;
      const stored: StoredEvent = {
        id: `00000000-0000-4000-8000-${String(this.nextId).padStart(12, "0")}`,
        ...data,
      };
      this.nextId += 1;
      this.stored.push(stored);
      return Promise.resolve(stored);
    },
    deleteMany: (argument: unknown) => {
      this.cleanupCalls.push(argument);
      const cutoff = (argument as { where?: { occurredAt?: { lt?: Date } } })
        .where?.occurredAt?.lt;
      if (!cutoff) {
        return Promise.resolve({ count: 0 });
      }
      const retained = this.stored.filter(
        (storedEvent) => storedEvent.occurredAt >= cutoff,
      );
      const count = this.stored.length - retained.length;
      this.stored.splice(0, this.stored.length, ...retained);
      return Promise.resolve({ count });
    },
  };

  readonly routeAttempt = {
    deleteMany: () => Promise.resolve({ count: 0 }),
  };

  async $disconnect(): Promise<void> {}

  asPrisma(): ApiPrismaClient {
    return this as unknown as ApiPrismaClient;
  }
}

describe("issue #11 analytics event ingestion contract", () => {
  const applications: Awaited<ReturnType<typeof createApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
  });

  async function createAnalyticsApp(options?: {
    analyticsRateLimitMax?: number;
    rateLimitMax?: number;
  }) {
    const prisma = new AnalyticsPrismaStub();
    const appOptions: Parameters<typeof createApp>[0] & {
      analyticsRateLimitMax?: number;
    } = {
      webOrigin: "http://localhost:5173",
      now: () => NOW,
      prisma: prisma.asPrisma(),
      rateLimitMax: options?.rateLimitMax ?? 120,
    };
    if (options?.analyticsRateLimitMax !== undefined) {
      appOptions.analyticsRateLimitMax = options.analyticsRateLimitMax;
    }
    const app = await createApp(appOptions);
    applications.push(app);
    return { app, prisma };
  }

  it.each(validEvents)(
    "accepts and normalizes the versioned %s event",
    async (payload) => {
      const { app, prisma } = await createAnalyticsApp();

      const response = await app.inject({
        method: "POST",
        url: ANALYTICS_PATH,
        payload,
      });

      expect(response.statusCode).toBe(202);
      const accepted = acceptedResponse(response.json());
      expect(prisma.stored).toHaveLength(1);
      const [stored] = prisma.stored;
      expect(stored).toMatchObject(expectedStoredEvent(payload));
      expect(stored?.id).toBe(accepted.data.id);
      expect(stored?.occurredAt.toISOString()).toBe(accepted.data.receivedAt);
    },
  );

  it.each([
    {
      label: "an unknown event name",
      payload: { ...event("discovery_viewed", {}), name: "profile_created" },
    },
    {
      label: "an unknown envelope key",
      payload: { ...event("discovery_viewed", {}), userId: "not-allowed" },
    },
    {
      label: "an unsupported schema version",
      payload: { ...event("discovery_viewed", {}), schemaVersion: 2 },
    },
    {
      label: "an unknown event property",
      payload: event("discovery_viewed", { referrer: "https://example.test" }),
    },
    {
      label: "raw search text",
      payload: event("search_submitted", {
        queryLength: 12,
        query: "paracetamol for a named person",
      }),
    },
    {
      label: "exact coordinates",
      payload: event("route_started", {
        pharmacyId: PHARMACY_ID,
        latitude: -4.263708,
        longitude: 15.242885,
      }),
    },
    {
      label: "a route trace",
      payload: event("route_started", {
        pharmacyId: PHARMACY_ID,
        routePoints: [
          { latitude: -4.263708, longitude: 15.242885 },
          { latitude: -4.2637, longitude: 15.2428 },
        ],
      }),
    },
    {
      label: "an oversized administrative filter",
      payload: event("filters_applied", { district: "x".repeat(121) }),
    },
    {
      label: "an invalid anonymous session identifier",
      payload: { ...event("discovery_viewed", {}), sessionId: "visitor-123" },
    },
    {
      label: "a search property combination for a pharmacy action",
      payload: event("pharmacy_call_started", { queryLength: 12 }),
    },
    {
      label: "a non-empty result count for an empty-results event",
      payload: event("empty_results_shown", {
        queryLength: 12,
        resultCount: 1,
      }),
    },
    {
      label: "an empty filter selection",
      payload: event("filters_applied", {}),
    },
  ])("rejects $label deterministically", async ({ payload }) => {
    const { app, prisma } = await createAnalyticsApp();

    const response = await app.inject({
      method: "POST",
      url: ANALYTICS_PATH,
      payload,
    });

    expect(response.statusCode).toBe(400);
    badRequestResponseSchema.parse(response.json());
    expect(prisma.stored).toEqual([]);
  });

  it("returns a stable 413 envelope before persisting an oversized body", async () => {
    const { app, prisma } = await createAnalyticsApp();
    const oversizedBody = JSON.stringify({
      ...event("discovery_viewed", {}),
      padding: "x".repeat(ANALYTICS_BODY_LIMIT_BYTES),
    });

    const response = await app.inject({
      method: "POST",
      url: ANALYTICS_PATH,
      headers: { "content-type": "application/json" },
      payload: oversizedBody,
    });

    expect(response.statusCode).toBe(413);
    payloadTooLargeResponseSchema.parse(response.json());
    expect(prisma.stored).toEqual([]);
  });

  it("limits only analytics traffic and leaves health and public traffic outside its budget", async () => {
    const { app, prisma } = await createAnalyticsApp({
      analyticsRateLimitMax: ANALYTICS_RATE_LIMIT,
    });
    app.get("/api/v1/public-probe", () => ({ status: "ok" }));

    const healthBefore = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthBefore.statusCode).toBe(200);
    healthResponseSchema.parse(healthBefore.json());
    const publicBefore = await app.inject({
      method: "GET",
      url: "/api/v1/public-probe",
    });
    expect(publicBefore.statusCode).toBe(200);
    publicProbeResponseSchema.parse(publicBefore.json());

    for (let attempt = 0; attempt < ANALYTICS_RATE_LIMIT; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: ANALYTICS_PATH,
        payload: event("discovery_viewed", {}),
      });
      expect(response.statusCode).toBe(202);
      acceptedResponse(response.json());
    }

    const limited = await app.inject({
      method: "POST",
      url: ANALYTICS_PATH,
      payload: event("discovery_viewed", {}),
    });
    expect(limited.statusCode).toBe(429);
    rateLimitedResponseSchema.parse(limited.json());
    expect(prisma.stored).toHaveLength(ANALYTICS_RATE_LIMIT);

    const healthAfter = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthAfter.statusCode).toBe(200);
    healthResponseSchema.parse(healthAfter.json());
    const publicAfter = await app.inject({
      method: "GET",
      url: "/api/v1/public-probe",
    });
    expect(publicAfter.statusCode).toBe(200);
    publicProbeResponseSchema.parse(publicAfter.json());
  });

  it("keeps retention cleanup out of ingestion and deletes only records older than 30 days", async () => {
    const { app, prisma } = await createAnalyticsApp();
    const response = await app.inject({
      method: "POST",
      url: ANALYTICS_PATH,
      payload: event("discovery_viewed", {}),
    });
    expect(response.statusCode).toBe(202);
    acceptedResponse(response.json());
    expect(prisma.cleanupCalls).toEqual([]);

    prisma.stored.push(
      {
        id: "00000000-0000-4000-8000-000000000101",
        name: "discovery_viewed",
        sessionId: SESSION_ID,
        pharmacyId: null,
        properties: {},
        occurredAt: new Date("2026-08-16T11:59:59.999Z"),
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        name: "discovery_viewed",
        sessionId: SESSION_ID,
        pharmacyId: null,
        properties: {},
        occurredAt: new Date("2026-08-16T12:00:00.000Z"),
      },
    );

    const cleanupExpiredAnalyticsEvents = await loadRetentionCommand();
    await cleanupExpiredAnalyticsEvents({
      prisma: prisma.asPrisma(),
      now: () => NOW,
    });
    await cleanupExpiredAnalyticsEvents({
      prisma: prisma.asPrisma(),
      now: () => NOW,
    });

    expect(prisma.cleanupCalls).toEqual([
      { where: { occurredAt: { lt: new Date("2026-08-16T12:00:00.000Z") } } },
      { where: { occurredAt: { lt: new Date("2026-08-16T12:00:00.000Z") } } },
    ]);
    expect(prisma.stored).toMatchObject([
      expectedStoredEvent(event("discovery_viewed", {})),
      {
        id: "00000000-0000-4000-8000-000000000102",
        name: "discovery_viewed",
        sessionId: SESSION_ID,
        pharmacyId: null,
        properties: {},
        occurredAt: new Date("2026-08-16T12:00:00.000Z"),
      },
    ]);
  });
});

describe.runIf(runMariaDbTests)(
  "issue #11 analytics persistence (MariaDB)",
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
      const { createPrismaClient } =
        await import("../../src/infrastructure/prisma.js");
      prisma = createPrismaClient(disposableTestDatabaseUrl);
      await prisma.analyticsEvent.deleteMany();
      app = await createApp({
        webOrigin: "http://localhost:5173",
        now: () => NOW,
        prisma,
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it("persists pharmacy correlation only in the indexed column after a 202 response", async () => {
      const response = await app.inject({
        method: "POST",
        url: ANALYTICS_PATH,
        payload: event("route_started", { pharmacyId: PHARMACY_ID }),
      });

      expect(response.statusCode).toBe(202);
      const accepted = acceptedResponse(response.json());
      const stored = await prisma.analyticsEvent.findFirstOrThrow({
        where: { name: "route_started" },
      });
      expect(stored).toMatchObject({
        name: "route_started",
        sessionId: SESSION_ID,
        pharmacyId: PHARMACY_ID,
        properties: {},
        occurredAt: NOW,
      });
      expect(stored.id).toBe(accepted.data.id);
      expect(stored.occurredAt.toISOString()).toBe(accepted.data.receivedAt);
      expect(stored.properties).not.toHaveProperty("pharmacyId");
      expect(JSON.stringify(stored)).not.toMatch(
        /latitude|longitude|routePoints/i,
      );
    });

    it("retains the exact 30-day boundary when cleanup runs through real Prisma", async () => {
      const expiredId = "00000000-0000-4000-8000-000000000201";
      const boundaryId = "00000000-0000-4000-8000-000000000202";
      await prisma.analyticsEvent.createMany({
        data: [
          {
            id: expiredId,
            name: "discovery_viewed",
            sessionId: SESSION_ID,
            properties: {},
            occurredAt: new Date("2026-08-16T11:59:59.999Z"),
          },
          {
            id: boundaryId,
            name: "discovery_viewed",
            sessionId: SESSION_ID,
            properties: {},
            occurredAt: new Date("2026-08-16T12:00:00.000Z"),
          },
        ],
      });

      const cleanupExpiredAnalyticsEvents = await loadRetentionCommand();
      await cleanupExpiredAnalyticsEvents({ prisma, now: () => NOW });
      expect(
        await prisma.analyticsEvent.findMany({ orderBy: { id: "asc" } }),
      ).toMatchObject([{ id: boundaryId }]);

      await cleanupExpiredAnalyticsEvents({ prisma, now: () => NOW });
      expect(
        await prisma.analyticsEvent.findMany({ orderBy: { id: "asc" } }),
      ).toMatchObject([{ id: boundaryId }]);
    });
  },
);
