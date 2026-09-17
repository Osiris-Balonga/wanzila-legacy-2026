import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

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

const calculatedRoute = {
  data: {
    pharmacyId: id,
    mode: "car",
    distanceMeters: 3422.8,
    durationSeconds: 281.1,
    geometry: {
      type: "LineString",
      coordinates: [
        [15.2492, -4.2792],
        [15.245, -4.27],
        [15.2429, -4.2636],
      ],
    },
    steps: [
      {
        distanceMeters: 200,
        durationSeconds: 22,
        name: "Avenue des Trois Martyrs",
        maneuver: { type: "depart", location: [15.2492, -4.2792] },
      },
      {
        distanceMeters: 3222.8,
        durationSeconds: 259.1,
        name: "Rue du marché",
        maneuver: { type: "turn", modifier: "left", location: [15.245, -4.27] },
      },
    ],
    snapDistanceMeters: { origin: 2, destination: 4 },
    provider: {
      name: "FOSSGIS / OSRM / OpenStreetMap",
      attributionUrl: "https://routing.openstreetmap.de/about.html",
      fixMapUrl: "https://www.openstreetmap.org/fixthemap",
    },
  },
};

test.use({
  locale: "fr-FR",
  timezoneId: "Africa/Brazzaville",
  reducedMotion: "reduce",
});

test.beforeEach(async ({ page }) => {
  if (process.env.WANZILA_ROUTE_LIVE_MAP !== "1") {
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
  }
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({ json: { data: pharmacy } }),
  );
  await page.route("**/api/v1/analytics/events", (route) =>
    route.fulfill({ status: 202, json: { data: {} } }),
  );
});

