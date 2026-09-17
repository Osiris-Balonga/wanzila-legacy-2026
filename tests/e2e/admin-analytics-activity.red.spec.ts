import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { adminAnalyticsActivityResponseSchema } from "@wanzila/contracts";
import { analyticsOverviewFixture } from "../../apps/web/src/features/admin-dashboard/testing/analytics-fixtures";
import { analyticsActivityFixture } from "../../apps/web/src/features/admin-dashboard/testing/activity-fixtures";

test.use({
  locale: "fr-FR",
  timezoneId: "Africa/Brazzaville",
  reducedMotion: "reduce",
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one stable Chromium profile");
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00.000Z"));
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
});

async function mockOverview(page: Page) {
  const requests: string[] = [];
  await page.route("**/api/v1/admin/analytics/overview**", async (route) => {
    const window =
      new URL(route.request().url()).searchParams.get("window") === "30d"
        ? "30d"
        : "7d";
    requests.push(window);
    await route.fulfill({ json: analyticsOverviewFixture(window) });
  });
  return requests;
}

async function mockActivity(
  page: Page,
  options: {
    status?: number;
    malformed?: boolean;
    empty?: boolean;
    many?: boolean;
    asOf?: string;
    hold?: Promise<void>;
  } = {},
) {
  const requests: URLSearchParams[] = [];
  await page.route("**/api/v1/admin/analytics/activity**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    await options.hold;
    const window = params.get("window") === "30d" ? "30d" : "7d";
    await route.fulfill({
      status: options.status ?? 200,
      json: options.status
        ? { error: { code: "TEST_ERROR", message: "Test failure" } }
        : options.malformed
          ? { data: { version: 999 } }
          : analyticsActivityFixture(window, {
              page: Number(params.get("page")),
              empty: options.empty,
              many: options.many,
              asOf: options.asOf,
            }),
    });
  });
  return requests;
}

test("the reviewed #63 response parses and dashboard requests 7d/30d activity with an explicit map page", async ({
  page,
}) => {
  for (const window of ["7d", "30d"] as const) {
    expect(
      adminAnalyticsActivityResponseSchema.safeParse(
        analyticsActivityFixture(window),
      ).success,
    ).toBe(true);
  }
  await mockOverview(page);
  const requests = await mockActivity(page);
  await page.goto("/admin");
  await expect(
    page.getByRole("region", { name: "Indicateurs d’activité" }),
  ).toContainText(/période précédente de même durée/i);
  expect(Object.fromEntries(requests[0]!)).toEqual({
    window: "7d",
    page: "1",
    pageSize: "20",
  });
  await page.getByRole("combobox", { name: "Période" }).selectOption("30d");
  await expect.poll(() => requests.at(-1)?.get("window")).toBe("30d");
  expect(Object.fromEntries(requests.at(-1)!)).toEqual({
    window: "30d",
    page: "1",
    pageSize: "20",
  });
});

test("six KPI counts and deltas share the #63 snapshot; prior zero suppresses delta and zero change remains visible", async ({
  page,
}) => {
  await mockOverview(page);
  await mockActivity(page);
  await page.goto("/admin");
  const metrics = page.getByRole("region", { name: "Indicateurs d’activité" });
  const visits = metrics
    .locator(".analytics-metric")
    .filter({ hasText: "Visites" });
  await expect(visits).toContainText("28");
  await expect(visits).toContainText(/\+4\s*%/);
  const searches = metrics
    .locator(".analytics-metric")
    .filter({ hasText: "Recherches" });
  await expect(searches).toContainText(/−8\s*%|-8\s*%/);
  const routes = metrics
    .locator(".analytics-metric")
    .filter({ hasText: "Itinéraires" });
  await expect(routes).toContainText(/comparaison indisponible/i);
  await expect(routes).not.toContainText(/[+−-]\d+\s*%/);
  const arrivals = metrics
    .locator(".analytics-metric")
    .filter({ hasText: "Confirmations d’arrivée" });
  await expect(arrivals).toContainText(/0\s*%/);
  await expect(metrics).not.toContainText(/conversion|utilisateurs uniques/i);
});

