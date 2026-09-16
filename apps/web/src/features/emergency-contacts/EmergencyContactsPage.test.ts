import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

type PageState =
  | { kind: "loading" }
  | {
      kind: "success";
      contacts: Array<{
        id: string;
        label: string;
        phone: string;
        position: number;
        updatedAt: string;
      }>;
    }
  | { kind: "empty" }
  | { kind: "offline" }
  | { kind: "api-error" };

type EmergencyContactsPageModule = {
  EmergencyContactsPage: ComponentType<{ state: PageState }>;
};

const contacts = [
  {
    id: "00000000-0000-4000-8000-000000001401",
    label: "SAMU",
    phone: "112",
    position: 1,
    updatedAt: "2026-09-15T08:30:45.123Z",
  },
];

async function renderPage(state: PageState): Promise<string> {
  const modulePath = "./EmergencyContactsPage.js";
  const { EmergencyContactsPage } = (await import(
    modulePath
  )) as EmergencyContactsPageModule;

  return renderToStaticMarkup(createElement(EmergencyContactsPage, { state }));
}

describe("issue #12 emergency contacts page semantics", () => {
  it("renders a labelled contact card with an explicit tel action", async () => {
    const markup = await renderPage({ kind: "success", contacts });

    expect(markup).toContain("<article");
    expect(markup).toContain(">SAMU<");
    expect(markup).toContain('href="tel:112"');
    expect(markup).toContain('aria-label="Appeler SAMU au 112"');
  });

  it("makes persisted source freshness visible instead of inventing it in the browser", async () => {
    const markup = await renderPage({ kind: "success", contacts });

    expect(markup).toContain("Mis à jour le");
    expect(markup).toContain('datetime="2026-09-15T08:30:45.123Z"');
  });

  it("presents a non-medical disclaimer without promising availability or a response", async () => {
    const markup = await renderPage({ kind: "success", contacts });

    expect(markup).toMatch(/ne remplace pas.*services d’urgence/i);
    expect(markup).not.toMatch(
      /diagnostic|réponse garantie|disponibilité garantie/i,
    );
  });

  it("communicates loading accessibly", async () => {
    const markup = await renderPage({ kind: "loading" });

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
  });

  it.each([
    ["empty", "Aucun contact d’urgence n’est disponible"],
    ["offline", "Impossible de joindre le service"],
    ["api-error", "Les contacts d’urgence sont indisponibles"],
  ] as const)("explains the %s state safely", async (kind, message) => {
    const markup = await renderPage({ kind });

    expect(markup).toContain('role="status"');
    expect(markup).toContain(message);
    expect(markup).not.toMatch(
      /diagnostic|réponse garantie|disponibilité garantie/i,
    );
  });
});
