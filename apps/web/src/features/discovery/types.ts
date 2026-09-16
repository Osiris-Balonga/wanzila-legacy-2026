import type { PharmacyListResponse } from "@wanzila/contracts";

export type DiscoveryUrlState = {
  q?: string;
  district?: string;
  arrondissement?: string;
  page: number;
};

export type DiscoveryLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; response: PharmacyListResponse }
  | { status: "empty"; response: PharmacyListResponse }
  | { status: "invalid-filter"; message: string }
  | {
      status: "error";
      code: "NETWORK_ERROR" | "API_ERROR" | "INVALID_RESPONSE";
    }
  | { status: "uncertain-data"; response: PharmacyListResponse };