test("matching counters do not warn merely because the two asOf instants differ by milliseconds", async ({
  page,
}) => {
  await mockOverview(page);
  await mockActivity(page, { asOf: "2026-09-16T12:00:00.025Z" });
  await page.goto("/admin");
  const metrics = page.getByRole("region", { name: "Indicateurs d’activité" });
  await expect(metrics).toContainText(/période précédente de même durée/i);
  await expect(metrics).not.toContainText(/instantanés distincts/i);
});

test("different current counters keep #63 count and delta together and identify the #54 snapshot", async ({
  page,
}) => {
  await mockOverview(page);
  await page.route("**/api/v1/admin/analytics/activity**", async (route) => {
    const fixture = analyticsActivityFixture("7d", {
      asOf: "2026-09-16T12:01:00.000Z",
    });
    fixture.data.comparisons.discovery_viewed = {
      current: 999,
      previous: 500,
      deltaPercent: 99.8,
    };
    await route.fulfill({ json: fixture });
  });
  await page.goto("/admin");
  const metrics = page.getByRole("region", { name: "Indicateurs d’activité" });
  const visits = metrics
    .locator(".analytics-metric")
    .filter({ hasText: "Visites" });
  await expect(visits).toContainText("999");
  await expect(visits).toContainText(/\+100\s*%/);
  await expect(metrics).toContainText(/instantanés distincts/i);
  await expect(metrics).toContainText(/13:01/);
  await expect(metrics).toContainText(/13:00/);
  const funnel = page.getByRole("region", { name: "Tunnel d’activité" });
  await expect(funnel).toContainText("28");
});

test("the map uses every static point on its page, count-sized markers, unmapped totals and an accessible list", async ({
  page,
}) => {
  await mockOverview(page);
  await mockActivity(page);
  await page.goto("/admin");
  const map = page.getByRole("region", { name: "Carte d’activité" });
  await expect(map).toContainText(/3 pharmacies cartographiables/i);
  await expect(map).toContainText(/2 consultations non cartographiées/i);
  await expect(map).toContainText(/1 vue|2 à 9 vues/);
  await expect(map.locator(".analytics-map-marker")).toHaveCount(3);
  const markerSizes = await map
    .locator(".analytics-map-marker")
    .evaluateAll((markers) =>
      markers.map((marker) => Math.round(marker.getBoundingClientRect().width)),
    );
  expect(markerSizes[0]).toBeGreaterThan(markerSizes[2]!);
  await expect(map).not.toContainText(/position du visiteur|carte de chaleur/i);
  const disclosure = map.getByText(/voir les pharmacies de cette page/i);
  await disclosure.click();
  const table = map.getByRole("table", {
    name: /activité des pharmacies cartographiées/i,
  });
  await expect(table).toContainText("Pharmacie Jagger");
  await expect(table).toContainText("Pharmacie de la Paix");
  await expect(table).toContainText("Pharmacie Saint Michel");
  await expect(table).toContainText(/consultations/i);
});

test("map pagination reaches the twenty-first pharmacy without suggesting a complete heatmap on page one", async ({
  page,
}) => {
  await mockOverview(page);
  const requests = await mockActivity(page, { many: true });
  await page.goto("/admin");
  const map = page.getByRole("region", { name: "Carte d’activité" });
  await expect(map).toContainText(/20 sur 21 pharmacies cartographiables/i);
  await expect(map.locator(".analytics-map-marker")).toHaveCount(20);
  await map.getByRole("button", { name: /page suivante/i }).click();
  await expect(map).toContainText(/21 sur 21 pharmacies cartographiables/i);
  await expect(map.locator(".analytics-map-marker")).toHaveCount(1);
  await map.getByText(/voir les pharmacies de cette page/i).click();
  await expect(map.getByRole("table")).toContainText(
    "Pharmacie cartographiée 21",
  );
  expect(requests.at(-1)?.get("page")).toBe("2");
  await map.getByRole("button", { name: /page précédente/i }).click();
  await expect(map.locator(".analytics-map-marker")).toHaveCount(20);
});

test("activity has one loading state and an honest zero-data state", async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockOverview(page);
  await mockActivity(page, { empty: true, hold });
  await page.goto("/admin");
  await expect(
    page.getByRole("status", { name: /chargement de l’activité/i }),
  ).toBeVisible();
  release();
  const metrics = page.getByRole("region", { name: "Indicateurs d’activité" });
  await expect(metrics).toContainText("0");
  await expect(metrics).not.toContainText(/[+−-]\d+\s*%/);
  const map = page.getByRole("region", { name: "Carte d’activité" });
  await expect(map).toContainText(/aucune pharmacie cartographiable/i);
  await expect(map.locator(".analytics-map-marker")).toHaveCount(0);
});

