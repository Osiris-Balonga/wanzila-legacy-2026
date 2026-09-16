import type { PharmacyListResponse } from "@wanzila/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DiscoveryPage } from "./DiscoveryPage.js";

const pharmacyId = "00000000-0000-4000-8000-000000000006";

type DiscoveryLoadState =
  | { status: "loading" }
  | { status: "success"; response: PharmacyListResponse }
  | { status: "empty"; response: PharmacyListResponse }
  | { status: "invalid-filter"; message: string }
  | {
      status: "error";
      code: "NETWORK_ERROR" | "API_ERROR" | "INVALID_RESPONSE";
    }
  | { status: "uncertain-data"; response: PharmacyListResponse };

function response(sourceFreshness: "FRESH" | "STALE" | "UNKNOWN" = "FRESH") {
  return {
    data: [
      {
        id: pharmacyId,
        name: "Pharmacie Centrale",
        address: {
          line: "12 avenue de la Paix",
          district: "Plateau",
          arrondissement: "Poto-Poto",
        },
        coordinates: { latitude: -4.2634, longitude: 15.2429 },
        currentDuty: {
          state: "ACTIVE" as const,
          startsAt: "2026-09-15T08:00:00.000Z",
          endsAt: "2026-09-16T08:00:00.000Z",
          sourceFreshness,
          source: {
            name: "Ordre national des pharmaciens",
            observedAt: "2026-09-15T08:30:00.000Z",
          },
        },
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } satisfies PharmacyListResponse;
}

function renderPage(state: DiscoveryLoadState, filters = { page: 1 }) {
  const onRetry = vi.fn();

  return Promise.resolve(
    renderToStaticMarkup(
      createElement(DiscoveryPage, { filters, onRetry, state }),
    ),
  );
}

describe("issue #6 discovery page accessibility and content", () => {
  it("provides the mobile-reference search and filter landmarks without a map-only dependency", async () => {
    const markup = await renderPage({
      status: "success",
      response: response(),
    });

    expect(markup).toContain("<main");
    expect(markup).toContain("Pharmacies de garde");
    expect(markup).toContain('role="search"');
    expect(markup).toContain('for="discovery-search"');
    expect(markup).toContain('id="discovery-search"');
    expect(markup).toContain("Rechercher une pharmacie, un quartier");
    expect(markup).toContain('for="discovery-district"');
    expect(markup).toContain('for="discovery-arrondissement"');
    expect(markup).toContain("Ouvertes maintenant");
    expect(markup).not.toContain("<canvas");
    expect(markup).not.toContain("Géolocaliser");
    expect(markup).not.toContain("Itinéraire");
  });

  it("renders only API-provided active pharmacies with address, administrative context, active-until, and freshness", async () => {
    const markup = await renderPage({
      status: "success",
      response: response(),
    });

    expect(markup).toContain("Pharmacie Centrale");
    expect(markup).toContain("12 avenue de la Paix");
    expect(markup).toContain("Plateau");
    expect(markup).toContain("Poto-Poto");
    expect(markup).toContain("16 septembre 2026");
    expect(markup).toContain("Ordre national des pharmaciens");
    expect(markup).toContain(
      'href="/pharmacies/00000000-0000-4000-8000-000000000006"',
    );
    expect(markup).toContain('aria-live="polite"');
  });

  it("makes loading, empty, invalid-filter, and failure states understandable and recoverable", async () => {
    await expect(renderPage({ status: "loading" })).resolves.toContain(
      'aria-busy="true"',
    );
    await expect(
      renderPage({
        status: "empty",
        response: {
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      }),
    ).resolves.toContain('role="alert"');
    await expect(
      renderPage({ status: "invalid-filter", message: "Filtre invalide" }),
    ).resolves.toContain('aria-invalid="true"');
    await expect(
      renderPage({ status: "error", code: "NETWORK_ERROR" }),
    ).resolves.toMatch(
      /role="alert"[\s\S]*Réessayer|Réessayer[\s\S]*role="alert"/,
    );
  });

  it("keeps uncertain source data visibly qualified rather than guaranteeing availability", async () => {
    const markup = await renderPage({
      status: "uncertain-data",
      response: response("UNKNOWN"),
    });

    expect(markup).toContain("Informations à vérifier");
    expect(markup).toContain("Données de source inconnue");
    expect(markup).not.toContain("Disponibilité garantie");
  });
});
