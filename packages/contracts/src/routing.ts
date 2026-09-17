import { z } from "zod";

const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

export const routeRequestSchema = z
  .object({
    pharmacyId: z.uuid(),
    origin: coordinatesSchema,
    mode: z.enum(["car", "walk"]),
    // The browser must ask before transmitting the origin to Wanzila/FOSSGIS.
    locationConsent: z.literal(true),
  })
  .strict();

const routeStepSchema = z.object({
  distanceMeters: z.number().finite().nonnegative(),
  durationSeconds: z.number().finite().nonnegative(),
  name: z.string(),
  maneuver: z.object({
    type: z.string(),
    modifier: z.string().optional(),
    location: z.tuple([z.number().finite(), z.number().finite()]),
  }),
});

export const routeResponseSchema = z.object({
  data: z.object({
    pharmacyId: z.uuid(),
    mode: z.enum(["car", "walk"]),
    distanceMeters: z.number().finite().nonnegative(),
    durationSeconds: z.number().finite().nonnegative(),
    geometry: z.object({
      type: z.literal("LineString"),
      coordinates: z
        .array(z.tuple([z.number().finite(), z.number().finite()]))
        .min(2),
    }),
    steps: z.array(routeStepSchema).min(1),
    snapDistanceMeters: z.object({
      origin: z.number().finite().nonnegative(),
      destination: z.number().finite().nonnegative(),
    }),
    provider: z.object({
      name: z.literal("FOSSGIS / OSRM / OpenStreetMap"),
      attributionUrl: z.literal("https://routing.openstreetmap.de/about.html"),
      fixMapUrl: z.literal("https://www.openstreetmap.org/fixthemap"),
    }),
  }),
});

export type RouteRequest = z.infer<typeof routeRequestSchema>;
export type RouteResponse = z.infer<typeof routeResponseSchema>;
