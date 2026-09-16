import type { PharmacyListResponse } from "@wanzila/contracts";
import { describe, expect, it, vi } from "vitest";

const discoveryClientModule = "./discovery-client.js";
const pharmacyId = "00000000-0000-4000-8000-000000000006";

type DiscoveryUrlState = {
  q?: string;
  district?: string;
  arrondissement?: string;
  page: number;
};

type DiscoveryLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; response: PharmacyListResponse }
  | { status: "empty"; response: PharmacyListResponse }
  | { status: "invalid-filter"; message: string }
  | {
      status: "error";
      code: "NETWORK_ERROR" | "API_ERROR" | "INVALID_RESPONSE";
    }
  | { status: "uncertain-data"; response: PharmacyListResponse };

type DiscoveryClient = {
  getState: () => DiscoveryLoadState;
  load: (state: DiscoveryUrlState) => Promise<DiscoveryLoadState>;
  cancel: () => void;
};

type DiscoveryClientFactory = (options: {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
}) => DiscoveryClient;

function isDiscoveryClientModule(
  value: unknown,
): value is { createDiscoveryClient: DiscoveryClientFactory } {
  return (
    typeof value === "object" &&
    value !== null &&
    "createDiscoveryClient" in value &&
    typeof value.createDiscoveryClient === "function"
  );
}

async function loadDiscoveryClient(): Promise<DiscoveryClientFactory> {
  let candidate: unknown;

  try {
    candidate = await import(/* @vite-ignore */ discoveryClientModule);
  } catch (error) {
    throw new Error(
      "Issue #6 needs a cancellable injected-fetch discovery client boundary.",
      { cause: error },
    );
  }

  if (!isDiscoveryClientModule(candidate)) {
    throw new Error(
      "Issue #6 discovery client must export createDiscoveryClient.",
    );
  }

  return candidate.createDiscoveryClient;
}

function pharmacyListResponse(
  sourceFreshness: "FRESH" | "STALE" | "UNKNOWN" = "FRESH",
): PharmacyListResponse {
  return {
    data: [
      {
        id: pharmacyId,
        name: "Pharmacie Centrale",
        address: {
          line: "12 avenue de la Paix",
          district: "Plateau",
          arrondissement: "Poto-Poto",
        },
        coordinates: { latitude: -4.2634, longitude: 15.2429 },
        currentDuty: {
          state: "ACTIVE",
          startsAt: "2026-09-15T08:00:00.000Z",
          endsAt: "2026-09-16T08:00:00.000Z",
          sourceFreshness,
          source: {
            name: "Ordre national des pharmaciens",
            observedAt: "2026-09-15T08:30:00.000Z",
          },
        },
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  };
}

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve(value: T) {
      if (!resolve) {
        throw new Error("Deferred promise was not initialized.");
      }
      resolve(value);
    },
  };
}

