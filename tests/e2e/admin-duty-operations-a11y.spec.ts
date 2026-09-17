import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const dutyId = "00000000-0000-4000-8000-000000004904";
const pharmacyId = "00000000-0000-4000-8000-000000004901";
const sourceId = "00000000-0000-4000-8000-000000004902";

const source = {
  id: sourceId,
  name: "Planning officiel",
  description: "Service de garde",
  reliability: 90,
  observedAt: "2026-09-15T08:00:00.000Z",
  updatedAt: "2026-09-15T08:00:00.000Z",
  freshness: "FRESH",
};

const duty = {
  id: dutyId,
  pharmacyId,
  sourceId,
  startsAt: "2026-09-17T17:00:00.000Z",
  endsAt: "2026-09-18T07:00:00.000Z",
  status: "APPROVED",
  createdAt: "2026-09-16T08:00:00.000Z",
  updatedAt: "2026-09-16T08:00:00.000Z",
};

const pharmacy = {
  id: pharmacyId,
  name: "Pharmacie Jagger",
  address: {
    line: "Avenue de la Paix",
    district: "Bacongo",
    arrondissement: "Bacongo",
  },
  phone: "+242060001234",
  coordinates: { latitude: -4.263708, longitude: 15.242885 },
  status: "PUBLISHED",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

const existingException = {
  id: "00000000-0000-4000-8000-000000004905",
  dutyPeriodId: dutyId,
  kind: "UNAVAILABLE",
  startsAt: "2026-09-17T18:00:00.000Z",
  endsAt: "2026-09-17T20:00:00.000Z",
  reason: "Fermeture annoncée",
  createdAt: "2026-09-17T08:00:00.000Z",
  updatedAt: "2026-09-17T08:00:00.000Z",
};

const pagination = { page: 1, pageSize: 50, total: 1, totalPages: 1 };

test.use({
  locale: "fr-FR",
  timezoneId: "Africa/Brazzaville",
  reducedMotion: "reduce",
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00.000Z"));
});

async function expectAccessibleReflow(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const report = results.violations
    .filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    )
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    )
    .join("\n");
  expect(report).toBe("");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("filled sources and its edit form remain accessible", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({
    width: testInfo.project.name === "mobile" ? 390 : 1440,
    height: 900,
  });
  await page.route("**/api/v1/admin/sources?*", (route) =>
    route.fulfill({ json: { data: [source], pagination } }),
  );
  await page.goto("/admin/gardes/sources");
  await expect(
    page.getByRole("region", { name: "Liste des sources" }),
  ).toContainText(source.name);
  await expect(
    page.getByRole("region", { name: "Formulaire de source" }),
  ).toBeVisible();
  await expectAccessibleReflow(page);

  await page.getByRole("button", { name: `Modifier ${source.name}` }).click();
  const name = page.getByRole("textbox", { name: "Nom", exact: true });
  await expect(name).toHaveValue(source.name);
  await expectAccessibleReflow(page);
  await name.focus();
  await expect(name).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("textbox", { name: "Description facultative" }),
  ).toBeFocused();
});

test("filled exceptions and its edit form remain accessible", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({
    width: testInfo.project.name === "mobile" ? 390 : 1440,
    height: 900,
  });
  await page.route(`**/api/v1/admin/duties/${dutyId}`, (route) =>
    route.fulfill({ json: { data: duty } }),
  );
  await page.route(`**/api/v1/admin/pharmacies/${pharmacyId}`, (route) =>
    route.fulfill({ json: { data: pharmacy } }),
  );
  await page.route(`**/api/v1/admin/duties/${dutyId}/exceptions?*`, (route) =>
    route.fulfill({
      json: { data: [existingException], pagination },
    }),
  );
  await page.goto(`/admin/gardes/${dutyId}/exceptions`);
  await expect(
    page.getByRole("region", { name: "Liste des exceptions" }),
  ).toContainText(existingException.reason);
  await expect(
    page.getByRole("region", { name: "Formulaire d’exception" }),
  ).toBeVisible();
  await expectAccessibleReflow(page);

  await page.getByRole("button", { name: /modifier l.exception/i }).click();
  const reason = page.getByRole("textbox", { name: "Motif facultatif" });
  await expect(reason).toHaveValue(existingException.reason);
  await expectAccessibleReflow(page);
  await reason.focus();
  await expect(reason).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Annuler", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Enregistrer l’exception" }),
  ).toBeFocused();
});
