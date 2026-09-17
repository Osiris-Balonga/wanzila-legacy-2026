import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const id = "00000000-0000-4000-8000-000000000007";
const pharmacy = {
  id,
  name: "Pharmacie Jagger",
  address: {
    line: "Avenue des Trois Martyrs",
    district: "Poto-Poto",
    arrondissement: "Poto-Poto",
  },
  phone: "+242067324518",
  coordinates: { latitude: -4.2636, longitude: 15.2429 },
  currentDuty: {
    state: "ACTIVE",
    startsAt: "2026-09-16T08:00:00.000Z",
    endsAt: "2026-09-17T07:00:00.000Z",
    sourceFreshness: "FRESH",
    source: { name: "Source de test", observedAt: "2026-09-16T10:00:00.000Z" },
  },
};

test.use({
  locale: "fr-FR",
  timezoneId: "Africa/Brazzaville",
  reducedMotion: "reduce",
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00.000Z"));
  if (process.env.WANZILA_DETAIL_LIVE_MAP !== "1") {
    await page.route("**/maps/wanzila-style.json", (route) =>
      route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#f4f5ff" },
            },
          ],
        },
      }),
    );
  }
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({ json: { data: pharmacy } }),
  );
  await page.route("**/api/v1/analytics/events", (route) =>
    route.fulfill({ status: 202, json: { data: {} } }),
  );
});

test("detail-to-call is explicit, keyboard reachable and tracked", async ({
  page,
}) => {
  const events: Array<{ name: string; properties: unknown }> = [];
  await page.route("**/api/v1/analytics/events", async (route) => {
    const payload: unknown = route.request().postDataJSON();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "name" in payload &&
      "properties" in payload
    ) {
      events.push({
        name: String(payload.name),
        properties: payload.properties,
      });
    }
    await route.fulfill({ status: 202, json: { data: {} } });
  });
  await page.goto(`/pharmacies/${id}`);
  await expect(
    page.getByRole("heading", { name: pharmacy.name }),
  ).toBeVisible();
  await expect(page.getByText("De garde actuellement")).toBeVisible();
  await expect(page.getByText(/Source de test/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Appeler" })).toHaveAttribute(
    "href",
    `tel:${pharmacy.phone}`,
  );
  await expect(page.getByRole("link", { name: "Itinéraire" })).toHaveAttribute(
    "href",
    `/pharmacies/${id}/itineraire`,
  );
  await expect(page.getByRole("button", { name: "Enregistrer" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Signaler un problème" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Signalement bientôt disponible/)).toHaveCount(0);
  expect(events.map((event) => event.name)).toContain("pharmacy_detail_viewed");
  expect(events.map((event) => event.name)).not.toContain(
    "pharmacy_call_started",
  );
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Retour à la carte" }),
  ).toBeFocused();
  for (const control of [
    page.getByRole("button", { name: "Lancer la recherche" }),
    page.getByRole("searchbox", {
      name: "Rechercher une pharmacie, un quartier",
    }),
    page.getByRole("link", { name: "Gardes indiquées" }),
    page.getByRole("link", { name: "Quartier : Poto-Poto" }),
    page.getByRole("link", { name: "Arrondissement : Poto-Poto" }),
    page.getByRole("link", { name: "Itinéraire" }),
    page.getByRole("link", { name: "Appeler" }),
  ]) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
  }
  await page.getByRole("link", { name: "Appeler" }).click();
  await expect
    .poll(() => events.map((event) => event.name))
    .toContain("pharmacy_call_started");
  expect(events.at(-1)?.properties).toEqual({ pharmacyId: id });
});

test("missing optional data and uncertain duty never imply availability", async ({
  page,
}) => {
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({
      json: {
        data: {
          ...pharmacy,
          phone: undefined,
          currentDuty: {
            ...pharmacy.currentDuty,
            sourceFreshness: "STALE",
            source: undefined,
          },
        },
      },
    }),
  );
  await page.goto(`/pharmacies/${id}`);
  await expect(page.getByText(/garde à confirmer/i)).toBeVisible();
  await expect(page.getByText(/source ancienne/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Appeler" })).toBeDisabled();
  await expect(page.getByText(/distance/i)).toHaveCount(0);
  await expect(page.getByText(/paiement/i)).toHaveCount(0);
  await expect(
    page.getByText("Source et vérification de la fiche non renseignées"),
  ).toBeVisible();
});

test("verified photo and record source appear only when provided", async ({
  page,
}) => {
  await page.route("**/pharmacy-photos/verified-test.webp", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="#008d5b"/></svg>',
    }),
  );
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({
      json: {
        data: {
          ...pharmacy,
          photo: {
            assetPath: "/pharmacy-photos/verified-test.webp",
            source: "Photographe autorisé",
            credit: "Équipe Wanzila",
            rights: "Accord documenté",
            verifiedAt: "2026-09-15T12:00:00.000Z",
          },
          recordProvenance: {
            source: "Vérification de terrain",
            verifiedAt: "2026-09-15T12:00:00.000Z",
          },
        },
      },
    }),
  );
  await page.goto(`/pharmacies/${id}`);
  const image = page.getByRole("img", {
    name: `Photo vérifiée de ${pharmacy.name}`,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.getByText(/Photo : Équipe Wanzila/)).toBeVisible();
  await expect(
    page.getByText(/Source : Vérification de terrain/),
  ).toBeVisible();
  await expect(
    page.getByText("Source et vérification de la fiche non renseignées"),
  ).toHaveCount(0);
});

