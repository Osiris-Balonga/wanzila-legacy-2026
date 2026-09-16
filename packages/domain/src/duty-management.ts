export interface TimeInterval {
  startsAt: Date;
  endsAt: Date;
}

export function isValidInterval(interval: TimeInterval): boolean {
  return interval.endsAt.getTime() > interval.startsAt.getTime();
}

/** Duty and exception windows are half-open: [startsAt, endsAt). */
export function intervalsOverlap(
  left: TimeInterval,
  right: TimeInterval,
): boolean {
  return (
    left.startsAt.getTime() < right.endsAt.getTime() &&
    right.startsAt.getTime() < left.endsAt.getTime()
  );
}

export function intervalContains(
  outer: TimeInterval,
  inner: TimeInterval,
): boolean {
  return (
    isValidInterval(inner) &&
    outer.startsAt.getTime() <= inner.startsAt.getTime() &&
    inner.endsAt.getTime() <= outer.endsAt.getTime()
  );
}
