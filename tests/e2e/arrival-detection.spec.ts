import { expect, test, type Page } from "@playwright/test";
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
};

type ArrivalWitness = {
  calls: number;
  cleared: number[];
  success?: PositionCallback;
  error?: PositionErrorCallback;
};

async function installLocationMock(page: Page) {
  await page.addInitScript(() => {
    const witness: ArrivalWitness = { calls: 0, cleared: [] };
    (
      window as typeof window & { __arrivalWitness: ArrivalWitness }
    ).__arrivalWitness = witness;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition() {
          throw new Error(
            "Preview geolocation must not be used by arrival watch",
          );
        },
        watchPosition(success: PositionCallback, error: PositionErrorCallback) {
          witness.calls += 1;
          witness.success = success;
          witness.error = error;
          return witness.calls;
        },
        clearWatch(watchId: number) {
          witness.cleared.push(watchId);
        },
      },
    });
  });
}

async function emitPosition(page: Page, latitude: number, longitude: number) {
  await page.evaluate(
    ({ latitude, longitude }) => {
      (
        window as typeof window & { __arrivalWitness: ArrivalWitness }
      ).__arrivalWitness.success?.({
        coords: { latitude, longitude },
      } as GeolocationPosition);
    },
    { latitude, longitude },
  );
}

async function emitError(page: Page, code: number) {
  await page.evaluate((code) => {
    (
      window as typeof window & { __arrivalWitness: ArrivalWitness }
    ).__arrivalWitness.error?.({ code } as GeolocationPositionError);
  }, code);
}

async function witness(page: Page) {
  return page.evaluate(() => {
    const { calls, cleared } = (
      window as typeof window & { __arrivalWitness: ArrivalWitness }
    ).__arrivalWitness;
    return { calls, cleared };
  });
}

test.use({
  locale: "fr-FR",
  timezoneId: "Africa/Brazzaville",
  reducedMotion: "reduce",
});

test.beforeEach(async ({ page }) => {
  if (process.env.WANZILA_ARRIVAL_LIVE_MAP !== "1") {
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
});

test("explicit start, one arrival at 50 m, cleanup, no position storage or transmission", async ({
  page,
}) => {
  await installLocationMock(page);
  const requests: string[] = [];
  page.on("request", (request) =>
    requests.push(`${request.url()} ${request.postData() ?? ""}`),
  );
  await page.goto(`/pharmacies/${id}/itineraire`);
  expect(await witness(page)).toEqual({ calls: 0, cleared: [] });
  await expect(page.getByText(/uniquement pendant ce suivi/i)).toBeVisible();
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/pharmacies/${id}/navigation$`));
  expect(await witness(page)).toEqual({ calls: 1, cleared: [] });
  await emitPosition(page, -4.2646, 15.2429);
  await expect(page.getByText(/distance à vol d’oiseau/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /suivi d’arrivée en cours/i }),
  ).toBeVisible();
  await emitPosition(page, -4.2636, 15.2429);
  await expect(
    page.getByRole("heading", { name: /arrivée à proximité/i }),
  ).toBeVisible();
  expect(await witness(page)).toEqual({ calls: 1, cleared: [1] });
  await emitPosition(page, -4.2636, 15.2429);
  await expect(
    page.getByRole("heading", { name: /arrivée à proximité/i }),
  ).toHaveCount(1);
  expect(await witness(page)).toEqual({ calls: 1, cleared: [1] });
  const storage = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }));
  expect(JSON.stringify(storage)).not.toContain("-4.2636");
  expect(JSON.stringify(storage)).not.toContain("15.2429");
  expect(requests.join("\n")).not.toContain("-4.2646");
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toHaveAttribute("href", /destination=-4.2636%2C15.2429/);
});

test("denial is distinct from timeout and preserves external hand-off", async ({
  page,
}) => {
  await installLocationMock(page);
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await emitError(page, 1);
  await expect(page.getByText(/position refusée/i)).toBeVisible();
  expect(await witness(page)).toEqual({ calls: 1, cleared: [1] });
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Réessayer le suivi" }).click();
  await emitError(page, 3);
  await expect(page.getByText(/a expiré/i)).toBeVisible();
  expect(await witness(page)).toEqual({ calls: 2, cleared: [1, 2] });
});

test("cancel, history navigation and late callbacks stop the watcher", async ({
  page,
}) => {
  await installLocationMock(page);
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await emitPosition(page, -4.2646, 15.2429);
  await page.getByRole("button", { name: "Quitter le suivi" }).click();
  await expect(page.getByText(/suivi arrêté/i)).toBeVisible();
  expect(await witness(page)).toEqual({ calls: 1, cleared: [1] });
  await emitPosition(page, -4.2636, 15.2429);
  await expect(page.getByText(/arrivée à proximité/i)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  expect((await witness(page)).calls).toBe(2);
  await page.goBack();
  expect((await witness(page)).cleared).toEqual([1, 2]);
  await expect(page.getByText(/suivi arrêté/i)).toBeVisible();
});

test("direct navigation route still requires explicit start, and unsupported is safe", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto(`/pharmacies/${id}/navigation`);
  await expect(
    page.getByRole("button", { name: "Démarrer le suivi d’arrivée" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect(
    page.getByText(/ne prend pas en charge la géolocalisation/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /ouvrir l’itinéraire dans google maps/i }),
  ).toBeVisible();
});

test("responsive live-map evidence for active, arrived, cancelled and error states", async ({
  page,
}, testInfo) => {
  await installLocationMock(page);
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await emitPosition(page, -4.2646, 15.2429);
  await expect(page.locator(".pharmacy-detail-map__canvas")).toHaveAttribute(
    "data-map-status",
    "ready",
    { timeout: 30000 },
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page
      .locator("html")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBe(0);
    await page.screenshot({
      path: process.env.WANZILA_ARRIVAL_CAPTURE_DIR
        ? resolve(
            process.env.WANZILA_ARRIVAL_CAPTURE_DIR,
            `active-${width}.png`,
          )
        : testInfo.outputPath(`active-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /retour/i })).toBeFocused();
  await emitPosition(page, -4.2636, 15.2429);
  await page.screenshot({
    path: process.env.WANZILA_ARRIVAL_CAPTURE_DIR
      ? resolve(process.env.WANZILA_ARRIVAL_CAPTURE_DIR, "arrived-390.png")
      : testInfo.outputPath("arrived-390.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Terminer le suivi" }).click();
  await page.screenshot({
    path: process.env.WANZILA_ARRIVAL_CAPTURE_DIR
      ? resolve(process.env.WANZILA_ARRIVAL_CAPTURE_DIR, "cancelled-390.png")
      : testInfo.outputPath("cancelled-390.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await emitError(page, 2);
  await page.screenshot({
    path: process.env.WANZILA_ARRIVAL_CAPTURE_DIR
      ? resolve(process.env.WANZILA_ARRIVAL_CAPTURE_DIR, "error-390.png")
      : testInfo.outputPath("error-390.png"),
    fullPage: true,
    animations: "disabled",
  });
});
