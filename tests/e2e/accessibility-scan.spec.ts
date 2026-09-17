import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const pharmacy = {
  id: "00000000-0000-4000-8000-000000000006",
  name: "Pharmacie Centrale",
  address: {
    line: "12 avenue de la Paix",
    district: "Plateau",
    arrondissement: "Poto-Poto",
  },
  phone: "+242060001234",
  coordinates: { latitude: -4.2634, longitude: 15.2429 },
  status: "PUBLISHED",
  createdAt: "2026-09-15T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z",
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

const adminPharmacy = {
  id: pharmacy.id,
  name: pharmacy.name,
  address: pharmacy.address,
  phone: pharmacy.phone,
  coordinates: pharmacy.coordinates,
  status: pharmacy.status,
  createdAt: pharmacy.createdAt,
  updatedAt: pharmacy.updatedAt,
};

test.use({
  locale: "fr-FR",
  timezoneId: "Africa/Brazzaville",
  reducedMotion: "reduce",
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00.000Z"));
  await page.route("**/api/v1/analytics/events", (route) =>
    route.fulfill({ status: 202, json: { data: {} } }),
  );
});

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "critical" || violation.impact === "serious",
  );
  const report = serious
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    )
    .join("\n");
  expect(report).toBe("");
}

test("public discovery list has no critical or serious axe findings", async ({
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
  await page.goto("/#list");
  await expect(
    page.getByRole("link", { name: /Pharmacie Centrale/ }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});

test("emergency contacts have no critical or serious axe findings", async ({
  page,
}) => {
  await page.route("**/api/v1/emergency-contacts", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "00000000-0000-4000-8000-000000001401",
            label: "SAMU",
            phone: "112",
            position: 1,
            updatedAt: "2026-09-15T08:30:45.123Z",
          },
        ],
      },
    }),
  );
  await page.goto("/urgences");
  await expect(
    page.getByRole("link", { name: "Appeler SAMU au 112" }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});

test("admin pharmacy directory has no critical or serious axe findings", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: [adminPharmacy],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.goto("/admin/pharmacies");
  await expect(page.getByRole("heading", { name: "Pharmacies" })).toBeVisible();
  await expect(
    page
      .locator(".pharmacy-directory-list strong:visible")
      .filter({ hasText: "Pharmacie Centrale" })
      .first(),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});
