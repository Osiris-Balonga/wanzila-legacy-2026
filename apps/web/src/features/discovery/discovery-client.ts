import {
  apiErrorSchema,
  pharmacyListQuerySchema,
  pharmacyListResponseSchema,
  type PharmacyListResponse,
} from "@wanzila/contracts";
import { buildPharmacyListRequest } from "./discovery-url-state";
import type { DiscoveryLoadState, DiscoveryUrlState } from "./types";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function validateState(
  state: DiscoveryUrlState,
):
  | { success: true; data: DiscoveryUrlState }
  | { success: false; message: string } {
  const parsed = pharmacyListQuerySchema.safeParse({
    q: state.q,
    district: state.district,
    arrondissement: state.arrondissement,
    page: state.page,
    pageSize: 20,
  });

  if (!parsed.success) {
    return { success: false, message: "Les filtres saisis sont invalides." };
  }

  return {
    success: true,
    data: {
      ...(parsed.data.q === undefined ? {} : { q: parsed.data.q }),
      ...(parsed.data.district === undefined
        ? {}
        : { district: parsed.data.district }),
      ...(parsed.data.arrondissement === undefined
        ? {}
        : { arrondissement: parsed.data.arrondissement }),
      page: parsed.data.page,
    },
  };
}

function toLoadState(response: PharmacyListResponse): DiscoveryLoadState {
  if (response.data.length === 0) {
    return { status: "empty", response };
  }

  const hasUncertainSource = response.data.some(
    (pharmacy) => pharmacy.currentDuty.sourceFreshness !== "FRESH",
  );
  return hasUncertainSource
    ? { status: "uncertain-data", response }
    : { status: "success", response };
}

export function createDiscoveryClient(options: { fetch: FetchLike }) {
  let controller: AbortController | undefined;
  let requestVersion = 0;
  let state: DiscoveryLoadState = { status: "idle" };

  async function load(input: DiscoveryUrlState): Promise<DiscoveryLoadState> {
    controller?.abort();
    const version = ++requestVersion;
    const validated = validateState(input);
    if (!validated.success) {
      state = { status: "invalid-filter", message: validated.message };
      return state;
    }

    controller = new AbortController();
    state = { status: "loading" };
    const request = buildPharmacyListRequest(validated.data);

    try {
      const response = await options.fetch(request.url, {
        ...request.init,
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (version !== requestVersion) {
        return state;
      }

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => undefined);
        if (version !== requestVersion) return state;
        apiErrorSchema.safeParse(body);
        state = { status: "error", code: "API_ERROR" };
        return state;
      }

      const body: unknown = await response.json();
      if (version !== requestVersion) return state;
      const parsed = pharmacyListResponseSchema.safeParse(body);
      state = parsed.success
        ? toLoadState(parsed.data)
        : { status: "error", code: "INVALID_RESPONSE" };
      return state;
    } catch {
      if (version !== requestVersion) {
        return state;
      }
      state = { status: "error", code: "NETWORK_ERROR" };
      return state;
    }
  }

  return {
    getState: () => state,
    load,
    cancel: () => {
      controller?.abort();
      requestVersion += 1;
      state = { status: "idle" };
    },
  };
}
