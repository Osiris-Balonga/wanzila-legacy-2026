import * as domain from "@wanzila/domain";
import { describe, expect, it } from "vitest";

type Window = { from: Date; to: Date; previousFrom: Date; previousTo: Date };

function comparisonWindow(at: Date, selection: "7d" | "30d"): Window {
  const candidate = (domain as Record<string, unknown>)[
    "createAdminAnalyticsComparisonWindow"
  ];
  expect(
    candidate,
    "createAdminAnalyticsComparisonWindow must be exported",
  ).toBeTypeOf("function");
  return (candidate as (now: Date, window: "7d" | "30d") => Window)(
    at,
    selection,
  );
}

describe("equal-duration analytics comparison window (RED #63)", () => {
  it("ends the preceding half-open range at the current local midnight", () => {
    const window = comparisonWindow(new Date("2026-09-16T12:00:00.000Z"), "7d");
    expect(window.from.toISOString()).toBe("2026-09-09T23:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-16T12:00:00.000Z");
    expect(window.previousFrom.toISOString()).toBe("2026-09-03T10:00:00.000Z");
    expect(window.previousTo.toISOString()).toBe(window.from.toISOString());
    expect(window.to.getTime() - window.from.getTime()).toBe(
      window.previousTo.getTime() - window.previousFrom.getTime(),
    );
  });

  it("keeps exactly equal elapsed durations for 30d across month boundaries", () => {
    const window = comparisonWindow(
      new Date("2026-09-16T00:30:00.000Z"),
      "30d",
    );
    expect(window.from.toISOString()).toBe("2026-08-17T23:00:00.000Z");
    expect(window.previousTo.toISOString()).toBe(window.from.toISOString());
    expect(window.to.getTime() - window.from.getTime()).toBe(
      window.previousTo.getTime() - window.previousFrom.getTime(),
    );
  });
});
