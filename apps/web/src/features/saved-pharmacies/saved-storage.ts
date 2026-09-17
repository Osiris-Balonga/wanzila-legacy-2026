import { pharmacyPathParamsSchema } from "@wanzila/contracts";

export const SAVED_PHARMACY_IDS_KEY = "wanzila:saved-pharmacy-ids:v1";
export const SAVED_PHARMACIES_CHANGED_EVENT =
  "wanzila:saved-pharmacies-changed";

function isPharmacyId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    pharmacyPathParamsSchema.safeParse({ id: value }).success
  );
}

export function readSavedIds(storage: Storage): string[] {
  try {
    const raw = storage.getItem(SAVED_PHARMACY_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter(isPharmacyId))].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

function writeSavedIds(storage: Storage, ids: string[]): string[] {
  try {
    storage.setItem(SAVED_PHARMACY_IDS_KEY, JSON.stringify(ids));
  } catch {
    // The caller can detect failed persistence by reading the storage again.
  }
  return ids;
}

export function addSavedId(storage: Storage, id: string): string[] {
  const ids = readSavedIds(storage);
  if (!isPharmacyId(id) || ids.includes(id)) return ids;
  return writeSavedIds(storage, [...ids, id]);
}

export function removeSavedId(storage: Storage, id: string): string[] {
  return writeSavedIds(
    storage,
    readSavedIds(storage).filter((savedId) => savedId !== id),
  );
}

export function browserSavedStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function notifySavedPharmaciesChanged(): void {
  window.dispatchEvent(new Event(SAVED_PHARMACIES_CHANGED_EVENT));
}
