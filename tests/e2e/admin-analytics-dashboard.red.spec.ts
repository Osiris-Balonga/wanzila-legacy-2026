import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { analyticsOverviewFixture } from "../../apps/web/src/features/admin-dashboard/testing/analytics-fixtures";
import { analyticsActivityFixture } from "../../apps/web/src/features/admin-dashboard/testing/activity-fixtures";
import { qualityDetailFixture } from "../../apps/web/src/features/admin-dashboard/testing/quality-fixtures";

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

async function mockOverview(
  page: Page,
  options: { empty?: boolean; status?: number; hold?: Promise<void> } = {},
) {
  const requested: string[] = [];
  await page.route(
    "**/api/v1/admin/analytics/route-outcomes**",
    async (route) => {
      const window =
        new URL(route.request().url()).searchParams.get("window") === "30d"
          ? "30d"
          : "7d";
      await route.fulfill({
        json: {
          data: {
            version: 1,
            window,
            period: {
              timeZone: "Africa/Brazzaville",
              from: "2026-09-01T00:00:00.000Z",
              to: "2026-09-17T00:00:00.000Z",
              asOf: "2026-09-16T12:00:00.000Z",
            },
            counts: {
              started: 12,
              gpsConfirmed: 3,
              userDeclared: 2,
              stopped: 1,
              alreadyNearby: 2,
              unknown: 4,
            },
          },
        },
      });
    },
  );
  await page.route("**/api/v1/admin/analytics/quality**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    await route.fulfill({
      json: qualityDetailFixture(
        Number(params.get("sourcePage")),
        Number(params.get("coveragePage")),
      ),
    });
  });
  await page.route("**/api/v1/admin/analytics/activity**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const window = params.get("window") === "30d" ? "30d" : "7d";
    await route.fulfill({
      json: analyticsActivityFixture(window, {
        empty: options.empty,
        page: Number(params.get("page")),
      }),
    });
  });
  await page.route("**/api/v1/admin/analytics/overview**", async (route) => {
    const url = new URL(route.request().url());
    requested.push(`${url.pathname}${url.search}`);
    await options.hold;
    const window = url.searchParams.get("window") === "30d" ? "30d" : "7d";
    await route.fulfill({
      status: options.status ?? 200,
      json:
        options.status && options.status !== 200
          ? { error: { code: "INTERNAL_ERROR", message: "Test failure" } }
          : analyticsOverviewFixture(window, options.empty),
    });
  });
  return requested;
}

function rgbChannels(value: string): [number, number, number] {
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3 || channels.some(Number.isNaN))
    throw new Error(`Expected a computed RGB color, received ${value}`);
  return channels as [number, number, number];
}

function luminance([red, green, blue]: [number, number, number]): number {
  const linear = [red, green, blue].map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.04045
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

async function expectPurpleWhiteAction(button: Locator): Promise<void> {
  const colors = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      foreground: style.color,
      background: style.backgroundColor,
      opacity: Number(style.opacity),
    };
  });
  const foreground = rgbChannels(colors.foreground);
  const background = rgbChannels(colors.background);
  expect(Math.min(...foreground)).toBeGreaterThanOrEqual(245);
  expect(background[2]).toBeGreaterThan(background[0]);
  expect(background[0]).toBeGreaterThan(background[1]);
  const compositeOnWhite = (channels: [number, number, number]) =>
    channels.map(
      (value) => value * colors.opacity + 255 * (1 - colors.opacity),
    ) as [number, number, number];
  const ratio =
    (luminance(compositeOnWhite(foreground)) + 0.05) /
    (luminance(compositeOnWhite(background)) + 0.05);
  // Disabled controls are WCAG-exempt; 3:1 is a visual legibility target here.
  expect(ratio).toBeGreaterThanOrEqual((await button.isDisabled()) ? 3 : 4.5);
}

