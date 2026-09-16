import * as contracts from "@wanzila/contracts";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

// The RED test can typecheck before the new response export exists.
function summarySchema(): ZodType {
  const candidate = (contracts as unknown as Record<string, unknown>)[
    "adminDutySummaryResponseSchema"
  ];
  expect(
    candidate,
    "adminDutySummaryResponseSchema must be exported",
  ).toBeDefined();
  return candidate as ZodType;
}

describe("admin duty directory contracts (RED #56)", () => {
  it("normalizes q without discarding punctuation and bounds strict list queries", () => {
    const query = contracts.adminDutyListQuerySchema;
    expect(
      query.parse({ q: "  Pharmacie   C++  ", page: "2", pageSize: "1" }),
    ).toMatchObject({
      q: "Pharmacie C++",
      page: 2,
      pageSize: 1,
    });
    expect(query.parse({ q: "  Poto-Poto  " })).toMatchObject({
      q: "Poto-Poto",
    });
    for (const invalid of [
      { q: "   " },
      { q: "x".repeat(181) },
      { q: ["alpha", "beta"] },
      { q: "Alpha", unexpected: "value" },
      { q: "Alpha", page: 0 },
    ]) {
      expect(query.safeParse(invalid).success).toBe(false);
    }
  });

  it("returns four exact counts and an asOf timestamp without fabricated trends", () => {
    const schema = summarySchema();
    const valid = {
      data: {
        asOf: "2026-09-16T12:00:00.000Z",
        active: 2,
        upcoming: 3,
        expired: 4,
        withoutRecentDuty: 5,
      },
    };
    expect(schema.parse(valid)).toEqual(valid);
    for (const invalid of [
      { data: { ...valid.data, active: -1 } },
      { data: { ...valid.data, upcoming: 1.5 } },
      { data: { ...valid.data, asOf: "today" } },
      { data: { ...valid.data, trendPercent: 12 } },
      { data: { asOf: valid.data.asOf, active: 2, upcoming: 3, expired: 4 } },
    ]) {
      expect(schema.safeParse(invalid).success).toBe(false);
    }
  });
});
