import { pharmacyListQuerySchema } from "@wanzila/contracts";
import type { DiscoveryUrlState } from "./types";

const defaultPage = 1;
const defaultPageSize = 20;

function hasMalformedEncoding(search: string): boolean {
  try {
    decodeURIComponent(search.replaceAll("+", " "));
    return false;
  } catch {
    return true;
  }
}

function firstText(
  params: URLSearchParams,
  key: "q" | "district" | "arrondissement",
): string | undefined {
  const value = params.get(key);
  if (value === null) {
    return undefined;
  }

  const parsed = pharmacyListQuerySchema.safeParse({ [key]: value });
  if (!parsed.success) {
    return undefined;
  }

  return parsed.data[key];
}

function parsePage(value: string | null): number {
  if (value === null) {
    return defaultPage;
  }

  const parsed = pharmacyListQuerySchema.safeParse({ page: value });
  return parsed.success ? parsed.data.page : defaultPage;
}

function normalizeState(state: DiscoveryUrlState): DiscoveryUrlState {
  const params = new URLSearchParams();
  if (state.q !== undefined) {
    params.set("q", state.q);
  }
  if (state.district !== undefined) {
    params.set("district", state.district);
  }
  if (state.arrondissement !== undefined) {
    params.set("arrondissement", state.arrondissement);
  }
  params.set("page", String(state.page));
  return parseDiscoveryUrlState(`?${params.toString()}`);
}

export function parseDiscoveryUrlState(search: string): DiscoveryUrlState {
  if (hasMalformedEncoding(search)) {
    return { page: defaultPage };
  }

  const params = new URLSearchParams(search);
  const q = firstText(params, "q");
  const district = firstText(params, "district");
  const arrondissement = firstText(params, "arrondissement");
  const page = parsePage(params.get("page"));

  return {
    ...(q === undefined ? {} : { q }),
    ...(district === undefined ? {} : { district }),
    ...(arrondissement === undefined ? {} : { arrondissement }),
    page,
  };
}

export function serializeDiscoveryUrlState(state: DiscoveryUrlState): string {
  const normalized = normalizeState(state);
  const params = new URLSearchParams();

  if (normalized.q !== undefined) {
    params.set("q", normalized.q);
  }
  if (normalized.district !== undefined) {
    params.set("district", normalized.district);
  }
  if (normalized.arrondissement !== undefined) {
    params.set("arrondissement", normalized.arrondissement);
  }
  if (normalized.page !== defaultPage) {
    params.set("page", String(normalized.page));
  }

  const serialized = params.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

export function buildPharmacyListRequest(state: DiscoveryUrlState): {
  url: string;
  init: RequestInit;
} {
  const normalized = normalizeState(state);
  const params = new URLSearchParams();

  if (normalized.q !== undefined) {
    params.set("q", normalized.q);
  }
  if (normalized.district !== undefined) {
    params.set("district", normalized.district);
  }
  if (normalized.arrondissement !== undefined) {
    params.set("arrondissement", normalized.arrondissement);
  }
  params.set("page", String(normalized.page));
  params.set("pageSize", String(defaultPageSize));

  return {
    url: `/api/v1/pharmacies?${params.toString()}`,
    init: { method: "GET" },
  };
}
