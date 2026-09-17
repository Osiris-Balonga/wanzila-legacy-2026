import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  adminContributionSchema,
  type AdminContribution,
} from "@wanzila/contracts";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const id = "00000000-0000-4000-8000-000000004201";
const pharmacyId = "00000000-0000-4000-8000-000000004202";
const original = {
  name: "Pharmacie des Acacias",
  address: {
    line: "12 rue des Acacias",
    district: "Centre",
    arrondissement: "Poto-Poto",
  },
  phone: null,
  coordinates: null,
  note: "À vérifier sur place",
};
const sample = adminContributionSchema.parse({
  id,
  ...original,
  original,
  status: "PENDING",
  version: 0,
  createdAt: "2026-09-17T10:00:00.000Z",
  reviewedAt: null,
  reviewedByName: null,
  reviewNote: null,
  pharmacyId: null,
  duplicates: [],
  corrections: [],
});

type MockState = {
  item: AdminContribution;
  unauthorized?: boolean;
  forbiddenOnce?: boolean;
  conflictOnce?: boolean;
  listFailureOnce?: boolean;
  mutations: Array<{ method: string; body: unknown }>;
};
function state(): MockState {
  return { item: structuredClone(sample), mutations: [] };
}
async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function settleScreenshot(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await expect(page.locator(".skip-link")).toHaveCSS("top", "-64px");
}

async function mockApi(page: Page, mock: MockState) {
  await page.route("**/maps/wanzila-style.json", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "ground",
            type: "background",
            paint: { "background-color": "#eef2f8" },
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/admin/contributions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (mock.unauthorized) {
      await json(route, 401, {
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
        },
      });
      return;
    }
    if (
      url.pathname === "/api/v1/admin/contributions" &&
      request.method() === "GET"
    ) {
      if (mock.listFailureOnce) {
        mock.listFailureOnce = false;
        await json(route, 500, {
          error: { code: "INTERNAL_ERROR", message: "Unavailable" },
        });
        return;
      }
      const status = url.searchParams.get("status");
      const data = status && status !== mock.item.status ? [] : [mock.item];
      await json(route, 200, {
        data,
        pagination: {
          page: Number(url.searchParams.get("page") ?? "1"),
          pageSize: Number(url.searchParams.get("pageSize") ?? "10"),
          total: data.length,
          totalPages: data.length ? 1 : 0,
        },
      });
      return;
    }
    if (
      url.pathname === `/api/v1/admin/contributions/${id}` &&
      request.method() === "GET"
    ) {
      await json(route, 200, { data: mock.item });
      return;
    }
    if (["PATCH", "POST"].includes(request.method())) {
      const body: unknown = request.postDataJSON();
      mock.mutations.push({ method: request.method(), body });
      if (mock.forbiddenOnce) {
        mock.forbiddenOnce = false;
        await json(route, 403, {
          error: {
            code: "ORIGIN_FORBIDDEN",
            message: "Request origin is not allowed",
          },
        });
        return;
      }
      if (mock.conflictOnce) {
        mock.conflictOnce = false;
        await json(route, 409, {
          error: {
            code: "CONFLICT",
            message: "Contribution changed or already reviewed",
          },
        });
        return;
      }
      const input = body as Record<string, unknown>;
      if (input.expectedVersion !== mock.item.version) {
        await json(route, 409, {
          error: {
            code: "CONFLICT",
            message: "Contribution changed or already reviewed",
          },
        });
        return;
      }
      if (request.method() === "PATCH") {
        const before = {
          name: mock.item.name,
          address: mock.item.address,
          phone: mock.item.phone,
          coordinates: mock.item.coordinates,
          note: mock.item.note,
        };
        mock.item = adminContributionSchema.parse({
          ...mock.item,
          name: input.name,
          address: input.address,
          phone: input.phone,
          coordinates: input.coordinates,
          note: input.note,
          version: mock.item.version + 1,
          corrections: [
            ...mock.item.corrections,
            {
              version: mock.item.version + 1,
              before,
              after: {
                name: input.name,
                address: input.address,
                phone: input.phone,
                coordinates: input.coordinates,
                note: input.note,
              },
              reason: input.reason,
              correctedByName: "Administratrice",
              createdAt: "2026-09-17T11:00:00.000Z",
            },
          ],
        });
        await json(route, 200, { data: mock.item });
        return;
      }
      if (url.pathname.endsWith("/approve")) {
        if (!mock.item.coordinates) {
          await json(route, 409, {
            error: {
              code: "CONFLICT",
              message: "Coordinates required before approval",
            },
          });
          return;
        }
        if (
          mock.item.duplicates.length &&
          input.confirmPossibleDuplicate !== true
        ) {
          await json(route, 409, {
            error: {
              code: "CONFLICT",
              message:
                "Confirm the displayed duplicate indicators before approval",
            },
          });
          return;
        }
        mock.item = adminContributionSchema.parse({
          ...mock.item,
          status: "APPROVED",
          version: mock.item.version + 1,
          pharmacyId,
          reviewNote: input.reason,
          reviewedByName: "Administratrice",
          reviewedAt: "2026-09-17T12:00:00.000Z",
        });
        await json(route, 200, { data: mock.item });
        return;
      }
      if (url.pathname.endsWith("/reject")) {
        mock.item = adminContributionSchema.parse({
          ...mock.item,
          status: "REJECTED",
          version: mock.item.version + 1,
          reviewNote: input.reason,
          reviewedByName: "Administratrice",
          reviewedAt: "2026-09-17T12:00:00.000Z",
        });
        await json(route, 200, { data: mock.item });
        return;
      }
    }
    await json(route, 404, {
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });
}

