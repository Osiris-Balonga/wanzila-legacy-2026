import { describe, expect, it, vi } from "vitest";
import { createPharmacyDetailClient } from "./pharmacy-detail-client";

const id = "00000000-0000-4000-8000-000000000007";
const pharmacy = {
  id,
  name: "Pharmacie Jagger",
  address: {
    line: "Avenue des Trois Martyrs",
    district: "Poto-Poto",
    arrondissement: "Poto-Poto",
  },
  coordinates: { latitude: -4.2636, longitude: 15.2429 },
  currentDuty: {
    state: "ACTIVE",
    startsAt: "2026-09-16T08:00:00.000Z",
    endsAt: "2026-09-17T07:00:00.000Z",
    sourceFreshness: "FRESH",
  },
};

describe("pharmacy detail API client", () => {
  it("loads and validates the real detail contract without filling optional fields", async () => {
    const fetch = vi.fn((input: string, init: RequestInit) => {
      expect(input).toBe(`/api/v1/pharmacies/${id}`);
      expect(init.credentials).toBe("same-origin");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(new Response(JSON.stringify({ data: pharmacy })));
    });
    const client = createPharmacyDetailClient({ fetch });
    expect(await client.load(id)).toEqual({ status: "success", pharmacy });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("distinguishes invalid IDs, missing records, malformed responses and network failures", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(new Response("", { status: 404 })),
    );
    const client = createPharmacyDetailClient({ fetch });
    expect(await client.load("not-an-id")).toEqual({ status: "not-found" });
    expect(fetch).not.toHaveBeenCalled();
    expect(await client.load(id)).toEqual({ status: "not-found" });
    const malformed = createPharmacyDetailClient({
      fetch: () =>
        Promise.resolve(new Response(JSON.stringify({ data: { id } }))),
    });
    expect(await malformed.load(id)).toEqual({ status: "error" });
    const offline = createPharmacyDetailClient({
      fetch: () => Promise.reject(new Error("offline")),
    });
    expect(await offline.load(id)).toEqual({ status: "error" });
  });

  it("does not publish the result of a cancelled request", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const client = createPharmacyDetailClient({ fetch });
    const pending = client.load(id);
    client.cancel();
    resolve(new Response(JSON.stringify({ data: pharmacy })));
    expect(await pending).toEqual({ status: "idle" });
    expect(client.getState()).toEqual({ status: "idle" });
  });
});
