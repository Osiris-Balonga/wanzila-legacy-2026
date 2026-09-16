import { describe, expect, it } from "vitest";

const discoveryUrlStateModule = "./discovery-url-state.js";

type DiscoveryUrlState = {
  q?: string;
  district?: string;
  arrondissement?: string;
  page: number;
};

type PharmacyListRequest = {
  url: string;
  init: RequestInit;
};

type DiscoveryUrlStateApi = {
  parseDiscoveryUrlState: (search: string) => DiscoveryUrlState;
  serializeDiscoveryUrlState: (state: DiscoveryUrlState) => string;
  buildPharmacyListRequest: (state: DiscoveryUrlState) => PharmacyListRequest;
};

function isDiscoveryUrlStateApi(value: unknown): value is DiscoveryUrlStateApi {
  return (
    typeof value === "object" &&
    value !== null &&
    "parseDiscoveryUrlState" in value &&
    typeof value.parseDiscoveryUrlState === "function" &&
    "serializeDiscoveryUrlState" in value &&
    typeof value.serializeDiscoveryUrlState === "function" &&
    "buildPharmacyListRequest" in value &&
    typeof value.buildPharmacyListRequest === "function"
  );
}

async function loadDiscoveryUrlStateApi(): Promise<DiscoveryUrlStateApi> {
  let candidate: unknown;

  try {
    candidate = await import(/* @vite-ignore */ discoveryUrlStateModule);
  } catch (error) {
    throw new Error(
      "Issue #6 needs the URL-state codec and deterministic pharmacy-list request builder.",
      { cause: error },
    );
  }

  if (!isDiscoveryUrlStateApi(candidate)) {
    throw new Error(
      "Issue #6 URL-state module must export parseDiscoveryUrlState, serializeDiscoveryUrlState, and buildPharmacyListRequest.",
    );
  }

  return candidate;
}

describe("issue #6 discovery URL state", () => {
  it("strictly parses and serializes a shareable filter state", async () => {
    const urlState = await loadDiscoveryUrlStateApi();
    const parsed = urlState.parseDiscoveryUrlState(
      "?q=Pharmacie%20de%20la%20Paix&district=Plateau&arrondissement=Poto-Poto&page=2",
    );

    expect(parsed).toEqual({
      q: "Pharmacie de la Paix",
      district: "Plateau",
      arrondissement: "Poto-Poto",
      page: 2,
    });
    expect(urlState.serializeDiscoveryUrlState(parsed)).toBe(
      "?q=Pharmacie+de+la+Paix&district=Plateau&arrondissement=Poto-Poto&page=2",
    );
  });

  it("drops malformed URL values and safely falls back to the first page", async () => {
    const urlState = await loadDiscoveryUrlStateApi();

    expect(() =>
      urlState.parseDiscoveryUrlState(
        `?q=%20%20&district=${"x".repeat(121)}&arrondissement=%20&page=0`,
      ),
    ).not.toThrow();
    expect(
      urlState.parseDiscoveryUrlState(
        `?q=%20%20&district=${"x".repeat(121)}&arrondissement=%20&page=0`,
      ),
    ).toEqual({ page: 1 });
    expect(urlState.parseDiscoveryUrlState("?page=1.5&q=%E0%A4%A")).toEqual({
      page: 1,
    });
  });

  it("normalizes whitespace, omits defaults, and never serializes unknown state", async () => {
    const urlState = await loadDiscoveryUrlStateApi();

    expect(
      urlState.serializeDiscoveryUrlState({
        q: "  Pharmacie Centrale  ",
        district: " Plateau ",
        arrondissement: " Poto-Poto ",
        page: 1,
      }),
    ).toBe("?q=Pharmacie+Centrale&district=Plateau&arrondissement=Poto-Poto");
    expect(urlState.serializeDiscoveryUrlState({ page: 1 })).toBe("");
  });

  it("builds the #4 request in a deterministic contract order", async () => {
    const urlState = await loadDiscoveryUrlStateApi();
    const request = urlState.buildPharmacyListRequest({
      q: "Pharmacie Centrale",
      district: "Plateau",
      arrondissement: "Poto-Poto",
      page: 2,
    });

    expect(request.url).toBe(
      "/api/v1/pharmacies?q=Pharmacie+Centrale&district=Plateau&arrondissement=Poto-Poto&page=2&pageSize=20",
    );
    expect(request.init.method).toBe("GET");
  });

  it("keeps URL restoration independent from duty-state calculation in the browser", async () => {
    const urlState = await loadDiscoveryUrlStateApi();
    const restored = urlState.parseDiscoveryUrlState(
      "?q=Alpha&district=Plateau&arrondissement=Poto-Poto&page=3",
    );

    expect(urlState.serializeDiscoveryUrlState(restored)).toBe(
      "?q=Alpha&district=Plateau&arrondissement=Poto-Poto&page=3",
    );
    expect(urlState.buildPharmacyListRequest(restored).url).toContain(
      "page=3&pageSize=20",
    );
  });

  it("canonicalizes unknown and repeated query parameters deterministically", async () => {
    const urlState = await loadDiscoveryUrlStateApi();
    const parsed = urlState.parseDiscoveryUrlState(
      "?q=Alpha&q=Beta&district=Plateau&debug=true&page=2&page=3",
    );

    expect(parsed).toEqual({ q: "Alpha", district: "Plateau", page: 2 });
    expect(urlState.serializeDiscoveryUrlState(parsed)).toBe(
      "?q=Alpha&district=Plateau&page=2",
    );
  });
});
