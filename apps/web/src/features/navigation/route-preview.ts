import { hasValidCoordinates } from "../pharmacy-detail/PharmacyDetailMap";

export type Coordinates = { latitude: number; longitude: number };
export type TravelMode = "car" | "moto" | "walk";
export type LocationFailure = "denied" | "unavailable" | "timeout";
export type RouteLineFeature = {
  type: "Feature";
  properties: { kind: "demonstration" };
  geometry: {
    type: "LineString";
    coordinates: [[number, number], ...[number, number][]];
  };
};
export type DemonstrationRoute = {
  demonstration: true;
  distanceKm: number;
  durationMinutes: number;
  feature: RouteLineFeature;
};

export const hasUsableCoordinates = hasValidCoordinates;

// This one fixed scenario is an illustrative fixture, never a calculated route.
// Its duration and distance come from the supplied route-preview artwork.
const jaggerDemonstration: DemonstrationRoute = {
  demonstration: true,
  distanceKm: 2.4,
  durationMinutes: 7,
  feature: {
    type: "Feature",
    properties: { kind: "demonstration" },
    geometry: {
      type: "LineString",
      coordinates: [
        [15.2492, -4.2792],
        [15.2488, -4.2767],
        [15.2497, -4.2739],
        [15.2465, -4.2713],
        [15.2474, -4.2687],
        [15.2441, -4.2671],
        [15.2431, -4.2652],
        [15.2429, -4.2636],
      ],
    },
  },
};

export function getDemonstrationRoute(
  pharmacy: { name: string; coordinates?: Coordinates },
  mode: TravelMode,
): DemonstrationRoute | null {
  const destination = pharmacy.coordinates;
  return mode === "car" &&
    pharmacy.name === "Pharmacie Jagger" &&
    hasUsableCoordinates(destination) &&
    destination.latitude === -4.2636 &&
    destination.longitude === 15.2429
    ? jaggerDemonstration
    : null;
}

export function buildExternalDirectionsUrl(
  destination: Coordinates | undefined,
  mode: TravelMode,
): string | null {
  if (!hasUsableCoordinates(destination)) return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set(
    "destination",
    `${destination.latitude},${destination.longitude}`,
  );
  // Two-wheeler directions are not available everywhere. Let Google Maps
  // choose a supported travel mode instead of promising motorcycle routing.
  if (mode !== "moto") {
    url.searchParams.set("travelmode", mode === "walk" ? "walking" : "driving");
  }
  return url.toString();
}

export function classifyGeolocationError(error: {
  code: number;
}): LocationFailure {
  if (error.code === 1) return "denied";
  if (error.code === 3) return "timeout";
  return "unavailable";
}
