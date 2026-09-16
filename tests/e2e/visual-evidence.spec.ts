import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const viewports = [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];

const publicPharmacy = {
  id: "00000000-0000-4000-8000-000000000006",
  name: "Pharmacie Centrale",
  address: {
    line: "12 avenue de la Paix",
    district: "Plateau",
    arrondissement: "Poto-Poto",
  },
  coordinates: { latitude: -4.2634, longitude: 15.2429 },
  currentDuty: {
    state: "ACTIVE",
    startsAt: "2026-09-16T08:00:00.000Z",
    endsAt: "2026-09-17T08:00:00.000Z",
    sourceFreshness: "FRESH",
    source: {
      name: "Ordre national des pharmaciens",
      observedAt: "2026-09-16T08:30:00.000Z",
    },
  },
};

const adminNames = [
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

const adminPharmacies = adminNames.map((name, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name,
  address: {
    line: `${12 + index} avenue de la Paix`,
    district: index % 2 === 0 ? "Bacongo" : "Moungali",
    arrondissement: index % 2 === 0 ? "Bacongo" : "Moungali",
  },
  phone: "+242060001234",
  coordinates: { latitude: -4.2634, longitude: 15.2429 },
  status: index === 3 ? "DRAFT" : index === 5 ? "ARCHIVED" : "PUBLISHED",
  createdAt: "2026-09-15T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z",
}));

test.use({
  locale: "fr-FR",
  timezoneId: "Africa/Brazzaville",
  colorScheme: "light",
  reducedMotion: "reduce",
  deviceScaleFactor: 1,
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one stable Chromium profile");
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00.000Z"));
  await page.route(/^https:\/\//, (route) => route.abort());
});

async function saveEvidence(
  page: Page,
  testInfo: TestInfo,
  screen: string,
  width: number,
) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const path = testInfo.outputPath("visual-evidence", `${screen}-${width}.png`);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({
    path,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
  await testInfo.attach(`${screen}-${width}`, {
    path,
    contentType: "image/png",
  });
  const dimensions = await page.locator("html").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
}

test("visual evidence: public discovery list at four widths", async ({
  page,
}, testInfo) => {
  await page.route("**/api/v1/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: [publicPharmacy],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.route("**/api/v1/analytics/events", (route) =>
    route.fulfill({ status: 202, json: { data: {} } }),
  );

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/#list");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Pharmacie Centrale/ }),
    ).toBeVisible();
    await saveEvidence(page, testInfo, "public-discovery", viewport.width);
  }
});

test("visual evidence: admin pharmacy directory at four widths", async ({
  page,
}, testInfo) => {
  await page.route("**/api/v1/admin/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: adminPharmacies,
        pagination: { page: 1, pageSize: 20, total: 10, totalPages: 1 },
      },
    }),
  );

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/admin/pharmacies");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pharmacies" }),
    ).toBeVisible();
    await expect(
      page.locator(".pharmacy-directory-list strong:visible").filter({
        hasText: "Pharmacie Jagger",
      }),
    ).toBeVisible();
    await saveEvidence(page, testInfo, "admin-pharmacies", viewport.width);
  }
});
