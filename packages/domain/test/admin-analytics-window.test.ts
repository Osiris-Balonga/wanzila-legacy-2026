import * as domain from "@wanzila/domain";
import { describe, expect, it } from "vitest";

type CalendarWindow = {
  from: Date;
  to: Date;
  dates: string[];
};

function windowFor(now: Date, selection: "7d" | "30d"): CalendarWindow {
  const candidate = (domain as Record<string, unknown>)[
    "createAdminAnalyticsWindow"
  ];
  expect(candidate, "createAdminAnalyticsWindow must be exported").toBeTypeOf(
    "function",
  );
  return (candidate as (at: Date, window: "7d" | "30d") => CalendarWindow)(
    now,
    selection,
  );
}

describe("Africa/Brazzaville analytics calendar window (RED #54)", () => {
  it("uses seven local dates including partial today and half-open UTC bounds", () => {
    const result = windowFor(new Date("2026-09-16T12:00:00.000Z"), "7d");
    expect(result.from.toISOString()).toBe("2026-09-09T23:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-16T12:00:00.000Z");
    expect(result.dates).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
  });

  it("uses thirty dates across a month boundary without UTC-day drift", () => {
    const result = windowFor(new Date("2026-09-16T00:30:00.000Z"), "30d");
    expect(result.from.toISOString()).toBe("2026-08-17T23:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-16T00:30:00.000Z");
    expect(result.dates).toHaveLength(30);
    expect(result.dates[0]).toBe("2026-08-18");
    expect(result.dates.at(-1)).toBe("2026-09-16");
  });
});
