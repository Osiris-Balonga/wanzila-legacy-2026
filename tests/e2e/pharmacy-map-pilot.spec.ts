import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

function capturePath(name: string): string {
  const directory = process.env.WANZILA_MAP_CAPTURE_DIR;
  return directory ? resolve(directory, name) : test.info().outputPath(name);
}

const pharmacy = (
  id: string,
  name: string,
  latitude: number,
  longitude: number,
) => ({
  id,
  name,
  address: {
    line: "Avenue des Trois Martyrs",
    district: "Bacongo",
    arrondissement: "Bacongo",
  },
  phone: "+242060001234",
  coordinates: { latitude, longitude },
  currentDuty: {
    state: "ACTIVE",
    startsAt: "2026-09-16T08:00:00.000Z",
    endsAt: "2026-09-17T07:00:00.000Z",
    sourceFreshness: "FRESH",
    source: {
      name: "Ordre national des pharmaciens",
      observedAt: "2026-09-16T08:30:00.000Z",
    },
  },
});

test.beforeEach(async ({ page }) => {
  if (process.env.WANZILA_LIVE_MAP !== "1") {
    await page.route("https://tiles.openfreemap.org/planet", (route) =>
      route.fulfill({
        json: {
          tilejson: "3.0.0",
          tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"],
          minzoom: 0,
          maxzoom: 14,
          bounds: [-180, -85, 180, 85],
          vector_layers: [],
        },
      }),
    );
    await page.route("https://tiles.openfreemap.org/test/**", (route) =>
      route.fulfill({ body: "", contentType: "application/x-protobuf" }),
    );
  }
  await page.route("**/api/v1/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: [
          pharmacy(
            "00000000-0000-4000-8000-000000000101",
            "Pharmacie Jagger",
            -4.273,
            15.245,
          ),
          pharmacy(
            "00000000-0000-4000-8000-000000000102",
            "Pharmacie Centrale",
            -4.267,
            15.253,
          ),
        ],
        pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
    }),
  );
  await page.route("**/api/v1/analytics/events", (route) =>
    route.fulfill({ status: 202, json: { data: {} } }),
  );
});

test("the mobile map presents reference regions and synchronizes marker/list selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#map");
  await expect(
    page.getByRole("region", { name: "Carte des pharmacies" }),
  ).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(
    page.getByRole("searchbox", {
      name: "Rechercher une pharmacie, un quartier",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pharmacie Jagger sur la carte" }),
  ).toBeVisible();
  await expect(page.locator(".pharmacy-map__canvas")).toHaveAttribute(
    "data-map-status",
    "ready",
  );
  await expect(
    page.getByRole("link", { name: "OpenStreetMap contributors" }),
  ).toBeVisible();
  const attribution = await page
    .locator(".maplibregl-ctrl-attrib")
    .boundingBox();
  const bottomNavigation = await page
    .getByRole("navigation", { name: "Navigation de la carte" })
    .boundingBox();
  expect(
    attribution &&
      bottomNavigation &&
      attribution.y + attribution.height <= bottomNavigation.y,
  ).toBe(true);
  if (process.env.WANZILA_LIVE_MAP === "1") {
    await page.screenshot({
      path: capturePath("map-pilot-390.png"),
    });
  }
  await page
    .getByRole("button", { name: "Pharmacie Jagger sur la carte" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pharmacie Jagger" }),
  ).toBeVisible();
  if (process.env.WANZILA_LIVE_MAP === "1") {
    await page.screenshot({
      path: capturePath("map-pilot-selected-390.png"),
    });
  }
  await expect(page.getByRole("link", { name: "Appeler" })).toHaveAttribute(
    "href",
    "tel:+242060001234",
  );
  await page.getByRole("button", { name: "Liste" }).click();
  await expect(
    page.getByRole("list", { name: "Résultats de pharmacies de garde" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Pharmacie Jagger" }),
  ).toHaveAttribute("data-selected", "true");
  await page
    .getByRole("listitem")
    .filter({ hasText: "Pharmacie Centrale" })
    .getByRole("button", { name: "Voir sur la carte" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pharmacie Centrale" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Liste" }).click();
  await page.getByRole("button", { name: "Carte", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pharmacie Centrale" }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Rechercher une pharmacie, un quartier" })
    .fill("Jagger");
  await page.getByRole("button", { name: "Lancer la recherche" }).click();
  await expect(page).toHaveURL(/\?q=Jagger.*#map$/);
  await expect(
    page.getByRole("region", { name: "Carte des pharmacies" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Quartier" })
    .selectOption("Bacongo");
  await expect(page).toHaveURL(/district=Bacongo.*#map$/);
  const dimensions = await page.locator("html").evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(dimensions.scroll).toBe(dimensions.client);
});

test("map controls remain usable at narrow, tablet and desktop widths", async ({
  page,
}) => {
  await page.goto("/#map");
  await expect(page.locator(".pharmacy-map__canvas")).toHaveAttribute(
    "data-map-status",
    "ready",
  );
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("searchbox", {
        name: "Rechercher une pharmacie, un quartier",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Liste" })).toBeVisible();
    const dimensions = await page.locator("html").evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(dimensions.scroll, `horizontal overflow at ${width}px`).toBe(
      dimensions.client,
    );
  }
});

test("provider failure leaves a useful map-to-list path", async ({ page }) => {
  await page.route("**/maps/wanzila-style.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/#map");
  await expect(
    page.getByText("Fond de carte indisponible.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Liste" }).click();
  await expect(
    page.getByRole("list", { name: "Résultats de pharmacies de garde" }),
  ).toBeVisible();
});

test("invalid coordinates never create a marker but remain in the list", async ({
  page,
}) => {
  await page.route("**/api/v1/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: [
          pharmacy(
            "00000000-0000-4000-8000-000000000103",
            "Pharmacie sans point",
            95,
            15.25,
          ),
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.goto("/#map");
  await expect(
    page.getByRole("button", { name: "Pharmacie sans point sur la carte" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Liste" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Pharmacie sans point" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Voir sur la carte" }),
  ).toHaveCount(0);
});

test("loading and empty results have visible map states", async ({ page }) => {
  await page.route("**/api/v1/pharmacies?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      json: {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    });
  });
  await page.goto("/#map");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Recherche des pharmacies de garde" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Aucune pharmacie trouvée" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Liste" }).click();
  await expect(
    page.getByText("Aucune pharmacie trouvée").first(),
  ).toBeVisible();
});
