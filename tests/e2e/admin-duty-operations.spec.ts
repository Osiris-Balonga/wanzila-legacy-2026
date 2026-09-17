import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const dutyId = "00000000-0000-4000-8000-000000004904";
const pharmacyId = "00000000-0000-4000-8000-000000004901";
const sourceId = "00000000-0000-4000-8000-000000004902";
const exceptionId = "00000000-0000-4000-8000-000000004905";
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
const pagination = (total: number) => ({
  page: 1,
  pageSize: 50,
  total,
  totalPages: total ? 1 : 0,
});

async function mockSources(
  page: Page,
  onMutation?: (method: string, body: Record<string, unknown>) => void,
) {
  let sources = [source];
  await page.route("**/api/v1/admin/sources?*", (route) =>
    route.fulfill({
      json: { data: sources, pagination: pagination(sources.length) },
    }),
  );
  await page.route("**/api/v1/admin/sources", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    onMutation?.("POST", body);
    sources = [
      ...sources,
      { ...source, ...body, id: "00000000-0000-4000-8000-000000004906" },
    ];
    return route.fulfill({ status: 201, json: { data: sources.at(-1) } });
  });
  await page.route(`**/api/v1/admin/sources/${sourceId}`, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    onMutation?.("PATCH", body);
    sources = sources.map((item) =>
      item.id === sourceId
        ? {
            ...item,
            ...body,
            description:
              typeof body.description === "string" ? body.description : "",
          }
        : item,
    );
    return route.fulfill({ json: { data: sources[0] } });
  });
}

async function mockExceptionApi(
  page: Page,
  status: "APPROVED" | "PENDING" = "APPROVED",
) {
  let exceptions: Array<Record<string, unknown>> = [];
  let saved: Record<string, unknown> | null = null;
  await page.route(`**/api/v1/admin/duties/${dutyId}`, (route) =>
    route.fulfill({ json: { data: { ...duty, status } } }),
  );
  await page.route(`**/api/v1/admin/pharmacies/${pharmacyId}`, (route) =>
    route.fulfill({ json: { data: pharmacy } }),
  );
  await page.route(`**/api/v1/admin/duties/${dutyId}/exceptions?*`, (route) =>
    route.fulfill({
      json: { data: exceptions, pagination: pagination(exceptions.length) },
    }),
  );
  await page.route(`**/api/v1/admin/duties/${dutyId}/exceptions`, (route) => {
    saved = route.request().postDataJSON() as Record<string, unknown>;
    const record = {
      id: exceptionId,
      dutyPeriodId: dutyId,
      ...saved,
      createdAt: "2026-09-17T08:00:00.000Z",
      updatedAt: "2026-09-17T08:00:00.000Z",
    };
    exceptions = [record];
    return route.fulfill({ status: 201, json: { data: record } });
  });
  return { saved: () => saved };
}

