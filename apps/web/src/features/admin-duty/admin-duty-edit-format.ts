import type {
  AdminDuty,
  AdminPharmacy,
  AdminScheduleSource,
} from "@wanzila/contracts";

export type LocalFields = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

const timeZone = "Africa/Brazzaville";
const formatter = new Intl.DateTimeFormat("fr-CG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone,
});
const localPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function localParts(instant: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    localPartsFormatter
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function initialFields(duty: AdminDuty): LocalFields {
  const start = localParts(duty.startsAt);
  const end = localParts(duty.endsAt);
  return {
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
  };
}

export function toInstant(date: string, time: string): string | null {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00+01:00`);
  return Number.isNaN(value.valueOf()) ? null : value.toISOString();
}

export function dateLabel(value: string): string {
  return formatter.format(new Date(value));
}

export function durationLabel(startsAt: string, endsAt: string): string {
  const hours = (Date.parse(endsAt) - Date.parse(startsAt)) / 3_600_000;
  return `${new Intl.NumberFormat("fr-CG", { maximumFractionDigits: 1 }).format(hours)} heures`;
}

export function sourceName(
  sources: AdminScheduleSource[],
  id: string | null,
): string {
  if (!id) return "Sans source";
  return (
    sources.find((source) => source.id === id)?.name ?? "Source indisponible"
  );
}

export function address(pharmacy: AdminPharmacy): string {
  return [
    pharmacy.address.line,
    pharmacy.address.district,
    pharmacy.address.arrondissement,
  ]
    .filter((part, index, all) =>
      part ? all.findIndex((candidate) => candidate === part) === index : false,
    )
    .join(", ");
}
