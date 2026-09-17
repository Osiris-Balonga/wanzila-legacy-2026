import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const jagger = "00000000-0000-4000-8000-000000000101";
const mavre = "00000000-0000-4000-8000-000000000102";
const removed = "00000000-0000-4000-8000-000000000103";
const centre = "00000000-0000-4000-8000-000000000104";
const storageKey = "wanzila:saved-pharmacy-ids:v1";

const duty = {
  state: "ACTIVE",
  startsAt: "2026-09-16T08:00:00.000Z",
  endsAt: "2026-09-18T07:00:00.000Z",
  sourceFreshness: "FRESH",
};
const pharmacy = (id: string) => ({
  id,
  name:
    id === jagger
      ? "Pharmacie de nuit Jagger"
      : id === centre
        ? "Pharmacie du Centre"
        : "Pharmacie Mavré",
  address: {
    line: "Avenue des Trois Martyrs",
    district: id === jagger ? "Poto-Poto" : id === centre ? "Bacongo" : "M’Foa",
    arrondissement: "Poto-Poto",
  },
  coordinates:
    id === jagger
      ? { latitude: -4.278, longitude: 15.251 }
      : id === centre
        ? { latitude: -4.283, longitude: 15.252 }
        : { latitude: -4.279, longitude: 15.268 },
  ...(id === jagger || id === centre ? { currentDuty: duty } : {}),
});

test.beforeEach(async ({ page }) => {
  if (process.env.WANZILA_LIVE_MAP !== "1") {
    await page.route("**/maps/wanzila-style.json", (route) =>
      route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#eef0fb" },
            },
          ],
        },
      }),
    );
  }
  await page.route("**/api/v1/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: [{ ...pharmacy(jagger), currentDuty: duty }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.route("**/api/v1/pharmacies/*", (route) => {
    const id = route.request().url().split("/").at(-1);
    return id === removed
      ? route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND" } } })
      : route.fulfill({ json: { data: pharmacy(id ?? "") } });
  });
  await page.route("**/api/v1/analytics/events", (route) =>
    route.fulfill({ status: 202, json: { data: {} } }),
  );
});

test("save from the selected map and remove with keyboard/undo after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Pharmacie de nuit Jagger sur la carte/ })
    .click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(
    page.getByRole("button", { name: "Retirer des enregistrées" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Enregistrées" }).click();
  await expect(
    page.getByRole("heading", { name: "Mes pharmacies enregistrées" }),
  ).toBeVisible();
  await expect(page.getByText("Pharmacie de nuit Jagger")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Pharmacie de nuit Jagger")).toBeVisible();
  const remove = page.getByRole("button", {
    name: "Retirer Pharmacie de nuit Jagger",
  });
  await remove.focus();
  await expect(remove).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Aucune pharmacie enregistrée")).toBeVisible();
  await page.getByRole("button", { name: "Annuler le retrait" }).click();
  await expect(page.getByText("Pharmacie de nuit Jagger")).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(JSON.stringify([jagger]));
});

test("save from the public pharmacy detail links back to the saved list", async ({
  page,
}) => {
  await page.goto(`/pharmacies/${jagger}`);
  await expect(
    page.getByRole("heading", { name: "Pharmacie de nuit Jagger" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(
    page.getByRole("button", { name: "Retirer des enregistrées" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Enregistrées" }).click();
  await expect(page.getByText("Pharmacie de nuit Jagger")).toBeVisible();
});

test("saved page is responsive, has real MapLibre, and links to detail/route", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)),
    {
      key: storageKey,
      ids: process.env.WANZILA_SAVED_CAPTURE_DIR
        ? [jagger, mavre, centre]
        : [jagger, mavre],
    },
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    await page.goto("/enregistrees");
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.locator(".pharmacy-map-marker")).toHaveCount(
      process.env.WANZILA_SAVED_CAPTURE_DIR ? 3 : 2,
    );
    const markers = await page
      .locator(".pharmacy-map-marker")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().x),
      );
    expect(Math.abs((markers[0] ?? 0) - (markers[1] ?? 0))).toBeGreaterThan(20);
    await expect(page.getByText("Pharmacie de nuit Jagger")).toBeVisible();
    await expect(page.getByText("Pharmacie Mavré")).toBeVisible();
    await expect(page.getByText("Pas de garde actuellement")).toBeVisible();
    if (process.env.WANZILA_SAVED_CAPTURE_DIR) {
      await expect(page.locator(".pharmacy-map__canvas")).toHaveAttribute(
        "data-map-status",
        "ready",
      );
      await page.screenshot({
        path: resolve(
          process.env.WANZILA_SAVED_CAPTURE_DIR,
          `saved-${width}.png`,
        ),
        fullPage: false,
      });
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("link", { name: /Voir Pharmacie de nuit Jagger/ }),
    ).toHaveAttribute("href", `/pharmacies/${jagger}`);
    await expect(
      page.getByRole("link", { name: /Itinéraire Pharmacie de nuit Jagger/ }),
    ).toHaveAttribute("href", `/pharmacies/${jagger}/itineraire`);
  }
});

test("404 cleans vanished IDs, while offline IDs remain retryable", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, ids }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(ids));
    },
    { key: storageKey, ids: [jagger, removed] },
  );
  await page.goto("/enregistrees");
  await expect(
    page.getByText("1 pharmacie supprimée des enregistrées"),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(JSON.stringify([jagger]));
  await page.route("**/api/v1/pharmacies/*", (route) => route.abort());
  await page.reload();
  await expect(
    page.getByText("Impossible de charger vos pharmacies enregistrées"),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(JSON.stringify([jagger]));
  await page.unroute("**/api/v1/pharmacies/*");
  await page.route("**/api/v1/pharmacies/*", (route) =>
    route.fulfill({ json: { data: pharmacy(jagger) } }),
  );
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByText("Pharmacie de nuit Jagger")).toBeVisible();
});

