import { expect, test } from "@playwright/test";

const pharmacy = {
  id: "00000000-0000-4000-8000-000000009501",
  name: "Pharmacie Jagger",
  address: {
    line: "12 avenue de la Paix",
    district: "Bacongo",
    arrondissement: "Bacongo",
  },
  phone: "+242060001234",
  coordinates: { latitude: -4.263708, longitude: 15.242885 },
  status: "PUBLISHED",
  createdAt: "2026-09-15T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z",
};

const pharmacyNames = [
  "Pharmacie Jagger",
  "Pharmacie de la Paix",
  "Pharmacie Saint Michel",
  "Pharmacie du Marché",
  "Pharmacie Vigny",
  "Pharmacie de l’Amitié",
  "Pharmacie Centrale",
  "Pharmacie La Grâce",
  "Pharmacie 2000",
  "Pharmacie du Peuple",
];

const pharmacies = pharmacyNames.map((name, index) => ({
  ...pharmacy,
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name,
}));

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/admin/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: pharmacies,
        pagination: { page: 1, pageSize: 20, total: 10, totalPages: 1 },
      },
    }),
  );
});

test("desktop directory preserves the reference's major regions without invented data", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/pharmacies");

  const navigation = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  await expect(
    navigation.getByRole("link", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Pharmacies" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("link", { name: "Pharmacies" }).locator("svg"),
  ).toHaveCSS("fill", "rgb(98, 39, 245)");
  await expect(page.getByRole("heading", { name: "Pharmacies" })).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Rechercher une pharmacie" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Statut" })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Arrondissement" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Source" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Statut" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Exporter" })).toBeDisabled();
  await expect(
    page.getByRole("cell", { name: "Non renseignée" }).first(),
  ).toBeVisible();
  const firstRow = page.getByRole("row", { name: /Pharmacie Jagger/ });
  await expect(firstRow.getByRole("link", { name: /Voir/ })).toHaveCount(0);
  const actions = firstRow.getByRole("button", {
    name: "Actions pour Pharmacie Jagger",
  });
  await actions.click();
  await expect(
    page.getByRole("menuitem", { name: "Voir Pharmacie Jagger" }),
  ).toHaveAttribute("href", `/admin/pharmacies/${pharmacies[0].id}`);
  await expect(
    page.getByRole("menuitem", { name: "Modifier Pharmacie Jagger" }),
  ).toHaveAttribute("href", `/admin/pharmacies/${pharmacies[0].id}/modifier`);
  const menuScreenshot = testInfo.outputPath("admin-actions-menu.png");
  await page.screenshot({ path: menuScreenshot });
  await testInfo.attach("admin-actions-menu", {
    path: menuScreenshot,
    contentType: "image/png",
  });
  await page.keyboard.press("Escape");
  await actions.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Voir Pharmacie Jagger" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  const primary = page.getByRole("link", { name: "Ajouter une pharmacie" });
  await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.getByRole("heading", { name: "Pharmacies" }).click();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 1440);
  const screenshot = testInfo.outputPath("admin-directory-1440.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach("admin-directory-1440", {
    path: screenshot,
    contentType: "image/png",
  });
  await page.setViewportSize({ width: 1586, height: 992 });
  const sourceWidthScreenshot = testInfo.outputPath("admin-directory-1586.png");
  await page.screenshot({ path: sourceWidthScreenshot, fullPage: true });
  await testInfo.attach("admin-directory-1586", {
    path: sourceWidthScreenshot,
    contentType: "image/png",
  });
});

test("narrow directory keeps the pharmacy and primary action accessible", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/pharmacies");
  await expect(page.getByRole("heading", { name: "Pharmacies" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ajouter une pharmacie" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Pharmacie Jagger/ }),
  ).toBeVisible();
  const width = await page.locator("html").evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(width.scroll).toBe(width.client);
  const screenshot = testInfo.outputPath("admin-directory-390.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach("admin-directory-390", {
    path: screenshot,
    contentType: "image/png",
  });
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 768, height: 1024 },
]) {
  test(`directory reflows without document overflow at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/admin/pharmacies");
    await expect(
      page.getByRole("heading", { name: "Pharmacies" }),
    ).toBeVisible();
    const dimensions = await page.locator("html").evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(dimensions.scroll).toBe(dimensions.client);
    const screenshot = testInfo.outputPath(
      `admin-directory-${viewport.width}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`admin-directory-${viewport.width}`, {
      path: screenshot,
      contentType: "image/png",
    });
  });
}