test("dashboard and quality routes issue real 7d overview requests and show their required regions", async ({
  page,
}) => {
  const requests = await mockOverview(page);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  for (const region of [
    "Indicateurs d’activité",
    "Résultats des trajets",
    "Tunnel d’activité",
    "Pharmacies les plus consultées",
    "Utilisation des filtres",
    "Carte d’activité",
    "Alertes et actions à traiter",
    "Qualité des données",
  ]) {
    await expect(page.getByRole("region", { name: region })).toBeVisible();
  }
  await expect(
    page
      .getByRole("region", { name: "Pharmacies les plus consultées" })
      .getByText("Pharmacie des Manguiers"),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: /Tunnel d’activité/ }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("table", { name: /Activité quotidienne/ }),
  ).toHaveCount(1);
  const alerts = page.getByRole("region", {
    name: "Alertes et actions à traiter",
  });
  await expect(alerts.getByRole("link")).toHaveCount(1);
  await expect(alerts.getByRole("link")).toHaveAttribute(
    "href",
    "/admin/qualite",
  );
  await expect(alerts).not.toContainText(/signalements/i);
  expect(requests).toContain("/api/v1/admin/analytics/overview?window=7d");

  await page.goto("/admin/qualite");
  await expect(
    page.getByRole("heading", { name: "Sources & qualité des données" }),
  ).toBeVisible();
  for (const region of [
    "Indicateurs de qualité",
    "Sources de planning",
    "Couverture des gardes",
    "Qualité des données",
    "Actions en attente",
    "Anomalies à traiter",
  ]) {
    await expect(page.getByRole("region", { name: region })).toBeVisible();
  }
  await expect(
    page.getByRole("region", { name: "Sources de planning" }),
  ).toContainText("Ordre national des pharmaciens");
  await expect(
    page.getByText(/Détection des anomalies indisponible/i),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Actions en attente" }).getByRole("link"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Actions en attente" }),
  ).not.toContainText(/signalements/i);
  expect(
    requests.filter(
      (url) => url === "/api/v1/admin/analytics/overview?window=7d",
    ),
  ).toHaveLength(2);
});

test("route outcome counts stay distinct and responsive without a completion rate", async ({
  page,
}, testInfo) => {
  await mockOverview(page);
  await page.goto("/admin");
  const results = page.getByRole("region", { name: "Résultats des trajets" });
  await expect(results).toContainText("12");
  await expect(results).toContainText("Arrivée déclarée");
  await expect(results).toContainText("Issue inconnue");
  await expect(results).toContainText(/Inconnu.*trajet échoué/i);
  await expect(results).not.toContainText(/taux de conversion/i);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page
        .locator("html")
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBe(0);
    await results.screenshot({
      path: testInfo.outputPath(
        "visual-evidence",
        `route-outcomes-${width}.png`,
      ),
      animations: "disabled",
    });
  }
});

test("the dashboard actually fetches the reviewed overview endpoint", async ({
  page,
}) => {
  const requests = await mockOverview(page);
  await page.goto("/admin");
  await expect
    .poll(() => requests, { timeout: 2000 })
    .toContain("/api/v1/admin/analytics/overview?window=7d");
});

test("period control is keyboard-focusable and changes the actual query to 30d", async ({
  page,
}) => {
  const requests = await mockOverview(page);
  await page.goto("/admin");
  const period = page.getByRole("combobox", { name: "Période" });
  await expect(period).toBeVisible();
  await period.focus();
  await expect(period).toBeFocused();
  await period.selectOption("30d");
  await expect
    .poll(() => requests.at(-1))
    .toBe("/api/v1/admin/analytics/overview?window=30d");
  await expect(period).toHaveValue("30d");
  await expect(
    page.getByRole("table", { name: /Activité quotidienne/ }),
  ).toContainText(/18 août|2026-08-18/i);
  await expect(
    page.getByRole("region", { name: "Indicateurs d’activité" }),
  ).toContainText(
    String(analyticsOverviewFixture("30d").data.events.totals.discovery_viewed),
  );

  await page.goto("/admin/qualite");
  const qualityPeriod = page.getByRole("combobox", { name: "Période" });
  await expect(qualityPeriod).toBeVisible();
  expect(requests.at(-1)).toBe("/api/v1/admin/analytics/overview?window=7d");
  await qualityPeriod.selectOption("30d");
  await expect
    .poll(() => requests.at(-1))
    .toBe("/api/v1/admin/analytics/overview?window=30d");
});

