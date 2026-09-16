import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminShell } from "../../layouts/AdminShell.js";
import {
  analyticsOverviewFixture,
  type AnalyticsOverviewFixture,
  type AnalyticsWindow,
} from "./testing/analytics-fixtures.js";

type PageState =
  | { status: "loading" }
  | { status: "success"; overview: AnalyticsOverviewFixture["data"] }
  | { status: "empty"; overview: AnalyticsOverviewFixture["data"] }
  | { status: "error" };
type PageProps = {
  state: PageState;
  window: AnalyticsWindow;
  onWindowChange: (value: AnalyticsWindow) => void;
  onRetry: () => void;
};
type PageName = "AdminDashboardPage" | "AdminDataQualityPage";

async function renderPage(name: PageName, state: PageState): Promise<string> {
  // The GREEN component does not exist yet; keep RED typecheckable.
  const modulePath = "./AdminAnalyticsPage.js";
  const pages = (await import(modulePath)) as Record<
    PageName,
    ComponentType<PageProps>
  >;
  return renderToStaticMarkup(
    createElement(pages[name], {
      state,
      window: "7d",
      onWindowChange: vi.fn(),
      onRetry: vi.fn(),
    }),
  );
}

describe("issue #55 analytics dashboard component contract (RED)", () => {
  it("replaces the /admin placeholder with the dashboard page heading", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminShell, { pathname: "/admin" }),
    );
    expect(/<h1[^>]*>(.*?)<\/h1>/.exec(markup)?.[1]).toBe("Dashboard");
  });

  it("renders six event-count KPIs, a textual funnel and the real top-pharmacy list", async () => {
    const overview = analyticsOverviewFixture().data;
    const markup = await renderPage("AdminDashboardPage", {
      status: "success",
      overview,
    });

    for (const label of [
      "Visites",
      "Recherches",
      "Fiches consultées",
      "Appels",
      "Itinéraires",
      "Confirmations d’arrivée",
    ]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("Tunnel d’activité");
    expect(markup).toMatch(/<table\b/);
    expect(markup).toContain("Pharmacie des Manguiers");
    expect(markup).toContain("Pharmacie indisponible");
    expect(markup).toContain("Bacongo");
    expect(markup).toContain("Poto-Poto");
    expect(markup).toMatch(/application[s]? de filtre/i);
    expect(markup).toMatch(/résultats vides|recherches sans résultat/i);
    expect(markup).not.toMatch(/utilisateurs uniques|arrivées vérifiées/i);
    expect(markup).not.toMatch(/vs semaine précédente|\+\d+\s*%/i);
    expect(markup).not.toMatch(/<img[^>]+(?:pharmacie|photo)/i);
  });

  it("keeps map and alert regions honest where #54 only supplies top-five coordinates and aggregate counts", async () => {
    const markup = await renderPage("AdminDashboardPage", {
      status: "success",
      overview: analyticsOverviewFixture().data,
    });

    expect(markup).toContain("Carte d’activité");
    expect(markup).toContain("Pharmacie des Manguiers");
    expect(markup).toMatch(/alertes|actions à traiter/i);
    expect(markup).toContain("3 contributions en attente");
    expect(markup).toContain("2 signalements non résolus");
    expect(markup).toMatch(/activité cartographique (?:partielle|limitée)/i);
    expect(markup).not.toMatch(
      /carte de chaleur|heatmap|position utilisateur/i,
    );
    expect(markup).not.toContain("12 contributions en attente");
  });

  it("exposes loading, empty and retryable error states without fake charts", async () => {
    const loading = await renderPage("AdminDashboardPage", {
      status: "loading",
    });
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('role="status"');

    const empty = await renderPage("AdminDashboardPage", {
      status: "empty",
      overview: analyticsOverviewFixture("7d", true).data,
    });
    expect(empty).toMatch(/aucune activité|aucun événement/i);
    expect(empty).not.toContain("Pharmacie Jagger");
    expect(empty).not.toContain("87%");

    const error = await renderPage("AdminDashboardPage", { status: "error" });
    expect(error).toContain('role="alert"');
    expect(error).toContain("Réessayer");
  });
});

describe("issue #55 data-quality component contract (RED)", () => {
  it("replaces the /admin/qualite placeholder with its quality heading", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminShell, { pathname: "/admin/qualite" }),
    );
    expect(/<h1[^>]*>(.*?)<\/h1>/.exec(markup)?.[1]).toBe(
      "Sources &amp; qualité des données",
    );
  });

  it("presents actual quality aggregates and explicitly unavailable source/anomaly details", async () => {
    const markup = await renderPage("AdminDataQualityPage", {
      status: "success",
      overview: analyticsOverviewFixture().data,
    });

    expect(markup).toContain("Sources & qualité des données");
    expect(markup).toContain("Sources de planning");
    expect(markup).toContain("Couverture des gardes");
    expect(markup).toContain("Qualité des données");
    expect(markup).toContain("Anomalies à traiter");
    expect(markup).toMatch(/sources à jour|sources fraîches/i);
    expect(markup).toMatch(/sources (?:en retard|périmées)/i);
    expect(markup).toMatch(/détail des sources indisponible/i);
    expect(markup).toMatch(/détail des anomalies indisponible/i);
    expect(markup).not.toMatch(/vs semaine précédente|qualité globale.*87%/i);
  });

  it("explains loading, empty and failure independently on the quality route", async () => {
    const loading = await renderPage("AdminDataQualityPage", {
      status: "loading",
    });
    expect(loading).toContain('aria-busy="true"');

    const empty = await renderPage("AdminDataQualityPage", {
      status: "empty",
      overview: analyticsOverviewFixture("7d", true).data,
    });
    expect(empty).toMatch(/aucune donnée|aucune source/i);
    expect(empty).not.toContain("87%");

    const error = await renderPage("AdminDataQualityPage", {
      status: "error",
    });
    expect(error).toContain('role="alert"');
    expect(error).toContain("Réessayer");
  });
});