describe("issue #6 discovery client boundary", () => {
  it("uses injected fetch with same-origin credentials and strictly parses #4 success data", async () => {
    const createDiscoveryClient = await loadDiscoveryClient();
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(pharmacyListResponse()), { status: 200 }),
      ),
    );
    const client = createDiscoveryClient({ fetch });

    const result = await client.load({ q: "Centrale", page: 1 });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/pharmacies?q=Centrale&page=1&pageSize=20",
      expect.objectContaining({ credentials: "same-origin", method: "GET" }),
    );
    expect(result).toEqual({
      status: "success",
      response: pharmacyListResponse(),
    });
  });

  it("exposes loading before the request settles and an empty state for a valid empty response", async () => {
    const createDiscoveryClient = await loadDiscoveryClient();
    const pending = deferred<Response>();
    const client = createDiscoveryClient({
      fetch: vi.fn(() => pending.promise),
    });

    const loading = client.load({ page: 1 });
    expect(client.getState()).toEqual({ status: "loading" });

    pending.resolve(
      new Response(
        JSON.stringify({
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        }),
        { status: 200 },
      ),
    );
    await expect(loading).resolves.toMatchObject({ status: "empty" });
  });

  it("normalizes malformed local filters without making a network request", async () => {
    const createDiscoveryClient = await loadDiscoveryClient();
    const fetch = vi.fn();
    const client = createDiscoveryClient({ fetch });

    await expect(
      client.load({ district: " ", page: 0 }),
    ).resolves.toMatchObject({ status: "invalid-filter" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes network failures, API failures, and malformed payloads without throwing", async () => {
    const createDiscoveryClient = await loadDiscoveryClient();
    const networkClient = createDiscoveryClient({
      fetch: vi.fn(() => Promise.reject(new Error("offline"))),
    });
    const apiClient = createDiscoveryClient({
      fetch: vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: "INTERNAL_ERROR", message: "Try again later" },
            }),
            { status: 500 },
          ),
        ),
      ),
    });
    const malformedClient = createDiscoveryClient({
      fetch: vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ data: [{ name: "Missing contract" }] }),
            {
              status: 200,
            },
          ),
        ),
      ),
    });

    await expect(networkClient.load({ page: 1 })).resolves.toEqual({
      status: "error",
      code: "NETWORK_ERROR",
    });
    await expect(apiClient.load({ page: 1 })).resolves.toEqual({
      status: "error",
      code: "API_ERROR",
    });
    await expect(malformedClient.load({ page: 1 })).resolves.toEqual({
      status: "error",
      code: "INVALID_RESPONSE",
    });
  });

  it("marks stale and unknown source data as uncertain without changing the API duty state", async () => {
    const createDiscoveryClient = await loadDiscoveryClient();

    for (const freshness of ["STALE", "UNKNOWN"] as const) {
      const response = pharmacyListResponse(freshness);
      const client = createDiscoveryClient({
        fetch: vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify(response), { status: 200 }),
          ),
        ),
      });

      await expect(client.load({ page: 1 })).resolves.toEqual({
        status: "uncertain-data",
        response,
      });
    }
  });

  it("aborts superseded work and never lets an older response overwrite the latest state", async () => {
    const createDiscoveryClient = await loadDiscoveryClient();
    const first = deferred<Response>();
    const second = deferred<Response>();
    const signals: AbortSignal[] = [];
    const client = createDiscoveryClient({
      fetch: vi.fn((_input: string, init: RequestInit) => {
        if (!init.signal) {
          throw new Error("Discovery requests must receive an AbortSignal.");
        }
        signals.push(init.signal);
        return signals.length === 1 ? first.promise : second.promise;
      }),
    });

    const older = client.load({ q: "Ancienne", page: 1 });
    const newer = client.load({ q: "Nouvelle", page: 1 });
    expect(signals[0]?.aborted).toBe(true);

    second.resolve(
      new Response(JSON.stringify(pharmacyListResponse()), { status: 200 }),
    );
    await expect(newer).resolves.toMatchObject({ status: "success" });

    first.resolve(
      new Response(
        JSON.stringify({
          ...pharmacyListResponse(),
          data: [
            { ...pharmacyListResponse().data[0], name: "Réponse périmée" },
          ],
        }),
        { status: 200 },
      ),
    );
    await older;
    expect(client.getState()).toMatchObject({
      status: "success",
      response: { data: [{ name: "Pharmacie Centrale" }] },
    });
  });

  it("keeps an invalid replacement filter from being overwritten by an older response", async () => {
    const createDiscoveryClient = await loadDiscoveryClient();
    const first = deferred<Response>();
    const client = createDiscoveryClient({ fetch: vi.fn(() => first.promise) });

    const older = client.load({ page: 1 });
    await expect(
      client.load({ district: " ", page: 0 }),
    ).resolves.toMatchObject({
      status: "invalid-filter",
    });
    first.resolve(
      new Response(JSON.stringify(pharmacyListResponse()), { status: 200 }),
    );
    await older;
    expect(client.getState()).toMatchObject({ status: "invalid-filter" });
  });
});
