import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

test.beforeEach(async ({ page }) => {
  await page.route("**/maps/wanzila-style.json", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#edf1f8" },
          },
        ],
      },
    }),
  );
});

async function fillProposal(page: Page) {
  await page
    .getByRole("button", { name: "Continuer avec l’adresse seule" })
    .click();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.getByLabel("Nom de la pharmacie").fill("Pharmacie de test");
  await page
    .getByLabel("Adresse ou indication")
    .fill("Rue de test, près du marché");
  await page.getByLabel("Quartier").fill("Quartier de test");
  await page.getByLabel("Arrondissement").fill("Arrondissement de test");
}

test("public can submit an address-only proposal without GPS or invented coordinates", async ({
  page,
}, testInfo) => {
  const requests: unknown[] = [];
  await page.route("**/api/v1/contributions", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, json: { status: "PENDING" } });
  });
  await page.goto("/contribuer");
  await expect(
    page.getByRole("heading", { name: "Ajouter une pharmacie" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continuer", exact: true }),
  ).toBeDisabled();
  const evidence = resolve(testInfo.outputDir, "visual-evidence");
  await mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: resolve(evidence, "contribution-location.png"),
    fullPage: true,
  });
  await fillProposal(page);
  await page.getByRole("button", { name: "Soumettre la proposition" }).click();
  await expect(
    page.getByRole("heading", { name: "Proposition reçue" }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ name: "Pharmacie de test" });
  expect(requests[0]).not.toHaveProperty("coordinates");
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(evidence, "contribution-confirmation.png"),
    fullPage: true,
  });
});

test("a failed request can be retried with the same submission identifier", async ({
  page,
}) => {
  const ids: string[] = [];
  await page.route("**/api/v1/contributions", async (route) => {
    const request = route.request().postDataJSON() as { submissionId: string };
    ids.push(request.submissionId);
    await route.fulfill(
      ids.length === 1
        ? { status: 503, json: { error: "unavailable" } }
        : { status: 202, json: { status: "PENDING" } },
    );
  });
  await page.goto("/contribuer");
  await fillProposal(page);
  await page.getByRole("button", { name: "Soumettre la proposition" }).click();
  await expect(page.getByRole("alert")).toContainText("Envoi impossible");
  await page.getByRole("button", { name: "Soumettre la proposition" }).click();
  await expect(
    page.getByRole("heading", { name: "Proposition reçue" }),
  ).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});

test("the form remains available when the map fails", async ({
  page,
}, testInfo) => {
  await page.route("**/maps/wanzila-style.json", (route) => route.abort());
  await page.goto("/contribuer");
  await expect(page.getByText(/Carte indisponible/)).toBeVisible();
  await page
    .getByRole("button", { name: "Continuer avec l’adresse seule" })
    .click();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.getByLabel("Nom de la pharmacie")).toBeVisible();
  const evidence = resolve(testInfo.outputDir, "visual-evidence");
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(evidence, "contribution-form.png"),
    fullPage: true,
  });
  if (testInfo.project.name === "mobile") {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  }
});

test("a precise GPS fix can be confirmed as the map position", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: -4.2634,
    longitude: 15.2832,
    accuracy: 25,
  });
  const requests: Array<{
    coordinates?: { latitude: number; longitude: number };
  }> = [];
  await page.route("**/api/v1/contributions", async (route) => {
    requests.push(
      route.request().postDataJSON() as {
        coordinates?: { latitude: number; longitude: number };
      },
    );
    await route.fulfill({ status: 202, json: { status: "PENDING" } });
  });
  await page.goto("/contribuer");
  await page.getByRole("button", { name: "Utiliser ma position" }).click();
  await expect(page.getByText(/Position trouvée/)).toBeVisible();
  await page.getByRole("button", { name: "Choisir ce point" }).click();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.getByLabel("Nom de la pharmacie").fill("Pharmacie de test");
  await page.getByLabel("Adresse ou indication").fill("Rue de test");
  await page.getByLabel("Quartier").fill("Quartier de test");
  await page.getByLabel("Arrondissement").fill("Arrondissement de test");
  await page.getByRole("button", { name: "Soumettre la proposition" }).click();
  await expect(
    page.getByRole("heading", { name: "Proposition reçue" }),
  ).toBeVisible();
  expect(
    Math.abs((requests[0]?.coordinates?.latitude ?? 0) - -4.2634),
  ).toBeLessThan(0.001);
  expect(
    Math.abs((requests[0]?.coordinates?.longitude ?? 0) - 15.2832),
  ).toBeLessThan(0.001);
});

test("the two steps reflow at 320, 390, 768 and 1440 pixels", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto("/contribuer");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Ajouter une pharmacie" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page
    .getByRole("button", { name: "Continuer avec l’adresse seule" })
    .click();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel("Nom de la pharmacie")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});
