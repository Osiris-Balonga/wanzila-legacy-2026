import {
  pharmacyDetailResponseSchema,
  pharmacyPathParamsSchema,
  type PublicPharmacy,
} from "@wanzila/contracts";

export type PharmacyDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; pharmacy: PublicPharmacy }
  | { status: "not-found" }
  | { status: "error" };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createPharmacyDetailClient({ fetch }: { fetch: FetchLike }) {
  let controller: AbortController | undefined;
  let version = 0;
  let state: PharmacyDetailState = { status: "idle" };

  return {
    getState: () => state,
    async load(id: string): Promise<PharmacyDetailState> {
      controller?.abort();
      const requestVersion = ++version;
      if (!pharmacyPathParamsSchema.safeParse({ id }).success) {
        state = { status: "not-found" };
        return state;
      }
      controller = new AbortController();
      state = { status: "loading" };
      try {
        const response = await fetch(`/api/v1/pharmacies/${id}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (requestVersion !== version) return state;
        if (response.status === 404) {
          state = { status: "not-found" };
          return state;
        }
        if (!response.ok) {
          state = { status: "error" };
          return state;
        }
        const parsed = pharmacyDetailResponseSchema.safeParse(
          await response.json(),
        );
        if (requestVersion !== version) return state;
        state = parsed.success
          ? { status: "success", pharmacy: parsed.data.data }
          : { status: "error" };
        return state;
      } catch {
        if (requestVersion !== version) return state;
        state = { status: "error" };
        return state;
      }
    },
    cancel() {
      controller?.abort();
      version += 1;
      state = { status: "idle" };
    },
  };
}
