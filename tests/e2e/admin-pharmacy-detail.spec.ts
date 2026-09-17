import { expect, test, type Page } from "@playwright/test";

const pharmacy = {
  id: "00000000-0000-4000-8000-000000009501",
  name: "Pharmacie Jagger",
  address: {
    line: "12 avenue de la Paix",
    district: "Bacongo",
    arrondissement: "1er arrondissement",
  },
  phone: "+242060001234",
  coordinates: { latitude: -4.263708, longitude: 15.242885 },
  status: "DRAFT",
  createdAt: "2026-09-15T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z",
};

async function mockDetail(
  page: Page,
  options: { status?: number; body?: unknown; hold?: Promise<void> } = {},
) {
  if (!process.env.WANZILA_LIVE_MAP) {
    await page.route("**/maps/wanzila-style.json", (route) =>
      route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "ground",
              type: "background",
              paint: { "background-color": "#edf0f8" },
            },
          ],
        },
      }),
    );
  }
  await page.route(
    `**/api/v1/admin/pharmacies/${pharmacy.id}`,
    async (route) => {
      await options.hold;
      await route.fulfill({
        status: options.status ?? 200,
        json: options.body ?? { data: pharmacy },
      });
    },
  );
  await page.route(
    `**/api/v1/admin/pharmacies/${pharmacy.id}/publish`,
    (route) =>
      route.fulfill({ json: { data: { ...pharmacy, status: "PUBLISHED" } } }),
  );
  await page.route(
    `**/api/v1/admin/pharmacies/${pharmacy.id}/archive`,
    (route) =>
      route.fulfill({ json: { data: { ...pharmacy, status: "ARCHIVED" } } }),
  );
}

test("detail has identity, real-contract status, information and location regions", async ({
  page,
}) => {
  await mockDetail(page);
  await page.goto(`/admin/pharmacies/${pharmacy.id}`);
  await expect(
    page.getByRole("heading", { name: "Fiche pharmacie" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: pharmacy.name }),
  ).toBeVisible();
  await expect(page.getByText("Brouillon", { exact: true })).toBeVisible();
  const information = page.getByRole("region", { name: "Informations" });
  const location = page.getByRole("region", {
    name: "Localisation",
    exact: true,
  });
  await expect(information).toBeVisible();
  await expect(location).toBeVisible();
  await expect(information).toContainText(pharmacy.address.line);
  await expect(information).toContainText(pharmacy.phone);
  await expect(information).toContainText("Aucune photo validée");
  await expect(information).toContainText("Non renseignée");
  await expect(
    location.getByRole("link", { name: "Voir l’itinéraire" }),
  ).toHaveAttribute("href", /google\.com\/maps\/dir/);
  await expect(
    location.getByLabel("Carte de localisation de Pharmacie Jagger"),
  ).toBeVisible();
  await expect(location.locator(".admin-detail__map-pin")).toBeVisible();
  if (!process.env.WANZILA_LIVE_MAP) {
    await expect(location.locator(".admin-detail__map")).toHaveAttribute(
      "data-map-status",
      "ready",
    );
  }
  await expect(page.getByText("Active", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Contribution citoyenne")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Historique et dernières activités" }),
  ).toContainText("Historique indisponible");
  await expect(
    page.getByRole("region", { name: "Statistiques rapides" }),
  ).toContainText("Statistiques indisponibles");
  await expect(page.getByText("482", { exact: true })).toHaveCount(0);
});

test("admin detail distinguishes verified record source from photo rights", async ({
  page,
}) => {
  await page.route("**/pharmacy-photos/admin-test.webp", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="#008d5b"/></svg>',
    }),
  );
  await mockDetail(page, {
    body: {
      data: {
        ...pharmacy,
        photo: {
          assetPath: "/pharmacy-photos/admin-test.webp",
          source: "Collecte autorisée",
          credit: "Équipe Wanzila",
          rights: "Accord documenté",
          verifiedAt: "2026-09-16T10:00:00.000Z",
        },
        recordProvenance: {
          source: "Vérification de terrain",
          verifiedAt: "2026-09-16T11:00:00.000Z",
        },
      },
    },
  });
  await page.goto(`/admin/pharmacies/${pharmacy.id}`);
  const information = page.getByRole("region", { name: "Informations" });
  await expect(information).toContainText("Vérification de terrain");
  await expect(information).toContainText("Équipe Wanzila");
  await expect(information).toContainText("Accord documenté");
  await expect(
    page.getByRole("img", { name: `Photo vérifiée de ${pharmacy.name}` }),
  ).toBeVisible();
});