for (const status of [401, 403, 500] as const) {
  test(`activity endpoint gives a distinct, single ${status} access or retry state`, async ({
    page,
  }) => {
    await mockOverview(page);
    await mockActivity(page, { status });
    await page.goto("/admin");
    const alert = page.getByRole("alert");
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText(
      status === 401
        ? /connexion requise/i
        : status === 403
          ? /accès refusé/i
          : /indisponible/i,
    );
    if (status === 401) {
      await expect(
        alert.getByRole("link", { name: /connexion/i }),
      ).toHaveAttribute("href", "/admin/connexion");
    } else if (status === 500) {
      await expect(
        alert.getByRole("button", { name: /réessayer/i }),
      ).toBeVisible();
    } else {
      await expect(alert.getByRole("button")).toHaveCount(0);
    }
  });
}

test("invalid #63 JSON is rejected by Zod and can be retried", async ({
  page,
}) => {
  await mockOverview(page);
  await mockActivity(page, { malformed: true });
  await page.goto("/admin");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText(/indisponible/i);
  await expect(alert.getByRole("button", { name: /réessayer/i })).toBeVisible();
});

test("quality route never requests dashboard activity", async ({ page }) => {
  await mockOverview(page);
  const requests = await mockActivity(page);
  await page.route("**/api/v1/admin/analytics/quality**", (route) =>
    route.fulfill({ status: 500, json: { error: { code: "TEST" } } }),
  );
  await page.goto("/admin/qualite");
  await expect(
    page.getByRole("heading", { name: "Sources & qualité des données" }),
  ).toBeVisible();
  expect(requests).toHaveLength(0);
});

test("opt-in live map proof loads real OpenFreeMap vector tiles", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.WANZILA_LIVE_MAP_EVIDENCE !== "1",
    "Network-backed visual evidence is manual, not deterministic CI.",
  );
  await page.unroute("**/maps/wanzila-style.json");
  await mockOverview(page);
  await mockActivity(page);
  await page.setViewportSize({ width: 1440, height: 1024 });
  let loadedTiles = 0;
  page.on("response", (response) => {
    if (
      response.ok() &&
      response.url().startsWith("https://tiles.openfreemap.org/planet/") &&
      response.url().endsWith(".pbf")
    ) {
      loadedTiles += 1;
    }
  });
  await page.goto("/admin");
  await expect(
    page.locator('.analytics-map__canvas[data-map-status="ready"]'),
  ).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => loadedTiles, { timeout: 30_000 }).toBeGreaterThan(0);
  const path = testInfo.outputPath("dashboard-activity-live-map-1440.png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach("dashboard-activity-live-map-1440", {
    path,
    contentType: "image/png",
  });
});

for (const width of [320, 390, 768, 1440]) {
  test(`dashboard activity preserves map, metrics, focus and no overflow at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1024 });
    await mockOverview(page);
    await mockActivity(page);
    await page.goto("/admin");
    await expect(
      page.getByRole("region", { name: "Indicateurs d’activité" }),
    ).toContainText(/période précédente/i);
    const map = page.getByRole("region", { name: "Carte d’activité" });
    await expect(map.locator(".analytics-map-marker")).toHaveCount(3);
    const disclosure = map.getByText(/voir les pharmacies de cette page/i);
    await disclosure.focus();
    await expect(disclosure).toBeFocused();
    const dimensions = await page.locator("html").evaluate((element) => ({
      scroll: element.scrollWidth,
      client: element.clientWidth,
    }));
    expect(dimensions.scroll).toBe(dimensions.client);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    await page.evaluate(async () => document.fonts.ready);
    const path = testInfo.outputPath(
      "visual-evidence",
      `dashboard-activity-${width}.png`,
    );
    await mkdir(dirname(path), { recursive: true });
    await page.screenshot({
      path,
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
    await testInfo.attach(`dashboard-activity-${width}`, {
      path,
      contentType: "image/png",
    });
  });
}
