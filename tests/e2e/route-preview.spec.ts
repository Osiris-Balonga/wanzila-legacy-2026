import { expect, test } from "@playwright/test";

const id = "00000000-0000-4000-8000-000000000007";
const pharmacy = {
  id,
  name: "Pharmacie Jagger",
  address: {
    line: "Avenue des Trois Martyrs",
    district: "Poto-Poto",
    arrondissement: "Poto-Poto",
  },
  phone: "+242067324518",
  coordinates: { latitude: -4.2636, longitude: 15.2429 },
  currentDuty: {
    state: "ACTIVE",
    startsAt: "2026-09-16T08:00:00.000Z",
    endsAt: "2026-09-17T07:00:00.000Z",
    sourceFreshness: "FRESH",
    source: { name: "Source de test", observedAt: "2026-09-16T10:00:00.000Z" },
  },
};

test.use({
  locale: "fr-FR",
  timezoneId: "Africa/Brazzaville",
  reducedMotion: "reduce",
});

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
            paint: { "background-color": "#f4f5ff" },
          },
        ],
      },
    }),
  );
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({ json: { data: pharmacy } }),
  );
});

test("detail hand-off and fixture preview retain truthful labels and destination", async ({
  page,
}) => {
  await page.goto(`/pharmacies/${id}`);
  await page.getByRole("link", { name: "Itinéraire" }).click();
  await expect(page).toHaveURL(new RegExp(`/pharmacies/${id}/itineraire$`));
  await expect(
    page.getByRole("heading", { name: pharmacy.name }),
  ).toBeVisible();
  await expect(page.getByText(/tracé de démonstration/i)).toBeVisible();
  await expect(page.getByText("7 min")).toBeVisible();
  await expect(page.getByText("2,4 km")).toBeVisible();
  await expect(page.getByText(/Avenue des Trois Martyrs/)).toBeVisible();
  const external = page.getByRole("link", {
    name: /ouvrir l’itinéraire dans google maps/i,
  });
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", /noopener/);
  const href = await external.getAttribute("href");
  expect(new URL(href!).searchParams.get("destination")).toBe(
    "-4.2636,15.2429",
  );
  await page.getByRole("button", { name: "À pied" }).click();
  await expect(page.getByText("7 min")).toHaveCount(0);
  await expect(page.getByText(/aucun trajet calculé/i)).toBeVisible();
  await expect(external).toHaveAttribute("href", /travelmode=walking/);
});

test("location is requested only on click; denial and retry preserve destination hand-off", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const witness = { calls: 0, outcome: "denied" as "denied" | "success" };
    (window as typeof window & { __geoWitness: typeof witness }).__geoWitness =
      witness;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(
          success: PositionCallback,
          error: PositionErrorCallback,
        ) {
          witness.calls += 1;
          if (witness.outcome === "denied")
            error({ code: 1 } as GeolocationPositionError);
          else
            success({
              coords: { latitude: -4.277, longitude: 15.25 },
            } as GeolocationPosition);
        },
      },
    });
  });
  await page.goto(`/pharmacies/${id}/itineraire`);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __geoWitness: { calls: number } })
          .__geoWitness.calls,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Utiliser ma position" }).click();
  await expect(page.getByText(/position refusée/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toBeVisible();
  await page.evaluate(
    () =>
      ((
        window as typeof window & { __geoWitness: { outcome: string } }
      ).__geoWitness.outcome = "success"),
  );
  await page.getByRole("button", { name: "Réessayer la position" }).click();
  await expect(page.getByText(/position obtenue/i)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __geoWitness: { calls: number } })
          .__geoWitness.calls,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: "Effacer ma position" }).click();
  await expect(page.getByText(/position obtenue/i)).toHaveCount(0);
});

test("missing or invalid coordinates never create external navigation", async ({
  page,
}) => {
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({
      json: {
        data: { ...pharmacy, coordinates: { latitude: 95, longitude: 15 } },
      },
    }),
  );
  await page.goto(`/pharmacies/${id}/itineraire`);
  await expect(page.getByText(/coordonnées.*indisponibles/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toHaveCount(0);
});

test("route preview is keyboard-accessible and responsive", async ({
  page,
}, testInfo) => {
  await page.goto(`/pharmacies/${id}/itineraire`);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: pharmacy.name }),
    ).toBeVisible();
    const overflow = await page
      .locator("html")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath(`route-preview-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /retour/i })).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Utiliser ma position" }),
  ).toBeVisible();
});
