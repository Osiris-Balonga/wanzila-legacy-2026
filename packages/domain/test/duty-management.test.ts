import { describe, expect, it } from "vitest";
import {
  intervalContains,
  intervalsOverlap,
  isValidInterval,
} from "../src/duty-management.js";

const interval = (startsAt: string, endsAt: string) => ({
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
});

describe("duty administration half-open intervals", () => {
  const duty = interval("2026-09-16T08:00:00.000Z", "2026-09-16T20:00:00.000Z");

  it("rejects zero and inverted windows", () => {
    expect(isValidInterval(duty)).toBe(true);
    expect(
      isValidInterval(
        interval("2026-09-16T08:00:00.000Z", "2026-09-16T08:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isValidInterval(
        interval("2026-09-16T20:00:00.000Z", "2026-09-16T08:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("allows touching endpoints but detects positive overlap", () => {
    expect(
      intervalsOverlap(
        duty,
        interval("2026-09-16T20:00:00.000Z", "2026-09-17T08:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      intervalsOverlap(
        duty,
        interval("2026-09-16T19:59:59.999Z", "2026-09-17T08:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("bounds operational exceptions to their parent duty", () => {
    expect(intervalContains(duty, duty)).toBe(true);
    expect(
      intervalContains(
        duty,
        interval("2026-09-16T08:00:00.000Z", "2026-09-16T12:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      intervalContains(
        duty,
        interval("2026-09-16T07:59:59.999Z", "2026-09-16T12:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      intervalContains(
        duty,
        interval("2026-09-16T12:00:00.000Z", "2026-09-16T20:00:00.001Z"),
      ),
    ).toBe(false);
  });
});