test("queue shows real status counts, filters, retry and responsive layout", async ({
  page,
}) => {
  const mock = state();
  mock.listFailureOnce = true;
  await mockApi(page, mock);
  await page.goto("/admin/contributions");
  await expect(page.getByRole("alert")).toContainText("Impossible de terminer");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(
    page.getByRole("heading", { name: "Contributions", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Examiner" })).toBeVisible();
  await page.getByLabel("Statut", { exact: true }).selectOption("APPROVED");
  await expect(
    page.getByText("Aucune contribution dans ce statut."),
  ).toBeVisible();
  await page.getByLabel("Statut", { exact: true }).selectOption("PENDING");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("link", { name: "Examiner" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(
      dimensions.scroll,
      `Horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`,
    ).toBeLessThanOrEqual(dimensions.viewport);
    const folder = resolve(
      "test-results",
      test.info().project.name,
      "visual-evidence",
    );
    await mkdir(folder, { recursive: true });
    await settleScreenshot(page);
    await page.screenshot({
      path: resolve(folder, `admin-contributions-list-${width}.png`),
      fullPage: true,
    });
  }
});

test("address-only proposal is corrected, nearby fact confirmed, and approved into draft", async ({
  page,
}) => {
  const mock = state();
  await mockApi(page, mock);
  await page.goto(`/admin/contributions/${id}`);
  await expect(page.getByText("Aucune position soumise.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approuver en brouillon" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Corriger", exact: true }).click();
  await page.getByLabel("Motif de la correction").fill("Vérification initiale");
  await page.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Modifiez au moins une information",
  );
  await page.getByLabel("Latitude").fill("-4.2637");
  await page.getByLabel("Longitude").fill("15.2429");
  await page
    .getByLabel("Motif de la correction")
    .fill("Position contrôlée sur la carte");
  await page.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(page.getByText("Correction v1")).toBeVisible();
  mock.item = adminContributionSchema.parse({
    ...mock.item,
    duplicates: [
      {
        kind: "NEARBY",
        target: "PHARMACY",
        id: pharmacyId,
        distanceMeters: 180,
      },
    ],
  });
  await page.reload();
  await expect(page.getByText("Position à 180 m à vol d’oiseau")).toBeVisible();
  await page
    .getByLabel("Motif de la décision")
    .fill("Pharmacie distincte vérifiée");
  await expect(
    page.getByRole("button", { name: "Approuver en brouillon" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.setViewportSize({ width: 1440, height: 900 });
  const pendingFolder = resolve(
    "test-results",
    test.info().project.name,
    "visual-evidence",
  );
  await mkdir(pendingFolder, { recursive: true });
  await settleScreenshot(page);
  await page.screenshot({
    path: resolve(pendingFolder, "admin-contribution-review-pending-1440.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Approuver en brouillon" }).click();
  await expect(
    page.getByRole("link", { name: "Voir la pharmacie créée en brouillon" }),
  ).toHaveAttribute("href", `/admin/pharmacies/${pharmacyId}`);
  expect(
    mock.mutations.some(
      (value) =>
        value.method === "POST" &&
        (value.body as { confirmPossibleDuplicate?: boolean })
          .confirmPossibleDuplicate,
    ),
  ).toBe(true);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const folder = resolve(
      "test-results",
      test.info().project.name,
      "visual-evidence",
    );
    await mkdir(folder, { recursive: true });
    await settleScreenshot(page);
    await page.screenshot({
      path: resolve(folder, `admin-contribution-review-${width}.png`),
      fullPage: true,
    });
  }
});

test("authentication, forbidden mutation, conflict reload, exact match block, and rejection", async ({
  page,
}) => {
  const mock = state();
  mock.unauthorized = true;
  await mockApi(page, mock);
  await page.goto("/admin/contributions");
  await expect(page).toHaveURL(/\/admin\/connexion/);
  mock.unauthorized = false;
  mock.item = adminContributionSchema.parse({
    ...mock.item,
    coordinates: { latitude: -4.26, longitude: 15.24 },
    duplicates: [
      { kind: "EXACT_NAME_ADDRESS", target: "PHARMACY", id: pharmacyId },
    ],
  });
  await page.goto(`/admin/contributions/${id}`);
  await expect(page.getByText("L’approbation est bloquée")).toBeVisible();
  await page.getByLabel("Motif de la décision").fill("Adresse déjà présente");
  await expect(
    page.getByRole("button", { name: "Approuver en brouillon" }),
  ).toBeDisabled();
  mock.forbiddenOnce = true;
  await page.getByRole("button", { name: "Rejeter" }).click();
  await expect(page.getByRole("alert")).toContainText("interdite");
  mock.conflictOnce = true;
  await page.getByRole("button", { name: "Rejeter" }).click();
  await expect(
    page.getByRole("button", { name: "Recharger la proposition" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recharger la proposition" }).click();
  await page.getByLabel("Motif de la décision").fill("Doublon avéré");
  await page.getByRole("button", { name: "Rejeter" }).click();
  await expect(page.getByText("Décision : Rejetée")).toBeVisible();
  expect(mock.item.status).toBe("REJECTED");
});

test("queue and review have no serious accessibility violations", async ({
  page,
}) => {
  const mock = state();
  await mockApi(page, mock);
  for (const path of ["/admin/contributions", `/admin/contributions/${id}`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (value) => value.impact === "critical" || value.impact === "serious",
    );
    expect(
      serious
        .map(
          (value) =>
            `${value.id}: ${value.nodes.map((node) => node.target.join(" ")).join(", ")}`,
        )
        .join("\n"),
    ).toBe("");
  }
});