test("failed local writes do not falsely remove a pharmacy", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)),
    { key: storageKey, ids: [jagger] },
  );
  await page.goto("/enregistrees");
  await expect(page.getByText("Pharmacie de nuit Jagger")).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new Error("storage blocked");
    };
  });
  await page
    .getByRole("button", { name: "Retirer Pharmacie de nuit Jagger" })
    .click();
  await expect(
    page.getByText("Impossible de modifier les enregistrées sur ce navigateur"),
  ).toBeVisible();
  await expect(page.getByText("Pharmacie de nuit Jagger")).toBeVisible();
});

test("partial API failure keeps successful cards and identifies partial failure", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)),
    { key: storageKey, ids: [jagger, mavre] },
  );
  await page.route(`**/api/v1/pharmacies/${mavre}`, (route) => route.abort());
  await page.goto("/enregistrees");
  await expect(page.getByText("Pharmacie de nuit Jagger")).toBeVisible();
  await expect(
    page.getByText("Certaines pharmacies enregistrées sont indisponibles"),
  ).toBeVisible();
});

test("failed undo keeps the list empty and reports the storage error", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)),
    { key: storageKey, ids: [jagger] },
  );
  await page.goto("/enregistrees");
  await page
    .getByRole("button", { name: "Retirer Pharmacie de nuit Jagger" })
    .click();
  await expect(page.getByText("Aucune pharmacie enregistrée")).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new Error("storage blocked");
    };
  });
  await page.getByRole("button", { name: "Annuler le retrait" }).click();
  await expect(
    page.getByText("Impossible de modifier les enregistrées sur ce navigateur"),
  ).toBeVisible();
  await expect(page.getByText("Aucune pharmacie enregistrée")).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe("[]");
});

test("a visible duty expires without reloading the saved page", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-17T00:00:00.000Z") });
  await page.addInitScript(
    ({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)),
    { key: storageKey, ids: [jagger] },
  );
  await page.route(`**/api/v1/pharmacies/${jagger}`, (route) =>
    route.fulfill({
      json: {
        data: {
          ...pharmacy(jagger),
          currentDuty: { ...duty, endsAt: "2026-09-17T00:01:00.000Z" },
        },
      },
    }),
  );
  await page.goto("/enregistrees");
  await expect(page.getByText("De garde maintenant")).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page.getByText("Garde à confirmer")).toBeVisible();
});
