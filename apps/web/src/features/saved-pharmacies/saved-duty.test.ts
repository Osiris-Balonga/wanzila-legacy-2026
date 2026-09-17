import { describe, expect, it } from "vitest";
import { getSavedDutyStatus, nextDutyRefreshDelay } from "./saved-duty";

const duty = {
  state: "ACTIVE" as const,
  startsAt: "2026-09-17T00:00:00.000Z",
  endsAt: "2026-09-17T00:01:00.000Z",
  sourceFreshness: "FRESH" as const,
};

describe("saved duty recency", () => {
  it("transitions from active to uncertain when the displayed guard expires", () => {
    expect(
      getSavedDutyStatus(duty, Date.parse("2026-09-17T00:00:59.000Z")),
    ).toEqual({
      label: "De garde maintenant",
      kind: "active",
    });
    expect(getSavedDutyStatus(duty, Date.parse(duty.endsAt))).toEqual({
      label: "Garde à confirmer",
      kind: "uncertain",
    });
  });

  it("schedules a refresh no later than the next minute or current expiry", () => {
    expect(
      nextDutyRefreshDelay([duty], Date.parse("2026-09-17T00:00:30.000Z")),
    ).toBe(30_000);
    expect(
      nextDutyRefreshDelay([], Date.parse("2026-09-17T00:00:30.000Z")),
    ).toBe(60_000);
  });
});
