import { describe, expect, it } from "vitest";
import {
  buildExternalDirectionsUrl,
  classifyGeolocationError,
  describeRouteStep,
  formatRouteDistance,
  formatRouteDuration,
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
      buildExternalDirectionsUrl({ latitude: 120, longitude: 15 }, "car"),
    ).toBeNull();
  });

  it("formats only measured route values and describes steps without invented street names", () => {
    expect(formatRouteDistance(830)).toBe("830 m");
    expect(formatRouteDistance(3_422.8)).toMatch(/3,4 km/);
    expect(formatRouteDuration(281)).toBe("5 min");
    expect(formatRouteDuration(3_601)).toBe("1 h 1 min");
    expect(
      describeRouteStep({
        distanceMeters: 120,
        durationSeconds: 30,
        name: "",
        maneuver: { type: "turn", modifier: "left", location: [15.2, -4.2] },
      }),
    ).toBe("Tourner à gauche");
  });

  it("names denial, unavailable and timeout separately", () => {
    expect(classifyGeolocationError({ code: 1 })).toBe("denied");
    expect(classifyGeolocationError({ code: 2 })).toBe("unavailable");
    expect(classifyGeolocationError({ code: 3 })).toBe("timeout");
    expect(classifyGeolocationError({ code: 999 })).toBe("unavailable");
  });
});
