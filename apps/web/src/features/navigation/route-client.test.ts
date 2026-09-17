import { describe, expect, it, vi } from "vitest";
import { createRouteClient } from "./route-client";

const request = {
  pharmacyId: "00000000-0000-4000-8000-000000000007",
  origin: { latitude: -4.2792, longitude: 15.2492 },
  mode: "car" as const,
  locationConsent: true as const,
};

const data = {
  pharmacyId: request.pharmacyId,
  mode: request.mode,
  distanceMeters: 3422.8,
  durationSeconds: 281.1,
  geometry: {
    type: "LineString",
    coordinates: [
      [15.2492, -4.2792],
      [15.2429, -4.2636],
    ],
  },
  steps: [
    {
      distanceMeters: 3422.8,
      durationSeconds: 281.1,
      name: "",
      maneuver: { type: "depart", location: [15.2492, -4.2792] },
    },
  ],
  snapDistanceMeters: { origin: 2, destination: 4 },
  provider: {
    name: "FOSSGIS / OSRM / OpenStreetMap",
    attributionUrl: "https://routing.openstreetmap.de/about.html",
    fixMapUrl: "https://www.openstreetmap.org/fixthemap",
  },
};

describe("route client", () => {
  it("sends the origin only for a consented request and validates the response", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data }), { status: 200 }),
      );
    const client = createRouteClient({ fetch });
    expect(await client.load(request)).toMatchObject({
      status: "success",
      route: data,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/routes",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        body: JSON.stringify(request),
      }),
    );
  });

  it("distinguishes no route, rate limit, and malformed provider result", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 422 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { ...data, pharmacyId: crypto.randomUUID() },
          }),
          { status: 200 },
        ),
      );
    const client = createRouteClient({ fetch });
    expect(await client.load(request)).toEqual({ status: "no-route" });
    expect(await client.load(request)).toEqual({ status: "rate-limited" });
    expect(await client.load(request)).toEqual({ status: "unavailable" });
  });

  it("ignores a response after cancellation", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const client = createRouteClient({ fetch });
    const pending = client.load(request);
    client.cancel();
    resolve(new Response(JSON.stringify({ data }), { status: 200 }));
    expect(await pending).toEqual({ status: "idle" });
  });
});
