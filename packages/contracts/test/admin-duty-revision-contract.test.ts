import * as contracts from "@wanzila/contracts";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

function schema(name: string): ZodType {
  const candidate = (contracts as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} must be exported`).toBeDefined();
  return candidate as ZodType;
}

const id = "00000000-0000-4000-8000-000000007201";
const sourceId = "00000000-0000-4000-8000-000000007202";
const startsAt = "2026-09-16T08:00:00.000Z";
const endsAt = "2026-09-16T20:00:00.000Z";

describe("approved-duty revision contract (RED #72)", () => {
  it("requires a complete immutable proposal and bounded trimmed submission note", () => {
    const create = schema("createAdminDutyRevisionRequestSchema");
    const proposal = {
      sourceId,
      startsAt,
      endsAt,
      note: "Correction officielle",
    };
    expect(
      create.parse({ ...proposal, note: "  Correction officielle  " }),
    ).toEqual(proposal);
    for (const invalid of [
      { ...proposal, note: " " },
      { ...proposal, note: "x".repeat(501) },
      { ...proposal, sourceId: "foreign" },
      { ...proposal, startsAt: endsAt },
      { ...proposal, endsAt: startsAt },
      { ...proposal, pharmacyId: id },
      { ...proposal, status: "APPROVED" },
      { ...proposal, unknown: true },
      { startsAt, endsAt, note: "incomplete" },
    ])
      expect(create.safeParse(invalid).success).toBe(false);
    expect(create.parse({ ...proposal, sourceId: null })).toMatchObject({
      sourceId: null,
    });
  });

  it("strictly exposes before/after, actor/time/note and open versus reviewed audit", () => {
    const response = schema("adminDutyRevisionResponseSchema");
    const pending = {
      id,
      dutyPeriodId: id,
      status: "PENDING",
      baseVersion: 0,
      before: { sourceId: null, startsAt, endsAt },
      proposed: { sourceId, startsAt, endsAt },
      submittedBy: { id, displayName: "Admin" },
      submittedAt: startsAt,
      submissionNote: "Correction officielle",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
    };
    expect(response.parse({ data: pending })).toEqual({ data: pending });
    expect(
      response.safeParse({ data: { ...pending, pharmacyId: id } }).success,
    ).toBe(false);
    expect(
      response.safeParse({ data: { ...pending, status: "SUPERSEDED" } })
        .success,
    ).toBe(false);
    expect(
      response.safeParse({ data: { ...pending, submittedBy: null } }).success,
    ).toBe(false);
    expect(
      response.parse({
        data: {
          ...pending,
          status: "APPROVED",
          reviewedBy: pending.submittedBy,
          reviewedAt: endsAt,
          reviewNote: "Validé",
        },
      }),
    ).toMatchObject({ data: { status: "APPROVED", reviewNote: "Validé" } });
  });

  it("bounds revision pagination and review notes without allowing an editable proposal", () => {
    const list = schema("adminDutyRevisionListQuerySchema");
    const review = schema("reviewAdminDutyRevisionRequestSchema");
    expect(list.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(list.safeParse({ pageSize: 51 }).success).toBe(false);
    expect(list.safeParse({ unexpected: true }).success).toBe(false);
    expect(review.parse({})).toEqual({});
    expect(review.parse({ note: "  Validé  " })).toEqual({ note: "Validé" });
    expect(review.safeParse({ note: "x".repeat(501) }).success).toBe(false);
    expect(review.safeParse({ startsAt }).success).toBe(false);
  });
});
