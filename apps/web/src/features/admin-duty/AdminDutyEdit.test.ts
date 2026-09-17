import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminShell } from "../../layouts/AdminShell.js";

const dutyId = "00000000-0000-4000-8000-000000007301";

describe("issue #73 approved-duty edit route", () => {
  it("routes a duty edit URL to its own page inside the admin shell", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminShell, {
        pathname: `/admin/gardes/${dutyId}/modifier`,
      }),
    );

    expect(markup).toContain("Modifier une garde");
    expect(markup).toContain("Retour aux gardes");
    expect(markup).not.toContain("Fondation de l’interface");
  });
});