test("loading, not-found and retryable errors use the detail surface", async ({
  page,
}) => {
  await page.route(`**/api/v1/pharmacies/${id}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Not found" } },
    });
  });
  await page.goto(`/pharmacies/${id}`);
  await expect(
    page.getByRole("status", { name: "Chargement de la pharmacie" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pharmacie introuvable" }),
  ).toBeVisible();
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({ json: { data: pharmacy } }),
  );
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(
    page.getByRole("heading", { name: pharmacy.name }),
  ).toBeVisible();
});

test("detail has no horizontal overflow at required widths and copy is accessible", async ({
  page,
}, testInfo) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/pharmacies/${id}`);
  if (process.env.WANZILA_DETAIL_LIVE_MAP === "1") {
    await expect(page.locator(".pharmacy-detail-map__canvas")).toHaveAttribute(
      "data-map-status",
      "ready",
      { timeout: 30000 },
    );
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: pharmacy.name }),
    ).toBeVisible();
    const dimensions = await page.locator("html").evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(dimensions.scroll, `overflow at ${width}px`).toBe(dimensions.client);
    const fullPagePath = process.env.WANZILA_DETAIL_CAPTURE_DIR
      ? resolve(process.env.WANZILA_DETAIL_CAPTURE_DIR, `detail-${width}.png`)
      : width === 390
        ? testInfo.outputPath("visual-evidence", "pharmacy-detail-390.png")
        : testInfo.outputPath(`detail-${width}.png`);
    if (width === 390 && !process.env.WANZILA_DETAIL_CAPTURE_DIR) {
      await mkdir(testInfo.outputPath("visual-evidence"), { recursive: true });
    }
    await page.screenshot({
      path: fullPagePath,
      fullPage: true,
      animations: "disabled",
    });
    await page.screenshot({
      path: process.env.WANZILA_DETAIL_CAPTURE_DIR
        ? resolve(
            process.env.WANZILA_DETAIL_CAPTURE_DIR,
            `detail-${width}-viewport.png`,
          )
        : testInfo.outputPath(`detail-${width}-viewport.png`),
      animations: "disabled",
    });
  }
  await expect(
    page.getByRole("button", { name: "Copier l’adresse" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Copier les coordonnées" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Copier l’adresse" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Adresse copiée" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    pharmacy.address.line,
  );
  await page.getByRole("button", { name: "Copier les coordonnées" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Coordonnées copiées" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "-4.2636, 15.2429",
  );
});

test("missing duty and invalid coordinates remain explicit", async ({
  page,
}) => {
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({
      json: {
        data: {
          ...pharmacy,
          currentDuty: undefined,
          coordinates: { latitude: 95, longitude: 15.2429 },
        },
      },
    }),
  );
  await page.goto(`/pharmacies/${id}`);
  await expect(page.getByText("Garde non confirmée")).toBeVisible();
  await expect(
    page.getByText(/coordonnées absentes ou invalides/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copier les coordonnées" }),
  ).toHaveCount(0);
});

test("unknown source is uncertain even with an active duty period", async ({
  page,
}) => {
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({
      json: {
        data: {
          ...pharmacy,
          currentDuty: { ...pharmacy.currentDuty, sourceFreshness: "UNKNOWN" },
        },
      },
    }),
  );
  await page.goto(`/pharmacies/${id}`);
  await expect(page.getByText("Garde à confirmer")).toBeVisible();
  await expect(
    page.getByText(/fraîcheur de la source inconnue/i),
  ).toBeVisible();
  await expect(page.getByText("De garde actuellement")).toHaveCount(0);
});

