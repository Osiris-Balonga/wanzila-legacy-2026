import { describe, expect, it, vi } from "vitest";
import { fetchSavedPharmacies } from "./saved-client";

const jagger = "00000000-0000-4000-8000-000000000101";
const mavre = "00000000-0000-4000-8000-000000000102";
const removed = "00000000-0000-4000-8000-000000000103";

const pharmacy = (id: string, currentDuty?: object) => ({
  id,
  name: id === jagger ? "Pharmacie Jagger" : "Pharmacie Mavré",
  address: {
    line: "Avenue des Trois Martyrs",
    district: "Poto-Poto",
    arrondissement: "Poto-Poto",
  },
  coordinates: { latitude: -4.27, longitude: 15.25 },
  ...(currentDuty ? { currentDuty } : {}),
});

describe("fresh saved-pharmacy resolution", () => {
  it("loads each ID through the public detail contract without trusting stored metadata", async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        Response.json({
          data: pharmacy(url.endsWith(jagger) ? jagger : mavre),
        }),
      ),
    );
    const result = await fetchSavedPharmacies(fetch, [jagger, mavre]);
    expect(result.pharmacies.map((item) => item.id)).toEqual([jagger, mavre]);
    expect(result.missingIds).toEqual([]);
    expect(result.failedIds).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/v1/pharmacies/${jagger}`);
  });

  it("separates removed records from offline or invalid responses so only 404 is cleaned", async () => {
    const fetch = vi.fn((url: string) => {
      if (url.endsWith(removed))
        return Promise.resolve(new Response(null, { status: 404 }));
      if (url.endsWith(mavre)) return Promise.reject(new Error("offline"));
      return Promise.resolve(Response.json({ data: pharmacy(jagger) }));
    });
    const result = await fetchSavedPharmacies(fetch, [jagger, mavre, removed]);
    expect(result.pharmacies.map((item) => item.id)).toEqual([jagger]);
    expect(result.missingIds).toEqual([removed]);
    expect(result.failedIds).toEqual([mavre]);
  });

  it("rejects a malformed 200 response and never invents an active duty", async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        Response.json({
          data: url.endsWith(jagger) ? { id: jagger } : pharmacy(mavre),
        }),
      ),
    );
    const result = await fetchSavedPharmacies(fetch, [jagger, mavre]);
    expect(result.failedIds).toEqual([jagger]);
    expect(result.pharmacies[0]?.currentDuty).toBeUndefined();
  });
});
