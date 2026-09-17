import {
  routeResponseSchema,
  type RouteRequest,
  type RouteResponse,
} from "@wanzila/contracts";
import { z } from "zod";

const positionSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);

const osrmResponseSchema = z.object({
  code: z.literal("Ok"),
  waypoints: z.tuple([
    z.object({ distance: z.number().finite().nonnegative() }),
    z.object({ distance: z.number().finite().nonnegative() }),
  ]),
  routes: z
    .array(
      z.object({
        distance: z.number().finite().nonnegative(),
        duration: z.number().finite().nonnegative(),
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: z.array(positionSchema).min(2).max(20_000),
        }),
        legs: z
          .array(
            z.object({
              steps: z
                .array(
                  z.object({
                    distance: z.number().finite().nonnegative(),
                    duration: z.number().finite().nonnegative(),
                    name: z.string(),
                    maneuver: z.object({
                      type: z.string(),
                      modifier: z.string().optional(),
                      location: positionSchema,
                    }),
                  }),
                )
                .min(1)
                .max(1_000),
            }),
          )
          .length(1),
      }),
    )
    .min(1),
});

export type RoutingResult =
  | { status: "ok"; response: RouteResponse }
  | { status: "no-route" }
  | { status: "unavailable" };

export interface RoutingProviderOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

const provider = {
  name: "FOSSGIS / OSRM / OpenStreetMap",
  attributionUrl: "https://routing.openstreetmap.de/about.html",
  fixMapUrl: "https://www.openstreetmap.org/fixthemap",
} as const;

const userAgent = "Wanzila/1.0 (+https://github.com/Osiris-Balonga/wanzila)";

export function createOsrmProvider(options: RoutingProviderOptions = {}) {
  const fetchRoute = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? "https://routing.openstreetmap.de";
  const timeoutMs = options.timeoutMs ?? 5_000;
  const base = new URL(baseUrl);
  if (
    base.protocol !== "https:" &&
    base.hostname !== "localhost" &&
    base.hostname !== "127.0.0.1"
  ) {
    throw new Error("Routing provider must use HTTPS outside localhost");
  }

  return async (
    request: RouteRequest,
    destination: { latitude: number; longitude: number },
  ): Promise<RoutingResult> => {
    // FOSSGIS receives the precise origin. Never add it to Wanzila logs.
    const profile = request.mode === "walk" ? "foot" : "car";
    const coordinates = `${request.origin.longitude},${request.origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = new URL(
      `/routed-${profile}/route/v1/driving/${coordinates}`,
      base,
    );
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "true");
    try {
      const response = await fetchRoute(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok && response.status !== 400) {
        return { status: "unavailable" };
      }
      const raw: unknown = await response.json();
      if (
        typeof raw === "object" &&
        raw !== null &&
        "code" in raw &&
        (raw.code === "NoRoute" || raw.code === "NoSegment")
      ) {
        return { status: "no-route" };
      }
      if (!response.ok) return { status: "unavailable" };
      const parsed = osrmResponseSchema.safeParse(raw);
      if (!parsed.success) return { status: "unavailable" };
      const route = parsed.data.routes[0];
      if (!route) return { status: "no-route" };
      const result = routeResponseSchema.safeParse({
        data: {
          pharmacyId: request.pharmacyId,
          mode: request.mode,
          distanceMeters: route.distance,
          durationSeconds: route.duration,
          geometry: route.geometry,
          steps: route.legs.flatMap((leg) =>
            leg.steps.map((step) => ({
              distanceMeters: step.distance,
              durationSeconds: step.duration,
              name: step.name,
              maneuver: step.maneuver,
            })),
          ),
          snapDistanceMeters: {
            origin: parsed.data.waypoints[0].distance,
            destination: parsed.data.waypoints[1].distance,
          },
          provider,
        },
      });
      return result.success
        ? { status: "ok", response: result.data }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  };
}
