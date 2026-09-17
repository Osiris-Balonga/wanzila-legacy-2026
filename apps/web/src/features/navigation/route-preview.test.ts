import { describe, expect, it } from "vitest";
import {
  buildExternalDirectionsUrl,
  classifyGeolocationError,
  getDemonstrationRoute,
  hasUsableCoordinates,
} from "./route-preview";

const jagger = {
  name: "Pharmacie Jagger",
  coordinates: { latitude: -4.2636, longitude: 15.2429 },
};

describe("route preview boundaries", () => {
  it("accepts only finite coordinates within geographic bounds", () => {
    expect(hasUsableCoordinates(jagger.coordinates)).toBe(true);
    expect(hasUsableCoordinates(undefined)).toBe(false);
    expect(hasUsableCoordinates({ latitude: 91, longitude: 15 })).toBe(false);
    expect(hasUsableCoordinates({ latitude: 0, longitude: -181 })).toBe(false);
    expect(hasUsableCoordinates({ latitude: NaN, longitude: 15 })).toBe(false);
    expect(hasUsableCoordinates({ latitude: 0, longitude: Infinity })).toBe(
      false,
    );
  });

  it("creates a real external destination hand-off without origin leakage", () => {
    const href = buildExternalDirectionsUrl(jagger.coordinates, "car");
    expect(href).not.toBeNull();
    const url = new URL(href!);
    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("-4.2636,15.2429");
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.has("origin")).toBe(false);
    expect(buildExternalDirectionsUrl(jagger.coordinates, "walk")).toContain(
      "travelmode=walking",
    );
    expect(
      buildExternalDirectionsUrl(jagger.coordinates, "moto"),
    ).not.toContain("travelmode=");
    expect(
      buildExternalDirectionsUrl({ latitude: 120, longitude: 15 }, "car"),
    ).toBeNull();
  });

  it("supplies a typed deterministic car fixture only for the exact Jagger destination", () => {
    const route = getDemonstrationRoute(jagger, "car");
    expect(route?.feature.type).toBe("Feature");
    expect(route?.feature.geometry.type).toBe("LineString");
    expect(route?.feature.geometry.coordinates.length).toBeGreaterThan(2);
    expect(route?.feature.geometry.coordinates.at(-1)).toEqual([
      15.2429, -4.2636,
    ]);
    expect(route?.distanceKm).toBe(2.4);
    expect(route?.durationMinutes).toBe(7);
    expect(route?.demonstration).toBe(true);
    expect(getDemonstrationRoute(jagger, "walk")).toBeNull();
    expect(getDemonstrationRoute(jagger, "moto")).toBeNull();
    expect(
      getDemonstrationRoute(
        { ...jagger, coordinates: { latitude: -4.264, longitude: 15.2429 } },
        "car",
      ),
    ).toBeNull();
    expect(
      getDemonstrationRoute({ ...jagger, name: "Autre pharmacie" }, "car"),
    ).toBeNull();
  });

  it("names denial, unavailable and timeout separately", () => {
    expect(classifyGeolocationError({ code: 1 })).toBe("denied");
    expect(classifyGeolocationError({ code: 2 })).toBe("unavailable");
    expect(classifyGeolocationError({ code: 3 })).toBe("timeout");
    expect(classifyGeolocationError({ code: 999 })).toBe("unavailable");
  });
});