for (const route of ["/admin", "/admin/qualite"] as const) {
  for (const status of [401, 403] as const) {
    test(`${route} gives a distinct ${status} access state`, async ({
      page,
    }) => {
      await mockOverview(page, { status });
      await page.goto(route);
      const alert = page.getByRole("alert");
      if (status === 401) {
        await expect(alert).toContainText("Connexion requise");
        await expect(
          alert.getByRole("link", { name: "Aller à la connexion" }),
        ).toHaveAttribute("href", "/admin/connexion");
      } else {
        await expect(alert).toContainText("Accès refusé");
        await expect(alert.getByRole("link")).toHaveCount(0);
      }
      await expect(
        alert.getByRole("button", { name: "Réessayer" }),
      ).toHaveCount(0);
    });
  }

  test(`${route} exposes loading, zero-data and retryable API failure`, async ({
    page,
  }) => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await mockOverview(page, { hold, empty: true });
    await page.goto(route);
    await expect(
      page.getByRole("status", { name: /Chargement/ }),
    ).toBeVisible();
    release();
    await expect(
      page.getByText(/Aucune activité|Aucune donnée/i),
    ).toBeVisible();
    await expect(page.getByText("87%", { exact: true })).toHaveCount(0);

    await page.unrouteAll();
    await mockOverview(page, { status: 500 });
    await page.reload();
    await expect(page.getByRole("alert")).toContainText(/indisponible/i);
    const retry = page.getByRole("button", { name: "Réessayer" });
    await expect(retry).toBeVisible();
    await expectPurpleWhiteAction(retry);
    await retry.hover();
    await expectPurpleWhiteAction(retry);
    await retry.focus();
    await expect(retry).toBeFocused();
    await expectPurpleWhiteAction(retry);
    const bounds = await retry.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(
      bounds!.x + bounds!.width / 2,
      bounds!.y + bounds!.height / 2,
    );
    await page.mouse.down();
    await expectPurpleWhiteAction(retry);
    await page.mouse.up();
  });
}

test("retry stays readable while disabled during a pending refetch", async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/v1/admin/analytics/overview**", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({
        status: 500,
        json: { error: { code: "INTERNAL_ERROR", message: "Test failure" } },
      });
      return;
    }
    await hold;
    await route.fulfill({ json: analyticsOverviewFixture() });
  });
  await page.goto("/admin");
  const retry = page.getByRole("button", { name: "Réessayer" });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).toBeDisabled();
  await expectPurpleWhiteAction(retry);
  release();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("reference-selected navigation icons are solid rather than outline-only", async ({
  page,
}) => {
  await mockOverview(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    nav.getByRole("link", { name: "Dashboard" }).locator("svg"),
  ).toHaveAttribute("fill", "currentColor");

  await page.goto("/admin/qualite");
  await expect(
    nav.getByRole("link", { name: "Sources & qualité" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    nav.getByRole("link", { name: "Sources & qualité" }).locator("svg"),
  ).toHaveAttribute("fill", "currentColor");
});

test("map uses only the paginated static pharmacy coordinates, not a synthetic heat layer", async ({
  page,
}) => {
  await mockOverview(page);
  await page.goto("/admin");
  const map = page.getByRole("region", { name: "Carte d’activité" });
  await expect(map).toContainText("3 pharmacies cartographiables");
  await map.getByText("Voir les pharmacies de cette page").click();
  await expect(map.getByRole("table")).toContainText("Pharmacie Jagger");
  await expect(map.getByRole("button")).toHaveCount(0);
  await expect(map.locator(".analytics-map-marker")).toHaveCount(3);
  await expect(map.locator(".analytics-map-marker").first()).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(map.locator(".maplibregl-heatmap-layer")).toHaveCount(0);
  await expect(map.getByText("Pharmacie indisponible")).toHaveCount(0);
});

test("opt-in live map evidence loads real vector tiles", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.WANZILA_LIVE_MAP_EVIDENCE !== "1",
    "Network-backed visual evidence is run manually, not in deterministic CI.",
  );
  await page.unroute("**/maps/wanzila-style.json");
  await mockOverview(page);
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
    page.getByRole("region", { name: "Carte d’activité" }),
  ).toBeVisible();
  await expect(
    page.locator('.analytics-map__canvas[data-map-status="ready"]'),
  ).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => loadedTiles, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const path = testInfo.outputPath("admin-dashboard-live-map-1440.png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach("admin-dashboard-live-map-1440", {
    path,
    contentType: "image/png",
  });
});