test("map header search and chips hand off to real discovery query and filters", async ({
  page,
}) => {
  await page.route("**/api/v1/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: [pharmacy],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.goto(`/pharmacies/${id}`);
  const search = page.getByRole("searchbox", {
    name: "Rechercher une pharmacie, un quartier",
  });
  await search.fill("  Jagger  ");
  const searchRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/v1/pharmacies?") &&
      new URL(request.url()).searchParams.get("q") === "Jagger",
  );
  await search.press("Enter");
  await searchRequest;
  await expect(page).toHaveURL(/\/\?q=Jagger$/);
  await expect(
    page.getByRole("region", { name: "Carte des pharmacies" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", {
      name: "Rechercher une pharmacie, un quartier",
    }),
  ).toHaveValue("Jagger");

  await page.goto(`/pharmacies/${id}`);
  const districtRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/v1/pharmacies?") &&
      new URL(request.url()).searchParams.get("district") === "Poto-Poto",
  );
  await page.getByRole("link", { name: "Quartier : Poto-Poto" }).click();
  await districtRequest;
  await expect(page).toHaveURL(/\/\?district=Poto-Poto$/);
  await expect(
    page.getByRole("region", { name: "Carte des pharmacies" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Quartier" })).toHaveValue(
    "Poto-Poto",
  );

  await page.goto(`/pharmacies/${id}`);
  const arrondissementRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/v1/pharmacies?") &&
      new URL(request.url()).searchParams.get("arrondissement") === "Poto-Poto",
  );
  await page.getByRole("link", { name: "Arrondissement : Poto-Poto" }).click();
  await arrondissementRequest;
  await expect(page).toHaveURL(/\/\?arrondissement=Poto-Poto$/);
  await expect(
    page.getByRole("combobox", { name: "Arrondissement" }),
  ).toHaveValue("Poto-Poto");

  await page.goto(`/pharmacies/${id}`);
  await page.getByRole("link", { name: "Gardes indiquées" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
});

test("the selected point keeps the API name visible and the lower actions clear the fixed nav", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/pharmacies/${id}`);
  await expect(page.locator(".pharmacy-detail-map__label")).toHaveText(
    pharmacy.name,
  );
  await expect(page.locator(".pharmacy-detail-map__label")).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const copy = page.getByRole("button", { name: "Copier les coordonnées" });
  const nav = page.getByRole("navigation", { name: "Navigation publique" });
  const copyBox = await copy.boundingBox();
  const navBox = await nav.boundingBox();
  expect(copyBox && navBox && copyBox.y + copyBox.height <= navBox.y).toBe(
    true,
  );
  await copy.click({ trial: true });
  await page.screenshot({
    path: testInfo.outputPath("detail-390-bottom.png"),
    animations: "disabled",
  });
  await copy.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Coordonnées copiées" }),
  ).toBeVisible();
});
