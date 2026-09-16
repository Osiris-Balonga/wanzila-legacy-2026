import { PRODUCT_TIME_ZONE } from "./duty-state.js";

export type AdminAnalyticsWindowSelection = "7d" | "30d";

export interface AdminAnalyticsCalendarWindow {
  from: Date;
  to: Date;
  dates: string[];
}

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PRODUCT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function localParts(
  at: Date,
): Record<"year" | "month" | "day" | "hour" | "minute" | "second", number> {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return parts as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second",
    number
  >;
}

function localMidnightUtc(date: Date): Date {
  const probe = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12),
  );
  const parts = localParts(probe);
  const offset =
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - probe.getTime();
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      offset,
  );
}

/** Today is included as a partial local day; `to` is the captured request clock. */
export function createAdminAnalyticsWindow(
  at: Date,
  selection: AdminAnalyticsWindowSelection,
): AdminAnalyticsCalendarWindow {
  const local = localParts(at);
  const first = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const length = selection === "7d" ? 7 : 30;
  first.setUTCDate(first.getUTCDate() - length + 1);
  const dates = Array.from({ length }, (_, index) => {
    const day = new Date(first);
    day.setUTCDate(first.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
  return { from: localMidnightUtc(first), to: new Date(at), dates };
}
