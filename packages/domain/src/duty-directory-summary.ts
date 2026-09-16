import { isValidInterval } from "./duty-management.js";
import type { DutyPeriodInput } from "./duty-state.js";

export type DutySummaryBucket = "ACTIVE" | "UPCOMING" | "EXPIRED";

/** Classifies approved periods at a half-open boundary; freshness is not a KPI. */
export function classifyDutyForSummary(
  duty: DutyPeriodInput,
  at: Date,
): DutySummaryBucket | null {
  if (!isValidInterval(duty))
    throw new RangeError("Duty period endsAt must be strictly after startsAt.");
  if (duty.status !== "APPROVED") return null;

  const instant = at.getTime();
  if (instant < duty.startsAt.getTime()) return "UPCOMING";
  if (instant >= duty.endsAt.getTime()) return "EXPIRED";

  for (const exception of duty.exceptions ?? []) {
    if (!isValidInterval(exception))
      throw new RangeError(
        "Duty exception endsAt must be strictly after startsAt.",
      );
    if (
      exception.startsAt.getTime() <= instant &&
      instant < exception.endsAt.getTime()
    )
      return null;
  }
  return "ACTIVE";
}
