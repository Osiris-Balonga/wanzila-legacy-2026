import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { adminAnalyticsQualityResponseSchema } from "@wanzila/contracts";
import {
  qualityDetailFixture,
  qualityOverviewFixture,
} from "../../apps/web/src/features/admin-dashboard/testing/quality-fixtures";

test.use({
  locale: "fr-FR",
  timezoneId: "Africa/Brazzaville",
  reducedMotion: "reduce",
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one stable Chromium profile");
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00.000Z"));
});

async function mockOverview(page: Page) {
  const requests: string[] = [];
  await page.route("**/api/v1/admin/analytics/overview**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.searchParams.get("window") ?? "");
    await route.fulfill({
      json: qualityOverviewFixture(
        url.searchParams.get("window") === "30d" ? "30d" : "7d",
      ),
    });
  });
  return requests;
}

async function mockDetail(
  page: Page,
  options: {
    empty?: boolean;
    status?: number;
    malformed?: boolean;
    hold?: Promise<void>;
  } = {},
) {
  const requests: URLSearchParams[] = [];
  await page.route("**/api/v1/admin/analytics/quality**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    await options.hold;
    await route.fulfill({
      status: options.status ?? 200,
      json: options.status
        ? { error: { code: "TEST_ERROR", message: "Test failure" } }
        : options.malformed
          ? { data: { version: 999 } }
          : qualityDetailFixture(
              Number(params.get("sourcePage")),
              Number(params.get("coveragePage")),
              options.empty,
            ),
    });
  });
  return requests;
}

function expectPageRequest(
  params: URLSearchParams,
  sourcePage: number,
  coveragePage: number,
) {
  expect(Object.fromEntries(params)).toEqual({
    sourcePage: String(sourcePage),
    sourcePageSize: "6",
    coveragePage: String(coveragePage),
    coveragePageSize: "5",
  });
}

test("the reviewed #61 response fixture parses and quality requests explicit independent pages", async ({
  page,
}) => {
  expect(
    adminAnalyticsQualityResponseSchema.safeParse(qualityDetailFixture())
      .success,
  ).toBe(true);
  await mockOverview(page);
  const requests = await mockDetail(page);
  await page.goto("/admin/qualite");
  await expect(
    page.getByRole("region", { name: "Sources de planning" }),
  ).toContainText("Ordre national des pharmaciens");
  expectPageRequest(requests[0]!, 1, 1);
});

test("source rows show observedAt, reliability, freshness and actual duty counts with access to source management", async ({
  page,
}) => {
  await mockOverview(page);
  await mockDetail(page);
  await page.goto("/admin/qualite");
  const sources = page.getByRole("region", { name: "Sources de planning" });
  const table = sources.getByRole("table", { name: /sources de planning/i });
  await expect(table).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: /observation/i }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: /fiabilité/i }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: /gardes/i }),
  ).toBeVisible();
  const firstRow = table.getByRole("row", {
    name: /Ordre national des pharmaciens/,
  });
  for (const value of ["16 sept.", "96", "À jour", "8"]) {
    await expect(firstRow).toContainText(value);
  }
  const staleRow = table.getByRole("row", {
    name: /Sites web des pharmacies/,
  });
  for (const value of ["29 août", "52", "En retard", "0"]) {
    await expect(staleRow).toContainText(value);
  }
  await expect(sources).toContainText(/7 sources au total/i);
  await expect(sources).toContainText(/5 à jour/i);
  await expect(sources).toContainText(/2 en retard/i);
  await expect(sources).toContainText(/10 périodes sans source/i);
  await expect(sources).toContainText(/20 périodes avec source/i);
  await expect(sources).toContainText(
    /30 périodes de garde en cours après exceptions/i,
  );
  await expect(sources).toContainText(/instantané|au 16 septembre/i);
  await expect(sources).toContainText(/pas fréquence de synchronisation/i);
  await expect(sources).not.toContainText(/dernière mise à jour/i);
  await expect(
    sources.getByRole("link", { name: "Ajouter une source" }),
  ).toHaveAttribute("href", "/admin/gardes/sources");
  await expect(
    sources.getByRole("button", { name: /modifier|ajouter|supprimer/i }),
  ).toHaveCount(0);
});

