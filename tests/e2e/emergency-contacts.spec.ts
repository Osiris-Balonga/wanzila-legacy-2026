import { expect, test, type Page } from "@playwright/test";

// The public shell and mobile-navigation.png define the navigation language.
// The emergency-contact page body is intentionally derived from US14: no
// pixel-identical body mockup exists.
const viewports = [
  { name: "320", width: 320, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 1000 },
];

const emergencyResponse = {
  data: [
    {
      id: "00000000-0000-4000-8000-000000001401",
      label: "SAMU",
      phone: "112",
      position: 1,
      updatedAt: "2026-09-15T08:30:45.123Z",
    },
  ],
};

const retriedEmergencyResponse = {
  data: [
    {
      id: "00000000-0000-4000-8000-000000001499",
      label: "Police de quartier",
      phone: "117",
      position: 1,
      updatedAt: "2026-08-31T23:30:00.000Z",
    },
  ],
};

async function mockEmergencyContacts(page: Page): Promise<void> {
  await page.route("**/api/v1/emergency-contacts", async (route) => {
    await route.fulfill({ json: emergencyResponse });
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const documentWidth = await page.locator("html").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(documentWidth.scrollWidth).toBe(documentWidth.clientWidth);
}

for (const viewport of viewports) {
  test(`emergency contacts remain accessible at ${viewport.name}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockEmergencyContacts(page);
    await page.goto("/urgences");

    await expect(
      page.getByRole("heading", { name: "Contacts d’urgence" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Navigation publique" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Urgences" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("link", { name: "Enregistrés" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "Accueil", exact: true }),
    ).toHaveAttribute("href", "/");
    await expect(
      page.getByRole("link", { name: "Contribuer" }),
    ).toHaveAttribute("href", "/contribuer");
    await expect(
      page.getByRole("link", { name: "Appeler SAMU au 112" }),
    ).toHaveAttribute("href", "tel:112");
    await expect(page.getByText(/15 septembre 2026/i)).toBeVisible();
    await expect(
      page.getByText(/ne remplace pas.*services d’urgence/i),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test("emergency call controls have a keyboard name, focus, and touch target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockEmergencyContacts(page);
  await page.goto("/urgences");
  const callAction = page.getByRole("link", { name: "Appeler SAMU au 112" });

  await expect(callAction).toBeVisible();
  await callAction.focus();
  await expect(callAction).toBeFocused();
  await expect(callAction).toHaveAttribute("href", "tel:112");
  const bounds = await callAction.boundingBox();

  expect(bounds).not.toBeNull();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
});

test("an empty API result is presented as an accessible empty emergency state", async ({
  page,
}) => {
  await page.route("**/api/v1/emergency-contacts", async (route) => {
    await route.fulfill({ json: { data: [] } });
  });
  await page.goto("/urgences");

  await expect(page.getByRole("status")).toContainText(
    "Aucun contact d’urgence n’est disponible",
  );
});

test("an API failure exposes retry and recovers with the newly fetched contact", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/v1/emergency-contacts", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({ status: 503, json: { error: {} } });
      return;
    }

    await route.fulfill({ json: retriedEmergencyResponse });
  });
  await page.goto("/urgences");

  await expect(page.getByRole("status")).toContainText(
    "Les contacts d’urgence sont indisponibles",
  );
  const retry = page.getByRole("button", { name: "Réessayer" });
  await expect(retry).toBeVisible();
  await retry.click();

  await expect(
    page.getByRole("link", { name: "Appeler Police de quartier au 117" }),
  ).toHaveAttribute("href", "tel:117");
  expect(requests).toBe(2);
});

test("an offline request has an accessible offline state", async ({ page }) => {
  await page.route("**/api/v1/emergency-contacts", async (route) => {
    await route.abort("failed");
  });
  await page.goto("/urgences");

  await expect(page.getByRole("status")).toContainText(
    "Impossible de joindre le service",
  );
});

test("Tab traversal reaches a visibly focused emergency call action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockEmergencyContacts(page);
  await page.goto("/urgences");
  const skipLink = page.getByRole("link", { name: "Aller au contenu" });
  const brand = page.getByRole("link", { name: "Pharma Garde, accueil" });
  const callAction = page.getByRole("link", { name: "Appeler SAMU au 112" });

  await expect(callAction).toBeVisible();
  await page.locator("body").press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(brand).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(callAction).toBeFocused();
  await expect(callAction).toHaveCSS("outline-style", "solid");
  expect(
    await callAction.evaluate((element) => element.matches(":focus-visible")),
  ).toBe(true);
  const bounds = await callAction.boundingBox();

  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
});
