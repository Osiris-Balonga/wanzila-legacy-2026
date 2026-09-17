import { describe, expect, it } from "vitest";

const modulePath = "../src/arrival-detection.js";
type Point = { latitude: number; longitude: number };
type ArrivalDomain = {
  straightLineDistanceMeters: (from: Point, to: Point) => number | null;
  isWithinArrivalRadius: (distance: number | null, radius?: number) => boolean;
};

async function subject(): Promise<ArrivalDomain> {
  return (await import(modulePath)) as ArrivalDomain;
}

describe("arrival distance domain", () => {
  it("uses a deterministic straight-line distance, never a road distance", async () => {
    const { straightLineDistanceMeters } = await subject();
    expect(
      straightLineDistanceMeters(
        { latitude: -4.2636, longitude: 15.2429 },
        { latitude: -4.2636, longitude: 15.2429 },
      ),
    ).toBe(0);
    expect(
      straightLineDistanceMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ),
    ).toBeCloseTo(111_195, -1);
  });

  it("includes exactly 50 m, excludes just beyond, and supports a configured radius", async () => {
    const { isWithinArrivalRadius } = await subject();
    expect(isWithinArrivalRadius(50)).toBe(true);
    expect(isWithinArrivalRadius(50.0001)).toBe(false);
    expect(isWithinArrivalRadius(75, 75)).toBe(true);
    expect(isWithinArrivalRadius(75.1, 75)).toBe(false);
  });

  it("fails closed on invalid coordinates or distances", async () => {
    const { straightLineDistanceMeters, isWithinArrivalRadius } =
      await subject();
    expect(
      straightLineDistanceMeters(
        { latitude: Number.NaN, longitude: 15 },
        { latitude: -4.2636, longitude: 15.2429 },
      ),
    ).toBeNull();
    expect(isWithinArrivalRadius(null)).toBe(false);
    expect(isWithinArrivalRadius(Number.NaN)).toBe(false);
    expect(isWithinArrivalRadius(-1)).toBe(false);
    expect(isWithinArrivalRadius(0, 0)).toBe(false);
  });
});