test("route is calculated only after location and transmission consent", async ({
  page,
}, testInfo) => {
  let routeRequests = 0;
  await page.route("**/api/v1/routes", (route) => {
    routeRequests += 1;
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      pharmacyId: id,
      origin: { latitude: -4.2792, longitude: 15.2492 },
      mode: "car",
      locationConsent: true,
    });
    return route.fulfill({ json: calculatedRoute });
  });
  await page.addInitScript(() => {
    const witness: { success?: PositionCallback } = {};
    (window as typeof window & { __routeWatch: typeof witness }).__routeWatch =
      witness;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          success({
            coords: { latitude: -4.2792, longitude: 15.2492, accuracy: 8 },
          } as GeolocationPosition);
        },
        watchPosition(success: PositionCallback) {
          witness.success = success;
          return 1;
        },
        clearWatch() {},
      },
    });
  });
  await page.goto(`/pharmacies/${id}`);
  await page.getByRole("link", { name: "Itinéraire" }).click();
  await expect(page).toHaveURL(new RegExp(`/pharmacies/${id}/itineraire$`));
  await expect(
    page.getByRole("heading", { name: pharmacy.name }),
  ).toBeVisible();
  expect(routeRequests).toBe(0);
  await expect(
    page.getByText(/Localisez-vous puis autorisez le calcul/i),
  ).toBeVisible();
  await page.getByRole("button", { name: "Utiliser ma position" }).click();
  expect(routeRequests).toBe(0);
  await expect(page.getByText(/service FOSSGIS/i)).toBeVisible();
  await page
    .getByRole("button", { name: "Calculer l’itinéraire avec ma position" })
    .click();
  await expect(page.getByText("5 min", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("(3,4 km)")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Étapes de l’itinéraire" }),
  ).toContainText("Tourner à gauche");
  await expect(
    page.getByRole("link", { name: "Corriger la carte" }),
  ).toHaveAttribute("href", calculatedRoute.data.provider.fixMapUrl);
  expect(routeRequests).toBe(1);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".pharmacy-detail-map__canvas")).toHaveAttribute(
      "data-map-status",
      "ready",
    );
    await expect(page.locator(".pharmacy-detail-map__canvas")).toHaveAttribute(
      "data-map-idle",
      "true",
    );
    const overflow = await page
      .locator("html")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, `calculated route overflow at ${width}px`).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath(
        "visual-evidence",
        `route-calculated-${width}.png`,
      ),
      fullPage: true,
      animations: "disabled",
    });
  }
  const canvas = page.locator(".maplibregl-canvas");
  await canvas.evaluate((element) =>
    element.setAttribute("data-route-instance", "same"),
  );
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/pharmacies/${id}/navigation$`));
  await expect(
    page.getByRole("region", { name: "Étapes de l’itinéraire" }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-route-instance", "same");
  await page.evaluate(() =>
    (
      window as typeof window & { __routeWatch: { success?: PositionCallback } }
    ).__routeWatch.success?.({
      coords: { latitude: -4.2636, longitude: 15.2429, accuracy: 5 },
    } as GeolocationPosition),
  );
  await expect(
    page.getByRole("heading", { name: /arrivée à proximité/i }),
  ).toBeVisible();
  await expect(page.locator(".route-preview-map-origin--current")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Terminer le suivi" }).click();
  await expect(
    page.locator(".route-preview-stops").getByText(/Avenue des Trois Martyrs/),
  ).toBeVisible();
  const external = page.getByRole("link", {
    name: /ouvrir l’itinéraire dans google maps/i,
  });
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", /noopener/);
  const href = await external.getAttribute("href");
  expect(new URL(href!).searchParams.get("destination")).toBe(
    "-4.2636,15.2429",
  );
  await page.getByRole("button", { name: "Effacer ma position" }).click();
  await expect(
    page.getByRole("region", { name: "Étapes de l’itinéraire" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "À pied" }).click();
  await expect(external).toHaveAttribute("href", /travelmode=walking/);
});

test("routing failure is honest and can be retried without a fictitious line", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/v1/routes", (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({
          status: 429,
          json: { error: { code: "RATE_LIMITED" } },
        })
      : route.fulfill({
          json: {
            data: {
              ...calculatedRoute.data,
              snapDistanceMeters: { origin: 2, destination: 180 },
            },
          },
        });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          success({
            coords: { latitude: -4.2792, longitude: 15.2492 },
          } as GeolocationPosition);
        },
      },
    });
  });
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page.getByRole("button", { name: "Utiliser ma position" }).click();
  await page
    .getByRole("button", { name: "Calculer l’itinéraire avec ma position" })
    .click();
  await expect(page.getByText(/Service de trajet occupé/i)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Étapes de l’itinéraire" }),
  ).toHaveCount(0);
  await expect(page.locator(".route-preview-map-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Réessayer le calcul" }).click();
  await expect(
    page.getByRole("region", { name: "Étapes de l’itinéraire" }),
  ).toBeVisible();
  await expect(page.getByText(/se termine à 180 m du point/i)).toBeVisible();
  expect(calls).toBe(2);
});

test("imprecise GPS origin is disclosed before consent and beside the route distance", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/v1/routes", (route) => {
    calls += 1;
    return route.fulfill({ json: calculatedRoute });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          success({
            coords: { latitude: -4.2792, longitude: 15.2492, accuracy: 250 },
          } as GeolocationPosition);
        },
      },
    });
  });
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page.getByRole("button", { name: "Utiliser ma position" }).click();
  await expect(
    page.getByText(/position GPS est imprécise \(± 250 m\)/i),
  ).toBeVisible();
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Calculer l’itinéraire avec ma position" })
    .click();
  await expect(page.locator(".route-preview-summary")).toContainText(
    /distance du trajet peuvent être inexacts/i,
  );
  expect(calls).toBe(1);
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
  await expect(
    page.getByText(/position obtenue pour cette session/i),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __geoWitness: { calls: number } })
          .__geoWitness.calls,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: "Effacer ma position" }).click();
  await expect(
    page.getByText(/position obtenue pour cette session/i),
  ).toHaveCount(0);
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
  await expect(
    page.getByText(/Coordonnées de destination indisponibles\. Consultez/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toHaveCount(0);
});

test("unsupported, unavailable and timeout states keep a usable fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const witness = { code: 2 };
    (window as typeof window & { __geoError: typeof witness }).__geoError =
      witness;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(
          _success: PositionCallback,
          error: PositionErrorCallback,
        ) {
          error({ code: witness.code } as GeolocationPositionError);
        },
      },
    });
  });
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page.getByRole("button", { name: "Utiliser ma position" }).click();
  await expect(page.getByText(/position indisponible/i)).toBeVisible();
  await page.evaluate(
    () =>
      ((
        window as typeof window & { __geoError: { code: number } }
      ).__geoError.code = 3),
  );
  await page.getByRole("button", { name: "Réessayer la position" }).click();
  await expect(page.getByText(/recherche de position a expiré/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copier l’adresse" }),
  ).toBeEnabled();
});

test("cancelling a pending location request ignores a late callback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const witness: { calls: number; success?: PositionCallback } = { calls: 0 };
    (window as typeof window & { __geoPending: typeof witness }).__geoPending =
      witness;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          witness.calls += 1;
          witness.success = success;
        },
      },
    });
  });
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page.getByRole("button", { name: "Utiliser ma position" }).click();
  await expect(page.getByText(/recherche de votre position/i)).toBeVisible();
  await page.getByRole("button", { name: "Annuler la localisation" }).click();
  await page.evaluate(() =>
    (
      window as typeof window & { __geoPending: { success?: PositionCallback } }
    ).__geoPending.success?.({
      coords: { latitude: -4.277, longitude: 15.25 },
    } as GeolocationPosition),
  );
  await expect(
    page.getByText(/position obtenue pour cette session/i),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __geoPending: { calls: number } })
          .__geoPending.calls,
    ),
  ).toBe(1);
});

test("unsupported geolocation does not block external directions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page.getByRole("button", { name: "Utiliser ma position" }).click();
  await expect(
    page.getByText(/ne prend pas en charge la géolocalisation/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toBeVisible();
});

test("no pharmacy shows a route before explicit calculation", async ({
  page,
}) => {
  await page.route(`**/api/v1/pharmacies/${id}`, (route) =>
    route.fulfill({
      json: { data: { ...pharmacy, name: "Pharmacie de quartier" } },
    }),
  );
  await page.goto(`/pharmacies/${id}/itineraire`);
  await expect(
    page.getByText(/Localisez-vous puis autorisez le calcul/i),
  ).toBeVisible();
  await expect(page.getByText("7 min", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toBeVisible();
});

test("map failure leaves destination, address, call and external hand-off", async ({
  page,
}) => {
  await page.route("**/maps/wanzila-style.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto(`/pharmacies/${id}/itineraire`);
  await expect(page.getByText(/fond de carte indisponible/i)).toBeVisible();
  await expect(
    page.locator(".route-preview-stops").getByText(/Avenue des Trois Martyrs/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copier l’adresse" }),
  ).toBeEnabled();
  await expect(page.getByRole("link", { name: "Appeler" })).toHaveAttribute(
    "href",
    "tel:+242067324518",
  );
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toBeVisible();
});

test("the route map can be explored by dragging without requesting location", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/pharmacies/${id}/itineraire`);
  await expect(page.locator(".pharmacy-detail-map__canvas")).toHaveAttribute(
    "data-map-status",
    "ready",
  );
  const marker = page.locator(".pharmacy-detail-map__marker");
  const before = await marker.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(30, 350);
  await page.mouse.down();
  await page.mouse.move(120, 350, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await marker.boundingBox())?.x)
    .toBeGreaterThan(before!.x + 25);
  await expect(
    page.getByText(/position obtenue pour cette session/i),
  ).toHaveCount(0);
});

test("route preview is keyboard-accessible and responsive", async ({
  page,
}, testInfo) => {
  await page.goto(`/pharmacies/${id}/itineraire`);
  if (process.env.WANZILA_ROUTE_LIVE_MAP === "1") {
    await expect(page.locator(".pharmacy-detail-map__canvas")).toHaveAttribute(
      "data-map-status",
      "ready",
      { timeout: 30000 },
    );
  }
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
      path: process.env.WANZILA_ROUTE_CAPTURE_DIR
        ? resolve(
            process.env.WANZILA_ROUTE_CAPTURE_DIR,
            `route-preview-${width}.png`,
          )
        : testInfo.outputPath(`route-preview-${width}.png`),
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
