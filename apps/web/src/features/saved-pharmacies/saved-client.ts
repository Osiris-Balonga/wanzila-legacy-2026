import {
  pharmacyDetailResponseSchema,
  pharmacyPathParamsSchema,
  type PublicPharmacy,
} from "@wanzila/contracts";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type SavedPharmaciesResult = {
  pharmacies: PublicPharmacy[];
  missingIds: string[];
  failedIds: string[];
};

export async function fetchSavedPharmacies(
  fetch: FetchLike,
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<SavedPharmaciesResult> {
  const records = await Promise.all(
    ids.map(async (id) => {
      if (!pharmacyPathParamsSchema.safeParse({ id }).success) {
        return { id, status: "missing" as const };
      }
      try {
        const response = await fetch(`/api/v1/pharmacies/${id}`, {
          credentials: "same-origin",
          cache: "no-store",
          ...(signal ? { signal } : {}),
        });
        if (response.status === 404) return { id, status: "missing" as const };
        if (!response.ok) return { id, status: "failed" as const };
        const parsed = pharmacyDetailResponseSchema.safeParse(
          await response.json(),
        );
        return parsed.success && parsed.data.data.id === id
          ? { id, status: "success" as const, pharmacy: parsed.data.data }
          : { id, status: "failed" as const };
      } catch {
        return { id, status: "failed" as const };
      }
    }),
  );
  return {
    pharmacies: records.flatMap((record) =>
      record.status === "success" ? [record.pharmacy] : [],
    ),
    missingIds: records
      .filter((record) => record.status === "missing")
      .map((record) => record.id),
    failedIds: records
      .filter((record) => record.status === "failed")
      .map((record) => record.id),
  };
}
