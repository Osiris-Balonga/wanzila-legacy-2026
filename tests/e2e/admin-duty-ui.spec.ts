import { expect, test, type Page } from "@playwright/test";

const pharmacyId = "00000000-0000-4000-8000-000000004901";
const sourceId = "00000000-0000-4000-8000-000000004902";
const pendingId = "00000000-0000-4000-8000-000000004903";
const approvedId = "00000000-0000-4000-8000-000000004904";

const pharmacy = {
  id: pharmacyId,
  name: "Pharmacie Jagger",
  address: {
    line: "12 avenue de la Paix",
    district: "Bacongo",
    arrondissement: "Bacongo",
  },
  phone: "+242060001234",
  coordinates: { latitude: -4.263708, longitude: 15.242885 },
  status: "PUBLISHED",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

const source = {
  id: sourceId,
  name: "Planning officiel",
  description: "Source communiquée par le service de garde",
  reliability: 90,
  observedAt: "2026-09-15T08:00:00.000Z",
  updatedAt: "2026-09-15T08:00:00.000Z",
  freshness: "FRESH",
};

const pending = {
  id: pendingId,
  pharmacyId,
  sourceId,
  startsAt: "2026-09-17T08:00:00.000Z",
  endsAt: "2026-09-18T08:00:00.000Z",
  status: "PENDING",
  createdAt: "2026-09-16T08:00:00.000Z",
  updatedAt: "2026-09-16T08:00:00.000Z",
};

const approved = {
  ...pending,
  id: approvedId,
  status: "APPROVED",
};

const pagination = (total: number, page = 1) => ({
  page,
  pageSize: 10,
  total,
  totalPages: Math.ceil(total / 10),
});

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function mockDutyApi(
  page: Page,
  options: {
    duties?: (typeof pending)[];
    total?: number;
    listStatus?: number;
    holdList?: Promise<void>;
  } = {},
) {
  if (!process.env.WANZILA_DUTY_LIVE_MAP) {
    await page.route("**/maps/wanzila-style.json", (route) =>
      route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "ground",
              type: "background",
              paint: { "background-color": "#edf0f8" },
            },
          ],
        },
      }),
    );
  }
  await page.route("**/api/v1/admin/duties/summary", (route) =>
    route.fulfill({
      json: {
        data: {
          asOf: "2026-09-16T12:00:00.000Z",
          active: 2,
          upcoming: 3,
          expired: 4,
          withoutRecentDuty: 5,
        },
      },
    }),
  );
  await page.route("**/api/v1/admin/duties?*", async (route) => {
    await options.holdList;
    const requestedPage = Number(
      new URL(route.request().url()).searchParams.get("page") ?? 1,
    );
    await route.fulfill({
      status: options.listStatus ?? 200,
      json:
        options.listStatus && options.listStatus >= 400
          ? {
              error: { code: "BAD_REQUEST", message: "Recherche indisponible" },
            }
          : {
              data: options.duties ?? [pending, approved],
              pagination: pagination(options.total ?? 12, requestedPage),
            },
    });
  });
  await page.route(`**/api/v1/admin/pharmacies/${pharmacyId}`, (route) =>
    route.fulfill({ json: { data: pharmacy } }),
  );
  await page.route("**/api/v1/admin/pharmacies?*", (route) =>
    route.fulfill({
      json: {
        data: [pharmacy],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.route("**/api/v1/admin/sources?*", (route) =>
    route.fulfill({
      json: {
        data: [source],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      },
    }),
  );
}

test("list has real summary, resolved pharmacy/source and no invented trends", async ({
  page,
}) => {
  await mockDutyApi(page);
  await page.goto("/admin/gardes");
  await expect(
    page.getByRole("heading", { name: "Gardes", exact: true }),
  ).toBeVisible();
  const summary = page.getByRole("region", { name: "Résumé des gardes" });
  await expect(summary).toContainText("2");
  await expect(summary).toContainText("3");
  await expect(summary).toContainText("4");
  await expect(summary).toContainText("5");
  const list = page.getByRole("region", { name: "Liste des gardes" });
  await expect(list).toContainText(pharmacy.name);
  await expect(list).toContainText(source.name);
  await expect(list).toContainText("Source actualisée");
  await expect(list.locator("img")).toHaveCount(0);
  await expect(page.getByText(/\+12%|\+8%|\+5%|\+20%/)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Créer une garde" }),
  ).toHaveAttribute("href", "/admin/gardes/nouvelle");
  await expect(
    page.getByRole("link", { name: "Voir la pharmacie" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: `Actions pour ${pharmacy.name}` })
    .first()
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Voir la pharmacie" }),
  ).toBeVisible();
});

test("loading, empty and error states remain on the duty surface", async ({
  page,
}) => {
  let release!: () => void;
  const holdList = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockDutyApi(page, { duties: [], total: 0, holdList });
  await page.goto("/admin/gardes");
  await expect(page.getByRole("status")).toContainText(/chargement|recherche/i);
  release();
  await expect(page.getByText("Aucune garde trouvée")).toBeVisible();
  await page.unroute("**/api/v1/admin/duties?*");
  await page.route("**/api/v1/admin/duties?*", (route) =>
    route.fulfill({
      status: 500,
      json: { error: "Internal Server Error" },
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(/gardes.*indisponibles/i);
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
});

test("search, status, source, date interval and pagination use server parameters", async ({
  page,
}) => {
  await mockDutyApi(page);
  await page.goto("/admin/gardes");
  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith("/admin/duties") &&
      url.searchParams.get("q") === "Jagger"
    );
  });
  await page
    .getByRole("searchbox", { name: "Rechercher une pharmacie" })
    .fill(" Jagger ");
  await page
    .getByRole("searchbox", { name: "Rechercher une pharmacie" })
    .press("Enter");
  await searchRequest;
  const statusRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).searchParams.get("status") === "PENDING",
  );
  await chooseOption(page, "État de revue", "En attente");
  await statusRequest;
  const sourceRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).searchParams.get("sourceId") === sourceId,
  );
  await chooseOption(page, "Source", source.name);
  await sourceRequest;
  await page.getByLabel("Du").fill("2026-09-17");
  await page.getByLabel("Au").fill("2026-09-19");
  const dateRequest = page.waitForRequest((request) => {
    const query = new URL(request.url()).searchParams;
    return Boolean(query.get("from") && query.get("to"));
  });
  await page.getByRole("button", { name: "Appliquer les dates" }).click();
  await dateRequest;
  const pageRequest = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get("page") === "2",
  );
  await page.getByRole("button", { name: "Page suivante" }).click();
  await pageRequest;
  await page.reload();
  await expect(page.getByLabel("Du")).toHaveValue("2026-09-17");
  await expect(page.getByLabel("Au")).toHaveValue("2026-09-19");
});

