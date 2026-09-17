import { apiErrorSchema, routeResponseSchema } from "@wanzila/contracts";
import fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiPrismaClient } from "../src/infrastructure/prisma.js";
import { registerRoutingRoutes } from "../src/modules/routing/routes.js";

const pharmacyId = "00000000-0000-4000-8000-000000001001";
const origin = { latitude: -4.2792, longitude: 15.2492 };
const requestBody = {
  pharmacyId,
  origin,
  mode: "car",
  locationConsent: true,
};

const osrmRoute = {
  code: "Ok",
  waypoints: [{ distance: 12 }, { distance: 27 }],
  routes: [
    {
      distance: 3422.8,
      duration: 281.1,
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
              distance: 120,
              duration: 30,
              name: "Avenue de la Paix",
              maneuver: { type: "depart", location: [15.2492, -4.2792] },
            },
            {
              distance: 3302.8,
              duration: 251.1,
              name: "",
              maneuver: { type: "arrive", location: [15.2429, -4.2636] },
            },
          ],
        },
      ],
    },
  ],
};

function fakeDatabase(status: "PUBLISHED" | "DRAFT" = "PUBLISHED") {
  const findFirst = vi.fn(
    ({ where }: { where: { status: string; id: string } }) =>
      Promise.resolve(
        where.id === pharmacyId && status === where.status
          ? { latitude: "-4.2636000", longitude: "15.2429000" }
          : null,
      ),
  );
  return {
    prisma: {
      pharmacy: { findFirst },
      $disconnect: vi.fn(() => Promise.resolve()),
    } as unknown as ApiPrismaClient,
    findFirst,
  };
}

describe("keyless routing API", () => {
  const applications: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
  });

  function setup(
    options: {
      status?: "PUBLISHED" | "DRAFT";
      fetch?: typeof fetch;
      nowMs?: () => number;
    } = {},
  ) {
    const database = fakeDatabase(options.status);
    const routeFetch = vi.fn<typeof fetch>(
      options.fetch ?? (() => Promise.resolve(Response.json(osrmRoute))),
    );
    const app = fastify();
    registerRoutingRoutes(app, {
      prisma: database.prisma,
      fetch: routeFetch,
      ...(options.nowMs ? { nowMs: options.nowMs } : {}),
    });
    applications.push(app);
    const post = async (body: unknown) =>
      await app.inject({
        method: "POST",
        url: "/routes",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify(body),
      });
    return { ...database, routeFetch, post };
  }

  it("uses a published pharmacy destination and returns road geometry, measurements, steps and attribution", async () => {
    const { findFirst, routeFetch, post } = setup();
    const response = await post(requestBody);
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: pharmacyId, status: "PUBLISHED" },
      select: { latitude: true, longitude: true },
    });
    const requestedUrl = routeFetch.mock.calls[0]?.[0];
    expect(requestedUrl).toBeInstanceOf(URL);
    if (!(requestedUrl instanceof URL)) throw new Error("Expected URL request");
    const url = requestedUrl;
    expect(url.origin).toBe("https://routing.openstreetmap.de");
    expect(url.pathname).toBe(
      "/routed-car/route/v1/driving/15.2492,-4.2792;15.2429,-4.2636",
    );
    expect(url.searchParams.get("steps")).toBe("true");
    expect(url.searchParams.get("geometries")).toBe("geojson");
    const headers = new Headers(routeFetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get("User-Agent")).toContain("Wanzila");
    const result = routeResponseSchema.parse(response.json());
    expect(result.data.distanceMeters).toBe(3422.8);
    expect(result.data.durationSeconds).toBe(281.1);
    expect(result.data.steps).toHaveLength(2);
    expect(result.data.snapDistanceMeters).toEqual({
      origin: 12,
      destination: 27,
    });
    expect(result.data.provider.fixMapUrl).toBe(
      "https://www.openstreetmap.org/fixthemap",
    );
  });

  it("rejects absent consent, invalid coordinates and unsupported motorcycle mode without provider calls", async () => {
    const { routeFetch, post } = setup();
    for (const body of [
      { ...requestBody, locationConsent: false },
      { ...requestBody, origin: { latitude: 91, longitude: 15 } },
      { ...requestBody, mode: "moto" },
    ]) {
      const response = await post(body);
      expect(response.statusCode).toBe(400);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe(
        "BAD_REQUEST",
      );
    }
    expect(routeFetch).not.toHaveBeenCalled();
  });

  it("does not route to an unpublished or missing pharmacy", async () => {
    const { routeFetch, post } = setup({ status: "DRAFT" });
    const response = await post(requestBody);
    expect(response.statusCode).toBe(404);
    expect(routeFetch).not.toHaveBeenCalled();
  });

  it("uses the foot graph for walking and limits all provider calls to one per second", async () => {
    let now = 5_000;
    const { routeFetch, post } = setup({ nowMs: () => now });
    expect((await post({ ...requestBody, mode: "walk" })).statusCode).toBe(200);
    const requestedUrl = routeFetch.mock.calls[0]?.[0];
    expect(requestedUrl).toBeInstanceOf(URL);
    if (!(requestedUrl instanceof URL)) throw new Error("Expected URL request");
    expect(requestedUrl.pathname).toContain("/routed-foot/");
    const limited = await post(requestBody);
    expect(limited.statusCode).toBe(429);
    expect(apiErrorSchema.parse(limited.json()).error.code).toBe(
      "RATE_LIMITED",
    );
    expect(routeFetch).toHaveBeenCalledTimes(1);
    now += 1_000;
    expect((await post(requestBody)).statusCode).toBe(200);
    expect(routeFetch).toHaveBeenCalledTimes(2);
  });

  it("returns explicit no-route and unavailable states without fabricating a route", async () => {
    for (const [providerResponse, statusCode, code] of [
      [Response.json({ code: "NoRoute" }), 422, "ROUTE_NOT_FOUND"],
      [
        Response.json({ code: "NoSegment" }, { status: 400 }),
        422,
        "ROUTE_NOT_FOUND",
      ],
      [Response.json({ code: "Ok", routes: [] }), 503, "ROUTING_UNAVAILABLE"],
      [new Response("offline", { status: 503 }), 503, "ROUTING_UNAVAILABLE"],
    ] as const) {
      const { post } = setup({
        fetch: vi.fn(() => Promise.resolve(providerResponse)),
      });
      const response = await post(requestBody);
      expect(response.statusCode).toBe(statusCode);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe(code);
      expect(response.body).not.toContain("3422.8");
    }
  });

  it("fails closed when the provider rejects, times out or returns a malformed route", async () => {
    for (const routeFetch of [
      vi.fn(() => Promise.resolve(new Response("limited", { status: 429 }))),
      vi.fn(() =>
        Promise.reject<Response>(new DOMException("timed out", "TimeoutError")),
      ),
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            ...osrmRoute,
            routes: [{ ...osrmRoute.routes[0], distance: -1 }],
          }),
        ),
      ),
    ]) {
      const { post } = setup({ fetch: routeFetch });
      const response = await post(requestBody);
      expect(response.statusCode).toBe(503);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe(
        "ROUTING_UNAVAILABLE",
      );
    }
  });
});