test("source action opens the existing management screen", async ({ page }) => {
  await mockOverview(page);
  await mockDetail(page);
  await page.route("**/api/v1/admin/sources?*", (route) =>
    route.fulfill({
      json: {
        data: [],
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.goto("/admin/qualite");
  await page
    .getByRole("region", { name: "Sources de planning" })
    .getByRole("link", { name: "Ajouter une source" })
    .click();
  await expect(page).toHaveURL(/\/admin\/gardes\/sources$/);
  await expect(
    page.getByRole("heading", { name: "Sources des plannings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ajouter une source" }),
  ).toBeVisible();
});

test("coverage lists real arrondissement ratios and global unique-pharmacy totals", async ({
  page,
}) => {
  await mockOverview(page);
  await mockDetail(page);
  await page.goto("/admin/qualite");
  const coverage = page.getByRole("region", { name: "Couverture des gardes" });
  await expect(coverage).toContainText(/46 pharmacies publiées/i);
  await expect(coverage).toContainText(/27 avec garde approuvée en cours/i);
  await expect(coverage).toContainText(/Bacongo/);
  await expect(coverage).toContainText(/7 sur 10/);
  await expect(coverage).toContainText(/70\s*%/);
  const bacongoBar = coverage
    .getByRole("listitem")
    .filter({ hasText: "Bacongo" })
    .locator(".analytics-detail-coverage__track span");
  const fillRatio = await bacongoBar.evaluate((element) => {
    const fill = element.getBoundingClientRect();
    const track = element.parentElement!.getBoundingClientRect();
    return fill.width / track.width;
  });
  expect(fillRatio).toBeCloseTo(0.7, 2);
  await expect(coverage).not.toContainText(/périodes approuvées en cours.*46/i);
  await expect(coverage).not.toContainText(/heatmap|anomalie détectée/i);
});

test("source and coverage pagination remain independent with global totals", async ({
  page,
}) => {
  await mockOverview(page);
  const requests = await mockDetail(page);
  await page.goto("/admin/qualite");
  const sources = page.getByRole("region", { name: "Sources de planning" });
  const coverage = page.getByRole("region", { name: "Couverture des gardes" });
  await expect(sources).toContainText("Ordre national des pharmaciens");
  const sourceNext = sources.getByRole("button", { name: /page suivante/i });
  await sourceNext.focus();
  await expect(sourceNext).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sources).toContainText("Source septième");
  await expect(sources).not.toContainText("Ordre national des pharmaciens");
  await expect(coverage).toContainText("Bacongo");
  await expect(sources).toContainText(/7 sources au total/i);
  expectPageRequest(requests.at(-1)!, 2, 1);

  await coverage.getByRole("button", { name: /page suivante/i }).click();
  await expect(coverage).toContainText("Talangaï");
  await expect(coverage).not.toContainText("Bacongo");
  await expect(sources).toContainText("Source septième");
  await expect(coverage).toContainText(/46 pharmacies publiées/i);
  expectPageRequest(requests.at(-1)!, 2, 2);

  await sources.getByRole("button", { name: /page précédente/i }).click();
  await expect(sources).toContainText("Ordre national des pharmaciens");
  await expect(coverage).toContainText("Talangaï");
  expectPageRequest(requests.at(-1)!, 1, 2);
});

test("pages that become out of range return to the last valid page without a request loop", async ({
  page,
}) => {
  await mockOverview(page);
  const requests: URLSearchParams[] = [];
  let sourceShrunk = false;
  let coverageShrunk = false;
  await page.route("**/api/v1/admin/analytics/quality**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    const sourcePage = Number(params.get("sourcePage"));
    const coveragePage = Number(params.get("coveragePage"));
    if (sourcePage === 2) sourceShrunk = true;
    if (coveragePage === 2) coverageShrunk = true;
    const fixture = qualityDetailFixture(sourcePage, coveragePage);
    if (sourceShrunk) {
      fixture.data.sources.data =
        sourcePage === 1 ? qualityDetailFixture().data.sources.data : [];
      fixture.data.sources.pagination.total = 6;
      fixture.data.sources.pagination.totalPages = 1;
      fixture.data.sources.totals.registered = 6;
      fixture.data.sources.totals.stale = 1;
    }
    if (coverageShrunk) {
      fixture.data.coverage.data =
        coveragePage === 1 ? qualityDetailFixture().data.coverage.data : [];
      fixture.data.coverage.pagination.total = 5;
      fixture.data.coverage.pagination.totalPages = 1;
      fixture.data.coverage.totals.publishedPharmacies = 40;
      fixture.data.coverage.totals.withCurrentApprovedDuty = 24;
      fixture.data.coverage.totals.ratio = 0.6;
    }
    await route.fulfill({ json: fixture });
  });
  await page.goto("/admin/qualite");
  const sources = page.getByRole("region", { name: "Sources de planning" });
  const coverage = page.getByRole("region", { name: "Couverture des gardes" });
  await expect(sources).toContainText("Ordre national des pharmaciens");
  await sources.getByRole("button", { name: /page suivante/i }).click();
  await expect(sources).toContainText("6 sources au total");
  await expect(sources).toContainText("Ordre national des pharmaciens");
  expectPageRequest(requests.at(-1)!, 1, 1);
  expect(requests).toHaveLength(3);
  await coverage.getByRole("button", { name: /page suivante/i }).click();
  await expect(coverage).toContainText("40 pharmacies publiées");
  await expect(coverage).toContainText("Bacongo");
  expectPageRequest(requests.at(-1)!, 1, 1);
  expect(requests).toHaveLength(5);
});

test("changing 7d to 30d changes activity, not the asOf source and coverage snapshot", async ({
  page,
}) => {
  const overviewRequests = await mockOverview(page);
  const detailRequests = await mockDetail(page);
  await page.goto("/admin/qualite");
  await expect(
    page.getByRole("region", { name: "Sources de planning" }),
  ).toContainText("Ordre national des pharmaciens");
  await page.getByRole("combobox", { name: "Période" }).selectOption("30d");
  await expect.poll(() => overviewRequests.at(-1)).toBe("30d");
  await expect(
    page.getByRole("region", { name: "Sources de planning" }),
  ).toContainText("Ordre national des pharmaciens");
  await expect(
    page.getByRole("region", { name: "Couverture des gardes" }),
  ).toContainText("46 pharmacies publiées");
  expect(detailRequests).toHaveLength(1);
  await expect(
    page
      .getByRole("region", { name: "Sources de planning" })
      .getByText(/instantané.*indépendantes de la période d’activité/i),
  ).toBeVisible();
});

test("detail request has a distinct loading state and honest empty state", async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockOverview(page);
  await mockDetail(page, { empty: true, hold });
  await page.goto("/admin/qualite");
  const shared = page.getByRole("region", {
    name: "Détail des sources et de la couverture",
  });
  await expect(shared.getByRole("status")).toContainText(/chargement/i);
  await expect(shared.getByRole("status")).toHaveCount(1);
  const sources = page.getByRole("region", { name: "Sources de planning" });
  const coverage = page.getByRole("region", { name: "Couverture des gardes" });
  release();
  await expect(sources).toContainText(/aucune source enregistrée/i);
  await expect(
    sources.getByRole("link", { name: "Ajouter une source" }),
  ).toBeVisible();
  await expect(coverage).toContainText(/aucune pharmacie publiée/i);
  await expect(sources.getByRole("table")).toHaveCount(0);
  await expect(coverage).not.toContainText("70%");
});

for (const status of [401, 403, 500] as const) {
  test(`detail endpoint exposes its own ${status} state`, async ({ page }) => {
    await mockOverview(page);
    await mockDetail(page, { status });
    await page.goto("/admin/qualite");
    const shared = page.getByRole("region", {
      name: "Détail des sources et de la couverture",
    });
    const alert = shared.getByRole("alert");
    await expect(alert).toContainText(
      status === 401
        ? /connexion requise/i
        : status === 403
          ? /accès refusé/i
          : /indisponible/i,
    );
    await expect(page.getByRole("alert")).toHaveCount(1);
    if (status === 401) {
      await expect(
        alert.getByRole("link", { name: /connexion/i }),
      ).toHaveAttribute("href", "/admin/connexion");
    } else if (status === 500) {
      await expect(
        alert.getByRole("button", { name: /réessayer/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /réessayer/i }),
      ).toHaveCount(1);
    } else {
      await expect(alert.getByRole("button")).toHaveCount(0);
    }
  });
}

test("an invalid #61 payload is rejected by Zod and remains retryable", async ({
  page,
}) => {
  await mockOverview(page);
  await mockDetail(page, { malformed: true });
  await page.goto("/admin/qualite");
  const shared = page.getByRole("region", {
    name: "Détail des sources et de la couverture",
  });
  await expect(shared.getByRole("alert")).toContainText(/indisponible/i);
  await expect(
    shared.getByRole("button", { name: /réessayer/i }),
  ).toBeVisible();
  await expect(shared).not.toContainText("Ordre national des pharmaciens");
});

test("detail retry refetches and recovers without reloading the overview", async ({
  page,
}) => {
  const overviewRequests = await mockOverview(page);
  let attempts = 0;
  await page.route("**/api/v1/admin/analytics/quality**", async (route) => {
    attempts += 1;
    await route.fulfill(
      attempts === 1
        ? {
            status: 500,
            json: { error: { code: "INTERNAL_ERROR", message: "test" } },
          }
        : { json: qualityDetailFixture() },
    );
  });
  await page.goto("/admin/qualite");
  const shared = page.getByRole("region", {
    name: "Détail des sources et de la couverture",
  });
  const sources = page.getByRole("region", { name: "Sources de planning" });
  await expect(shared.getByRole("alert")).toContainText(/indisponible/i);
  await shared.getByRole("button", { name: "Réessayer" }).click();
  await expect(sources).toContainText("Ordre national des pharmaciens");
  expect(attempts).toBe(2);
  expect(overviewRequests).toEqual(["7d"]);
});

test("the narrow source table can be scrolled with the keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockOverview(page);
  await mockDetail(page);
  await page.goto("/admin/qualite");
  const scroll = page
    .getByRole("region", { name: "Sources de planning" })
    .getByRole("region", {
      name: "Défilement horizontal du tableau des sources",
    });
  await expect(scroll).toBeVisible();
  await scroll.focus();
  await expect(scroll).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
});