test("creation validates dates with keyboard then saves a PENDING duty", async ({
  page,
}) => {
  await mockDutyApi(page);
  await page.route("**/api/v1/admin/duties", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 201, json: { data: pending } });
    }
    return route.continue();
  });
  await page.goto("/admin/gardes/nouvelle");
  await expect(
    page.getByRole("heading", { name: "Créer une garde" }),
  ).toBeVisible();
  await chooseOption(page, "Pharmacie", pharmacy.name);
  await chooseOption(page, "Source du planning", source.name);
  await page.getByLabel("Date de début").fill("2026-09-18");
  await page.getByLabel("Heure de début").fill("08:00");
  await page.getByLabel("Date de fin").fill("2026-09-17");
  await page.getByLabel("Heure de fin").fill("08:00");
  const save = page.getByRole("button", { name: "Enregistrer la garde" });
  await save.focus();
  await expect(save).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText(/fin.*après.*début/i);
  await page.getByLabel("Date de fin").fill("2026-09-19");
  const createRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/admin/duties"),
  );
  await save.press("Enter");
  const request = await createRequest;
  expect(request.postDataJSON()).toMatchObject({ pharmacyId, sourceId });
  await expect(page.getByRole("status")).toContainText(
    /en attente d.approbation/i,
  );
  await expect(page.getByText(/automatiquement visible/i)).toHaveCount(0);
});