for (const width of [320, 390, 768, 1440]) {
  for (const route of ["/admin", "/admin/qualite"] as const) {
    test(`${route} preserves reference hierarchy, focus and no overflow at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1024 });
      await mockOverview(page);
      await page.goto(route);
      await expect(
        page.getByRole("heading", {
          name:
            route === "/admin" ? "Dashboard" : "Sources & qualité des données",
        }),
      ).toBeVisible();
      const period = page.getByRole("combobox", { name: "Période" });
      await period.focus();
      await expect(period).toBeFocused();
      const dimensions = await page.locator("html").evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      const overflowing = await page.locator("*").evaluateAll((elements) =>
        elements
          .map((element) => ({
            tag: element.tagName,
            className: element.getAttribute("class")?.slice(0, 90),
            right: Math.round(element.getBoundingClientRect().right),
          }))
          .filter((element) => element.right > window.innerWidth + 1)
          .slice(0, 15),
      );
      expect(dimensions.scroll, JSON.stringify(overflowing)).toBe(
        dimensions.client,
      );

      if (route === "/admin" && width <= 390) {
        await expect(
          page.getByRole("region", { name: "Tunnel d’activité" }),
        ).toBeVisible();
        const rows = await page
          .locator(".analytics-funnel__item")
          .evaluateAll((items) =>
            items.map((item) => {
              const label = item.querySelector(":scope > span")!;
              const track = item.querySelector(".analytics-funnel__track")!;
              const value = item.querySelector(":scope > strong")!;
              return {
                fontSize: parseFloat(getComputedStyle(label).fontSize),
                labelRight: label.getBoundingClientRect().right,
                trackLeft: track.getBoundingClientRect().left,
                trackRight: track.getBoundingClientRect().right,
                valueLeft: value.getBoundingClientRect().left,
              };
            }),
          );
        expect(rows).toHaveLength(6);
        for (const row of rows) {
          expect(row.fontSize).toBeGreaterThanOrEqual(11);
          expect(row.labelRight).toBeLessThanOrEqual(row.trackLeft);
          expect(row.trackRight).toBeLessThanOrEqual(row.valueLeft);
        }
      }

      if (width === 1440) {
        const metrics = await page
          .getByRole("region", {
            name:
              route === "/admin"
                ? "Indicateurs d’activité"
                : "Indicateurs de qualité",
          })
          .boundingBox();
        const detail = await page
          .getByRole("region", {
            name:
              route === "/admin" ? "Tunnel d’activité" : "Sources de planning",
          })
          .boundingBox();
        expect(metrics).not.toBeNull();
        expect(detail).not.toBeNull();
        expect(detail!.y).toBeGreaterThan(metrics!.y);
      }

      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const path = testInfo.outputPath(
        "visual-evidence",
        `${route === "/admin" ? "admin-dashboard" : "admin-data-quality"}-${width}.png`,
      );
      await mkdir(dirname(path), { recursive: true });
      await page.screenshot({
        path,
        fullPage: true,
        animations: "disabled",
        caret: "hide",
      });
      await testInfo.attach(`analytics-${route}-${width}`, {
        path,
        contentType: "image/png",
      });
    });
  }
}