for (const width of [320, 390, 768, 1440]) {
  test(`quality details remain usable without document overflow at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1024 });
    await mockOverview(page);
    await mockDetail(page);
    await page.goto("/admin/qualite");
    const sources = page.getByRole("region", { name: "Sources de planning" });
    const coverage = page.getByRole("region", {
      name: "Couverture des gardes",
    });
    await expect(sources).toContainText("Ordre national des pharmaciens");
    await expect(coverage).toContainText("Bacongo");
    const addSource = sources.getByRole("link", {
      name: "Ajouter une source",
    });
    await expect(addSource).toBeVisible();
    await addSource.focus();
    await expect(addSource).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(addSource).toBeFocused();
    await expect(addSource).toHaveCSS("box-shadow", /^(?!none$).+/);
    const dimensions = await page.locator("html").evaluate((element) => ({
      scroll: element.scrollWidth,
      client: element.clientWidth,
    }));
    expect(dimensions.scroll).toBe(dimensions.client);
    await sources.getByRole("button", { name: /page suivante/i }).focus();
    await expect(
      sources.getByRole("button", { name: /page suivante/i }),
    ).toBeFocused();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    await page.evaluate(async () => document.fonts.ready);
    if (width <= 390) {
      const position = await sources
        .getByRole("region", {
          name: "Défilement horizontal du tableau des sources",
        })
        .evaluate((element) => {
          const header = element.querySelector("thead th")!;
          const firstName = element.querySelector("tbody th strong")!;
          return {
            scrollLeft: element.scrollLeft,
            viewportLeft: element.getBoundingClientRect().left,
            viewportRight: element.getBoundingClientRect().right,
            headerLeft: header.getBoundingClientRect().left,
            firstNameLeft: firstName.getBoundingClientRect().left,
            firstNameRight: firstName.getBoundingClientRect().right,
          };
        });
      expect(position.scrollLeft, JSON.stringify(position)).toBe(0);
      expect(
        position.headerLeft,
        JSON.stringify(position),
      ).toBeGreaterThanOrEqual(position.viewportLeft - 1);
      expect(
        position.firstNameLeft,
        JSON.stringify(position),
      ).toBeGreaterThanOrEqual(position.viewportLeft - 1);
      expect(
        position.firstNameRight,
        JSON.stringify(position),
      ).toBeLessThanOrEqual(position.viewportRight + 1);
    }
    const path = testInfo.outputPath(
      "visual-evidence",
      `quality-detail-${width}.png`,
    );
    await mkdir(dirname(path), { recursive: true });
    await page.screenshot({
      path,
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
    await testInfo.attach(`quality-detail-${width}`, {
      path,
      contentType: "image/png",
    });
  });
}
