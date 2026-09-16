import * as domain from "../src/index.js";
import { describe, expect, it } from "vitest";

type Bucket = "ACTIVE" | "UPCOMING" | "EXPIRED" | null;
type SummaryDuty = {
  startsAt: Date;
  endsAt: Date;
  status: "PENDING" | "APPROVED" | "REJECTED";
  sourceObservedAt?: Date | null;
  exceptions?: Array<{
    kind: "CANCELLED" | "UNAVAILABLE";
    startsAt: Date;
    endsAt: Date;
  }>;
};

function classify(duty: SummaryDuty, at: Date): Bucket {
  const candidate = (domain as unknown as Record<string, unknown>)[
    "classifyDutyForSummary"
  ];
  expect(candidate, "classifyDutyForSummary must be exported").toBeDefined();
  return (candidate as (value: SummaryDuty, at: Date) => Bucket)(duty, at);
}

const at = new Date("2026-09-16T12:00:00.000Z");
const base: SummaryDuty = {
  startsAt: new Date("2026-09-16T08:00:00.000Z"),
  endsAt: new Date("2026-09-16T20:00:00.000Z"),
  status: "APPROVED",
  sourceObservedAt: new Date("2026-09-01T00:00:00.000Z"),
};

describe("duty summary classification (RED #56)", () => {
  it("counts only approved periods and ignores source freshness", () => {
    expect(classify(base, at)).toBe("ACTIVE");
    expect(classify({ ...base, status: "PENDING" }, at)).toBeNull();
    expect(classify({ ...base, status: "REJECTED" }, at)).toBeNull();
  });

  it("keeps half-open start/end boundaries", () => {
    expect(classify(base, new Date("2026-09-16T07:59:59.999Z"))).toBe(
      "UPCOMING",
    );
    expect(classify(base, base.startsAt)).toBe("ACTIVE");
    expect(classify(base, new Date("2026-09-16T19:59:59.999Z"))).toBe("ACTIVE");
    expect(classify(base, base.endsAt)).toBe("EXPIRED");
  });

  it("suppresses active only while a cancellation or unavailability covers now", () => {
    for (const kind of ["CANCELLED", "UNAVAILABLE"] as const) {
      const duty: SummaryDuty = {
        ...base,
        exceptions: [
          {
            kind,
            startsAt: at,
            endsAt: new Date("2026-09-16T14:00:00.000Z"),
          },
        ],
      };
      expect(classify(duty, at)).toBeNull();
      expect(classify(duty, new Date("2026-09-16T14:00:00.000Z"))).toBe(
        "ACTIVE",
      );
      expect(classify(duty, base.endsAt)).toBe("EXPIRED");
    }
  });
});
