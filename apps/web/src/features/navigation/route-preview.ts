import type { RouteResponse } from "@wanzila/contracts";
import { hasValidCoordinates } from "../pharmacy-detail/PharmacyDetailMap";

export type Coordinates = { latitude: number; longitude: number };
export type TravelMode = "car" | "walk";
export type LocationFailure = "denied" | "unavailable" | "timeout";
export type CalculatedRoute = RouteResponse["data"];
export type RouteLineFeature = {
  type: "Feature";
  properties: { kind: "calculated" };
  geometry: CalculatedRoute["geometry"];
};

export const hasUsableCoordinates = hasValidCoordinates;

export function routeFeature(route: CalculatedRoute): RouteLineFeature {
  return {
    type: "Feature",
    properties: { kind: "calculated" },
    geometry: route.geometry,
  };
}

export function formatRouteDistance(meters: number): string {
  if (meters < 1_000) return `${Math.round(meters)} m`;
  return `${(meters / 1_000).toLocaleString("fr-CG", { maximumFractionDigits: 1 })} km`;
}

export function formatRouteDuration(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export function describeRouteStep(
  step: CalculatedRoute["steps"][number],
): string {
  const { type, modifier } = step.maneuver;
  if (type === "depart") return "Départ";
  if (type === "arrive") return "Arrivée";
  if (type === "roundabout" || type === "rotary")
    return "Emprunter le rond-point";
  if (type === "turn" || type === "end of road") {
    if (
      modifier === "left" ||
      modifier === "slight left" ||
      modifier === "sharp left"
    )
      return "Tourner à gauche";
    if (
      modifier === "right" ||
      modifier === "slight right" ||
      modifier === "sharp right"
    )
      return "Tourner à droite";
    if (modifier === "uturn") return "Faire demi-tour";
  }
  return "Continuer";
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
  url.searchParams.set("travelmode", mode === "walk" ? "walking" : "driving");
  return url.toString();
}

export function classifyGeolocationError(error: {
  code: number;
}): LocationFailure {
  if (error.code === 1) return "denied";
  if (error.code === 3) return "timeout";
  return "unavailable";
}