test("review actions expose approve, reject and a truthful 409 conflict", async ({
  page,
}) => {
  await mockDutyApi(page, { duties: [pending], total: 1 });
  await page.route(`**/api/v1/admin/duties/${pendingId}/approve`, (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: { code: "CONFLICT", message: "Overlapping approved duty" },
      },
    }),
  );
  await page.route(`**/api/v1/admin/duties/${pendingId}/reject`, (route) =>
    route.fulfill({ json: { data: { ...pending, status: "REJECTED" } } }),
  );
  await page.goto("/admin/gardes");
  await page
    .getByRole("button", { name: `Approuver la garde de ${pharmacy.name}` })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmer l’approbation" })
    .click();
  await expect(page.getByRole("alert")).toContainText(/conflit|chevauchement/i);
  await expect(
    page.getByRole("row", { name: new RegExp(pharmacy.name) }),
  ).toContainText("En attente");
  await page
    .getByRole("button", { name: `Rejeter la garde de ${pharmacy.name}` })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmer le rejet" })
    .click();
  await expect(
    page.getByRole("row", { name: new RegExp(pharmacy.name) }),
  ).toContainText("Rejetée");
});

test("a successful approval changes only the reviewed PENDING duty", async ({
  page,
}) => {
  await mockDutyApi(page, { duties: [pending], total: 1 });
  await page.route(`**/api/v1/admin/duties/${pendingId}/approve`, (route) =>
    route.fulfill({ json: { data: { ...pending, status: "APPROVED" } } }),
  );
  await page.goto("/admin/gardes");
  const approvalRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith(
        `/admin/duties/${pendingId}/approve`,
      ),
  );
  await page
    .getByRole("button", { name: `Approuver la garde de ${pharmacy.name}` })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmer l’approbation" })
    .click();
  await approvalRequest;
  await expect(
    page.getByRole("row", { name: new RegExp(pharmacy.name) }),
  ).toContainText("Approuvée");
  await expect(page.getByText("Garde publiée", { exact: true })).toHaveCount(0);
});

test("primary violet actions keep white labels at rest, hover and while disabled", async ({
  page,
}) => {
  await mockDutyApi(page);
  await page.goto("/admin/gardes");
  const create = page.getByRole("link", { name: "Créer une garde" });
  await expect(create).toHaveCSS("color", "rgb(255, 255, 255)");
  await create.hover();
  await expect(create).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.goto("/admin/gardes/nouvelle");
  const save = page.getByRole("button", { name: "Enregistrer la garde" });
  await expect(save).toHaveCSS("color", "rgb(255, 255, 255)");
  await save.evaluate((button) => button.setAttribute("disabled", ""));
  await expect(save).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("list and creation remain keyboard accessible without overflow at required widths", async ({
  page,
}) => {
  await mockDutyApi(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/gardes");
    await expect(
      page.getByRole("link", { name: "Créer une garde" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Liste des gardes" }),
    ).toContainText(pharmacy.name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width <= 390) {
      expect(
        await page
          .locator('[data-slot="table-container"]')
          .evaluate((table) => table.scrollWidth <= table.clientWidth),
      ).toBe(true);
    }
    await page.goto("/admin/gardes/nouvelle");
    await expect(page.getByLabel("Date de début")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const date = page.getByLabel("Date de début");
  await date.focus();
  await expect(date).toBeFocused();
  await expect(date).toHaveCSS("outline-style", /solid|auto/);
});

test("visual evidence at source and responsive widths", async ({
  page,
}, testInfo) => {
  test.skip(!process.env.WANZILA_DUTY_CAPTURE, "Manual evidence capture only");
  test.setTimeout(180_000);
  await mockDutyApi(page);
  for (const width of [390, 1440, 1586]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 992 });
    await page.goto("/admin/gardes");
    await expect(
      page.getByRole("region", { name: "Liste des gardes" }),
    ).toContainText(pharmacy.name);
    await page.screenshot({
      path: testInfo.outputPath(`list-${width}.png`),
      animations: "disabled",
      fullPage: true,
    });
    await page.goto("/admin/gardes/nouvelle");
    await chooseOption(page, "Pharmacie", pharmacy.name);
    await chooseOption(page, "Source du planning", source.name);
    await page.getByLabel("Date de début").fill("2026-09-17");
    await page.getByLabel("Heure de début").fill("08:00");
    await page.getByLabel("Date de fin").fill("2026-09-18");
    await page.getByLabel("Heure de fin").fill("08:00");
    await page.getByRole("heading", { name: "Créer une garde" }).click();
    if (process.env.WANZILA_DUTY_LIVE_MAP) {
      await expect(
        page.getByRole("region", {
          name: `Carte de localisation de ${pharmacy.name}`,
        }),
      ).toHaveAttribute("data-map-status", "ready", { timeout: 25_000 });
    }
    await page.screenshot({
      path: testInfo.outputPath(`create-${width}.png`),
      animations: "disabled",
      fullPage: true,
    });
  }
});
