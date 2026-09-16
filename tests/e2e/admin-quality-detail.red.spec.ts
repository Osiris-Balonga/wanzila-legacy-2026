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
    await route.fulfill({ json: qualityOverviewFixture() });
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

test("source rows show observedAt, reliability, freshness and actual duty counts without invented management actions", async ({
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
  await expect(sources).toContainText(/instantané|au 16 septembre/i);
  await expect(sources).not.toContainText(/fréquence|dernière mise à jour/i);
  await expect(sources.getByRole("link")).toHaveCount(0);
  await expect(
    sources.getByRole("button", { name: /modifier|ajouter|supprimer/i }),
  ).toHaveCount(0);
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
    page.getByText(/instantané.*indépendant de la période d’activité/i),
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
  const sources = page.getByRole("region", { name: "Sources de planning" });
  const coverage = page.getByRole("region", { name: "Couverture des gardes" });
  await expect(sources.getByRole("status")).toContainText(/chargement/i);
  await expect(coverage.getByRole("status")).toContainText(/chargement/i);
  release();
  await expect(sources).toContainText(/aucune source enregistrée/i);
  await expect(coverage).toContainText(/aucune pharmacie publiée/i);
  await expect(sources.getByRole("table")).toHaveCount(0);
  await expect(coverage).not.toContainText("70%");
});

for (const status of [401, 403, 500] as const) {
  test(`detail endpoint exposes its own ${status} state`, async ({ page }) => {
    await mockOverview(page);
    await mockDetail(page, { status });
    await page.goto("/admin/qualite");
    const sources = page.getByRole("region", { name: "Sources de planning" });
    const coverage = page.getByRole("region", {
      name: "Couverture des gardes",
    });
    for (const panel of [sources, coverage]) {
      const alert = panel.getByRole("alert");
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
    }
  });
}

test("an invalid #61 payload is rejected by Zod and remains retryable", async ({
  page,
}) => {
  await mockOverview(page);
  await mockDetail(page, { malformed: true });
  await page.goto("/admin/qualite");
  const sources = page.getByRole("region", { name: "Sources de planning" });
  await expect(sources.getByRole("alert")).toContainText(/indisponible/i);
  await expect(
    sources.getByRole("button", { name: /réessayer/i }),
  ).toBeVisible();
  await expect(sources).not.toContainText("Ordre national des pharmaciens");
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
    const dimensions = await page.locator("html").evaluate((element) => ({
      scroll: element.scrollWidth,
      client: element.clientWidth,
    }));
    expect(dimensions.scroll).toBe(dimensions.client);
    await sources.getByRole("button", { name: /page suivante/i }).focus();
    await expect(
      sources.getByRole("button", { name: /page suivante/i }),
    ).toBeFocused();
    await page.evaluate(async () => document.fonts.ready);
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