test("detail retains edit, publish and archive interactions", async ({
  page,
}) => {
  await mockDetail(page);
  await page.goto(`/admin/pharmacies/${pharmacy.id}`);
  await expect(page.getByRole("link", { name: "Modifier" })).toHaveAttribute(
    "href",
    `/admin/pharmacies/${pharmacy.id}/modifier`,
  );
  await page.getByRole("button", { name: "Publier" }).click();
  await expect(page.getByText("Publiée", { exact: true })).toBeVisible();
  const archive = page.getByRole("button", { name: "Archiver" });
  await archive.focus();
  await expect(archive).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("alertdialog", { name: "Archiver cette pharmacie ?" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(archive).toBeFocused();
  await archive.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Archiver" })
    .click();
  await expect(page.getByText("Archivée", { exact: true })).toBeVisible();
});

test("detail offers a keyboard-reachable path to create a duty with explicit pharmacy selection", async ({
  page,
}) => {
  await mockDetail(page);
  await page.route("**/api/v1/admin/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: [pharmacy],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.route("**/api/v1/admin/sources?**", (route) =>
    route.fulfill({
      json: {
        data: [],
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.goto(`/admin/pharmacies/${pharmacy.id}`);
  const addDuty = page.getByRole("link", { name: "Ajouter une garde" });
  await expect(addDuty).toHaveAttribute("href", "/admin/gardes/nouvelle");
  await page.getByRole("button", { name: "Archiver" }).focus();
  await page.keyboard.press("Tab");
  await expect(addDuty).toBeFocused();
  expect(
    await addDuty.evaluate((element) => element.matches(":focus-visible")),
  ).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/gardes\/nouvelle$/);
  await expect(
    page.getByRole("heading", { name: "Créer une garde" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Aperçu de la garde" }),
  ).toContainText("Aucune pharmacie sélectionnée");
  await page.getByRole("combobox", { name: "Pharmacie" }).click();
  await page.getByRole("option", { name: pharmacy.name }).click();
  await expect(
    page.getByRole("complementary", { name: "Aperçu de la garde" }),
  ).toContainText(pharmacy.name);
});

test("detail distinguishes loading, not found and retryable error", async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockDetail(page, { hold });
  await page.goto(`/admin/pharmacies/${pharmacy.id}`);
  await expect(
    page.getByRole("status", { name: "Chargement de la pharmacie" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ajouter une garde" }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("heading", { name: pharmacy.name }),
  ).toBeVisible();
  await page.unrouteAll();
  await mockDetail(page, {
    status: 404,
    body: { error: { code: "NOT_FOUND", message: "Not found" } },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Pharmacie introuvable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ajouter une garde" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Retour aux pharmacies" }),
  ).toBeVisible();
  await page.unrouteAll();
  await mockDetail(page, {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "Server error" } },
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Impossible de charger");
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ajouter une garde" }),
  ).toHaveCount(0);
  await page.unrouteAll();
  await mockDetail(page, {
    status: 403,
    body: { error: { code: "FORBIDDEN", message: "Forbidden" } },
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Vous n’avez pas l’autorisation requise.",
  );
  await expect(
    page.getByRole("link", { name: "Ajouter une garde" }),
  ).toHaveCount(0);
});

test("location keeps its address available when the map provider fails", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.WANZILA_LIVE_MAP),
    "deterministic provider failure only",
  );
  await mockDetail(page);
  await page.route("**/maps/wanzila-style.json", (route) =>
    route.fulfill({ status: 500 }),
  );
  await page.goto(`/admin/pharmacies/${pharmacy.id}`);
  await expect(
    page.getByRole("region", { name: "Localisation", exact: true }),
  ).toContainText(pharmacy.address.line);
  await expect(
    page.getByRole("status").filter({ hasText: /Fond de carte indisponible/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Voir l’itinéraire" }),
  ).toHaveAttribute("href", /google\.com\/maps\/dir/);
});

for (const width of [320, 390, 768, 1440, 1586]) {
  test(`detail fits ${width}px without horizontal overflow`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 992 });
    await mockDetail(page);
    await page.goto(`/admin/pharmacies/${pharmacy.id}`);
    await expect(
      page.getByRole("link", { name: "Ajouter une garde" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Localisation", exact: true }),
    ).toBeVisible();
    if (width === 390 || width === 1440) {
      await expect(
        page.getByRole("region", { name: "Historique et dernières activités" }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Statistiques rapides" }),
      ).toBeVisible();
    }
    await expect(page.locator(".admin-detail__map")).toHaveAttribute(
      "data-map-status",
      "ready",
      { timeout: process.env.WANZILA_LIVE_MAP ? 30000 : 5000 },
    );
    const widths = await page.locator("html").evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(widths.scroll).toBe(widths.client);
    const path = testInfo.outputPath(`admin-pharmacy-detail-${width}.png`);
    await page.screenshot({ path, fullPage: true });
    await testInfo.attach(`admin-pharmacy-detail-${width}`, {
      path,
      contentType: "image/png",
    });
  });
}
