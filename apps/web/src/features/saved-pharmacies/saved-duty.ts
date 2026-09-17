import type { CurrentDuty } from "@wanzila/contracts";

export function getSavedDutyStatus(duty: CurrentDuty | undefined, now: number) {
  if (!duty)
    return { label: "Pas de garde actuellement", kind: "none" as const };
  if (duty.sourceFreshness !== "FRESH" || Date.parse(duty.endsAt) <= now) {
    return { label: "Garde à confirmer", kind: "uncertain" as const };
  }
  return { label: "De garde maintenant", kind: "active" as const };
}

export function nextDutyRefreshDelay(
  duties: readonly CurrentDuty[],
  now: number,
): number {
  const nextExpiry = duties
    .map((duty) => Date.parse(duty.endsAt) - now)
    .filter((delay) => Number.isFinite(delay) && delay > 0)
    .reduce((earliest, delay) => Math.min(earliest, delay), 60_000);
  return Math.max(1, nextExpiry);
}