test("source management creates and edits a dated source from the real contract", async ({
  page,
}) => {
  const mutations: Array<{ method: string; body: Record<string, unknown> }> =
    [];
  await mockSources(page, (method, body) => mutations.push({ method, body }));
  await page.goto("/admin/gardes/sources");
  await expect(
    page.getByRole("region", { name: "Liste des sources" }),
  ).toContainText("Planning officiel");
  await page
    .getByRole("textbox", { name: "Nom", exact: true })
    .fill("Planning communal");
  await page.locator("#duty-source-date").fill("2026-09-15");
  await page.locator("#duty-source-time").fill("10:00");
  await page.getByRole("button", { name: "Créer la source" }).click();
  await expect(
    page.getByRole("region", { name: "Liste des sources" }),
  ).toContainText("Planning communal");
  expect(mutations[0]).toMatchObject({
    method: "POST",
    body: { name: "Planning communal", observedAt: "2026-09-15T09:00:00.000Z" },
  });
  await page
    .getByRole("button", { name: "Modifier Planning officiel" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Nom", exact: true }),
  ).toHaveValue("Planning officiel");
  await page
    .getByRole("textbox", { name: "Description facultative" })
    .fill("Mise à jour");
  await page.getByRole("button", { name: "Enregistrer la source" }).click();
  expect(mutations[1]).toMatchObject({
    method: "PATCH",
    body: {
      name: "Planning officiel",
      description: "Mise à jour",
      reliability: 90,
    },
  });
});

test("exceptions require an approved duty, validate bounds and confirm full cancellation", async ({
  page,
}) => {
  const api = await mockExceptionApi(page);
  await page.goto(`/admin/gardes/${dutyId}/exceptions`);
  await expect(
    page.getByRole("region", { name: "Garde concernée" }),
  ).toContainText("Pharmacie Jagger");
  await expect(
    page.getByRole("region", { name: "Liste des exceptions" }),
  ).toContainText("Aucune exception");
  await page.locator("#duty-exception-end-date").fill("2026-09-16");
  await page.getByRole("button", { name: "Ajouter l’exception" }).click();
  await expect(page.getByRole("alert")).toContainText(/fin.*après/i);
  await page.locator("#duty-exception-end-date").fill("2026-09-18");
  await page.getByRole("button", { name: "Annuler toute la garde" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    /disponibilité publique/i,
  );
  await page.getByRole("button", { name: "Confirmer l’annulation" }).click();
  await expect(
    page.getByRole("region", { name: "Liste des exceptions" }),
  ).toContainText("Annulation");
  expect(api.saved()).toMatchObject({
    kind: "CANCELLED",
    startsAt: duty.startsAt,
    endsAt: duty.endsAt,
  });
});

test("source and exception pages reflow without horizontal overflow", async ({
  page,
}) => {
  await mockSources(page);
  await mockExceptionApi(page);
  for (const path of [
    "/admin/gardes/sources",
    `/admin/gardes/${dutyId}/exceptions`,
  ]) {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} ${width}`,
      ).toBe(true);
      if (
        (path === "/admin/gardes/sources" && width === 1440) ||
        (path.endsWith("/exceptions") && width === 390)
      ) {
        const name = path.endsWith("/exceptions")
          ? "admin-duty-exceptions-390.png"
          : "admin-duty-sources-1440.png";
        const capture = test.info().outputPath("visual-evidence", name);
        await mkdir(dirname(capture), { recursive: true });
        await page.screenshot({ path: capture, fullPage: true });
      }
    }
  }
});

test("exceptions are unavailable for a pending duty", async ({ page }) => {
  await mockExceptionApi(page, "PENDING");
  await page.goto(`/admin/gardes/${dutyId}/exceptions`);
  await expect(page.getByRole("note")).toContainText(/garde approuvée/i);
  await expect(
    page.getByRole("button", { name: "Ajouter l’exception" }),
  ).toHaveCount(0);
});

test("an existing exception can be corrected and a conflict reloads server data", async ({
  page,
}) => {
  await mockExceptionApi(page);
  const existing = {
    id: exceptionId,
    dutyPeriodId: dutyId,
    kind: "UNAVAILABLE",
    startsAt: "2026-09-17T18:00:00.000Z",
    endsAt: "2026-09-17T20:00:00.000Z",
    reason: "Fermeture annoncée",
    createdAt: "2026-09-17T08:00:00.000Z",
    updatedAt: "2026-09-17T08:00:00.000Z",
  };
  let current = existing;
  let patchBody: Record<string, unknown> | null = null;
  let conflict = false;
  await page.route(`**/api/v1/admin/duties/${dutyId}/exceptions?*`, (route) =>
    route.fulfill({ json: { data: [current], pagination: pagination(1) } }),
  );
  await page.route(
    `**/api/v1/admin/duties/${dutyId}/exceptions/${exceptionId}`,
    (route) => {
      patchBody = route.request().postDataJSON() as Record<string, unknown>;
      if (conflict)
        return route.fulfill({
          status: 409,
          json: { error: { code: "CONFLICT", message: "Changed" } },
        });
      current = {
        ...current,
        reason: typeof patchBody.reason === "string" ? patchBody.reason : "",
      };
      return route.fulfill({ json: { data: current } });
    },
  );
  await page.goto(`/admin/gardes/${dutyId}/exceptions`);
  await page.getByRole("button", { name: /modifier l.exception/i }).click();
  await page
    .getByRole("textbox", { name: "Motif facultatif" })
    .fill("Téléphone confirmé");
  await page.getByRole("button", { name: "Enregistrer l’exception" }).click();
  expect(patchBody).toMatchObject({
    kind: "UNAVAILABLE",
    reason: "Téléphone confirmé",
  });
  await expect(
    page.getByRole("region", { name: "Liste des exceptions" }),
  ).toContainText("Téléphone confirmé");

  conflict = true;
  await page.getByRole("button", { name: /modifier l.exception/i }).click();
  await page.getByRole("button", { name: "Enregistrer l’exception" }).click();
  await expect(page.getByRole("alert")).toContainText(/conflit/i);
  await expect(
    page.getByRole("heading", { name: "Ajouter une exception" }),
  ).toBeVisible();
});
