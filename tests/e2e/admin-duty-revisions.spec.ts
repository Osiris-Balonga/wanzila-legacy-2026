import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const dutyId = "00000000-0000-4000-8000-000000007301";
const pharmacyId = "00000000-0000-4000-8000-000000007302";
const sourceId = "00000000-0000-4000-8000-000000007303";
const nextSourceId = "00000000-0000-4000-8000-000000007304";
const revisionId = "00000000-0000-4000-8000-000000007305";
const submitterId = "00000000-0000-4000-8000-000000007306";
const reviewerId = "00000000-0000-4000-8000-000000007307";
const editUrl = `/admin/gardes/${dutyId}/modifier`;
const dutyPath = `/api/v1/admin/duties/${dutyId}`;
const revisionsPath = `${dutyPath}/revisions`;

const canonical = {
  id: dutyId,
  pharmacyId,
  sourceId,
  startsAt: "2026-09-17T17:00:00.000Z",
  endsAt: "2026-09-18T07:00:00.000Z",
  status: "APPROVED",
  createdAt: "2026-09-10T08:15:00.000Z",
  updatedAt: "2026-09-12T13:32:00.000Z",
};

const pharmacy = {
  id: pharmacyId,
  name: "Pharmacie Jagger",
  address: {
    line: "Avenue de la Paix",
    district: "Bacongo",
    arrondissement: "Bacongo",
  },
  phone: "+242061234567",
  coordinates: { latitude: -4.263708, longitude: 15.242885 },
  status: "PUBLISHED",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

const sources = [
  {
    id: sourceId,
    name: "Planning officiel",
    description: "Source du service de garde",
    reliability: 90,
    observedAt: "2026-09-15T08:00:00.000Z",
    updatedAt: "2026-09-15T08:00:00.000Z",
    freshness: "FRESH",
  },
  {
    id: nextSourceId,
    name: "Agence sanitaire",
    description: "Avis de correction",
    reliability: 95,
    observedAt: "2026-09-16T08:00:00.000Z",
    updatedAt: "2026-09-16T08:00:00.000Z",
    freshness: "FRESH",
  },
];

const revision = {
  id: revisionId,
  dutyPeriodId: dutyId,
  baseVersion: 2,
  status: "PENDING",
  before: {
    sourceId,
    startsAt: canonical.startsAt,
    endsAt: canonical.endsAt,
  },
  proposed: {
    sourceId: nextSourceId,
    startsAt: "2026-09-18T17:00:00.000Z",
    endsAt: "2026-09-19T07:00:00.000Z",
  },
  submissionNote: "Correction du planning reçu de l’agence sanitaire.",
  submittedBy: { id: submitterId, displayName: "Administrateur de test" },
  submittedAt: "2026-09-16T12:00:00.000Z",
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
};

const pageInfo = (total: number) => ({
  page: 1,
  pageSize: 10,
  total,
  totalPages: total === 0 ? 0 : 1,
});
const reviewer = { id: reviewerId, displayName: "Réviseur de test" };

type MockOptions = {
  dutyStatus?: number;
  dutyBody?: unknown;
  revisions?: unknown[];
  revisionsStatus?: number;
  holdDuty?: Promise<void>;
};

async function mockEditApi(page: Page, options: MockOptions = {}) {
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
  await page.route(`**${dutyPath}`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await options.holdDuty;
    return route.fulfill({
      status: options.dutyStatus ?? 200,
      json:
        options.dutyBody ??
        (options.dutyStatus && options.dutyStatus >= 400
          ? { error: { code: "NOT_FOUND", message: "Duty unavailable" } }
          : { data: canonical }),
    });
  });
  await page.route(`**${revisionsPath}?*`, (route) =>
    route.fulfill({
      status: options.revisionsStatus ?? 200,
      json:
        options.revisionsStatus && options.revisionsStatus >= 400
          ? { error: { code: "CONFLICT", message: "Revision unavailable" } }
          : {
              data: options.revisions ?? [],
              pagination: pageInfo(options.revisions?.length ?? 0),
            },
    }),
  );
  await page.route(`**/api/v1/admin/pharmacies/${pharmacyId}`, (route) =>
    route.fulfill({ json: { data: pharmacy } }),
  );
  await page.route("**/api/v1/admin/sources?*", (route) =>
    route.fulfill({
      json: {
        data: sources,
        pagination: {
          page: 1,
          pageSize: 50,
          total: sources.length,
          totalPages: 1,
        },
      },
    }),
  );
}

test("the duty directory exposes Modifier in the row ellipse menu", async ({
  page,
}) => {
  await mockEditApi(page);
  await page.route("**/api/v1/admin/duties/summary", (route) =>
    route.fulfill({
      json: {
        data: {
          asOf: "2026-09-16T12:00:00.000Z",
          active: 0,
          upcoming: 1,
          expired: 0,
          withoutRecentDuty: 0,
        },
      },
    }),
  );
  await page.route("**/api/v1/admin/duties?*", (route) =>
    route.fulfill({
      json: { data: [canonical], pagination: pageInfo(1) },
    }),
  );
  await page.goto("/admin/gardes");
  await page
    .getByRole("button", { name: `Actions pour ${pharmacy.name}` })
    .click();
  const edit = page.getByRole("menuitem", { name: /modifier/i });
  await expect(edit).toHaveAttribute("href", editUrl);
  await edit.click();
  await expect(page).toHaveURL(editUrl);
  await expect(
    page.getByRole("heading", { name: "Modifier une garde" }),
  ).toBeVisible();
});

test("PENDING and REJECTED rows do not offer an editor in the ellipse", async ({
  page,
}) => {
  await mockEditApi(page);
  await page.route("**/api/v1/admin/duties/summary", (route) =>
    route.fulfill({
      json: {
        data: {
          asOf: "2026-09-16T12:00:00.000Z",
          active: 0,
          upcoming: 0,
          expired: 0,
          withoutRecentDuty: 0,
        },
      },
    }),
  );
  let status: "PENDING" | "REJECTED" = "PENDING";
  await page.route("**/api/v1/admin/duties?*", (route) =>
    route.fulfill({
      json: {
        data: [{ ...canonical, status }],
        pagination: pageInfo(1),
      },
    }),
  );
  for (const nextStatus of ["PENDING", "REJECTED"] as const) {
    status = nextStatus;
    await page.goto("/admin/gardes");
    await page
      .getByRole("button", { name: `Actions pour ${pharmacy.name}` })
      .click();
    await expect(page.getByRole("menuitem", { name: /modifier/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("menuitem", { name: "Voir la pharmacie" }),
    ).toBeVisible();
  }
});

test("APPROVED page separates published canonical values, editable proposal and real history", async ({
  page,
}) => {
  await mockEditApi(page, {
    revisions: [
      {
        ...revision,
        status: "REJECTED",
        reviewedBy: reviewer,
        reviewedAt: "2026-09-16T13:00:00.000Z",
        reviewNote: "Changement confirmé",
      },
    ],
  });
  await page.goto(editUrl);
  await expect(
    page.getByRole("heading", { name: "Modifier une garde" }),
  ).toBeVisible();
  await expect(page.getByText("Garde publiée", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: /informations de la garde/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Date et heure de début" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Date et heure de fin" }),
  ).toBeVisible();
  const history = page.getByRole("region", {
    name: /historique des modifications/i,
  });
  await expect(history).toContainText(revision.submissionNote);
  await expect(history).toContainText("Planning officiel");
  await expect(history).toContainText("Agence sanitaire");
  await expect(history).toContainText("Administrateur de test");
  await expect(history).toContainText("Réviseur de test");
  await expect(history).toContainText("Changement confirmé");
  await expect(page.getByText(pharmacy.name).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /voir la fiche/i }),
  ).toHaveAttribute("href", `/admin/pharmacies/${pharmacyId}`);
  await expect(
    page.getByRole("region", {
      name: `Carte de localisation de ${pharmacy.name}`,
    }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Pharmacie" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("combobox", { name: "Statut" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /supprimer la garde/i }),
  ).toHaveCount(0);
  await expect(page.getByText(/Marie Tendé|Aujourd’hui à 14:32/)).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("img", { name: /pharmacie jagger/i }),
  ).toHaveCount(0);
});

test("legacy history says unknown rather than fabricating an actor, note or time", async ({
  page,
}) => {
  await mockEditApi(page, { revisions: [] });
  await page.goto(editUrl);
  await expect(
    page.getByRole("region", { name: /historique des modifications/i }),
  ).toContainText("Historique antérieur indisponible");
  await expect(
    page.getByText(/Garde mise à jour par|Marie Tendé|Osiris Balonga/),
  ).toHaveCount(0);
});

test("history pages are loaded from the revision ledger, not a local slice", async ({
  page,
}) => {
  await mockEditApi(page);
  await page.unroute(`**${revisionsPath}?*`);
  await page.route(`**${revisionsPath}?*`, (route) => {
    const requestedPage = Number(
      new URL(route.request().url()).searchParams.get("page") ?? 1,
    );
    return route.fulfill({
      json: {
        data:
          requestedPage === 1
            ? Array.from({ length: 10 }, (_, index) => ({
                ...revision,
                id: `00000000-0000-4000-8000-${String(7306 + index).padStart(12, "0")}`,
                status: "REJECTED",
                submissionNote: `Motif réel ${index + 1}`,
                reviewedBy: reviewer,
                reviewedAt: "2026-09-16T13:00:00.000Z",
              }))
            : [{ ...revision, submissionNote: "Motif réel page deux" }],
        pagination: {
          page: requestedPage,
          pageSize: 10,
          total: 11,
          totalPages: 2,
        },
      },
    });
  });
  await page.goto(editUrl);
  await expect(page.getByText(/Motif réel 1$/)).toBeVisible();
  const nextPage = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === revisionsPath &&
      new URL(request.url()).searchParams.get("page") === "2",
  );
  await page.getByRole("button", { name: "Page suivante" }).click();
  await nextPage;
  await expect(page.getByText("Motif réel page deux")).toBeVisible();
  await expect(page.getByText(/Motif réel 1$/)).toHaveCount(0);
});

test("a PENDING duty gets an honest non-editor state with a way back", async ({
  page,
}) => {
  await mockEditApi(page, {
    dutyBody: { data: { ...canonical, status: "PENDING" } },
  });
  await page.goto(editUrl);
  await expect(page.getByText(/garde en attente/i)).toBeVisible();
  await expect(
    page.getByText(/édition.*indisponible|ne peut pas.*modifier/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Retour aux gardes" }),
  ).toHaveAttribute("href", "/admin/gardes");
  await expect(
    page.getByRole("button", { name: "Soumettre la révision" }),
  ).toHaveCount(0);
});

test("invalid proposal is blocked, then one POST submits a PENDING revision without publishing", async ({
  page,
}) => {
  await mockEditApi(page);
  let submitted = 0;
  const submittedRevision = {
    ...revision,
    proposed: { ...revision.proposed, sourceId },
  };
  let directPatch = 0;
  let directApproval = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === dutyPath && request.method() === "PATCH") directPatch += 1;
    if (path === `${dutyPath}/approve` && request.method() === "POST") {
      directApproval += 1;
    }
  });
  await page.unroute(`**${revisionsPath}?*`);
  await page.route(`**${revisionsPath}?*`, (route) =>
    route.fulfill({
      json: {
        data: submitted ? [submittedRevision] : [],
        pagination: pageInfo(submitted ? 1 : 0),
      },
    }),
  );
  await page.route(`**${revisionsPath}`, (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted += 1;
    return route.fulfill({ status: 201, json: { data: submittedRevision } });
  });
  await page.goto(editUrl);
  await page.getByLabel("Date de fin").fill("2026-09-16");
  await page.getByRole("button", { name: "Soumettre la révision" }).click();
  await expect(page.getByRole("alert")).toContainText(/fin.*après.*début/i);
  expect(submitted).toBe(0);
  await page.getByLabel("Date de fin").fill("2026-09-19");
  await page.getByLabel("Motif de la révision").fill("   ");
  await page.getByRole("button", { name: "Soumettre la révision" }).click();
  await expect(page.getByRole("alert")).toContainText(/motif.*obligatoire/i);
  expect(submitted).toBe(0);
  await page
    .getByLabel("Motif de la révision")
    .fill("  Correction du planning reçu de l’agence sanitaire.  ");
  const post = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === revisionsPath,
  );
  await page.getByRole("button", { name: "Soumettre la révision" }).click();
  const payload = (await post).postDataJSON() as Record<string, unknown>;
  expect(payload).toMatchObject({
    sourceId,
    startsAt: canonical.startsAt,
    endsAt: "2026-09-19T07:00:00.000Z",
    note: "Correction du planning reçu de l’agence sanitaire.",
  });
  expect(payload).not.toHaveProperty("pharmacyId");
  await expect(
    page.getByRole("status").filter({ hasText: /révision.*en attente/i }),
  ).toBeVisible();
  await expect(page.getByText("Garde publiée", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/reste.*publiée|ancienne.*publiée/i),
  ).toBeVisible();
  expect({ submitted, directPatch, directApproval }).toEqual({
    submitted: 1,
    directPatch: 0,
    directApproval: 0,
  });
});

test("an existing PENDING revision cannot be overwritten and review is confirmed then refreshed", async ({
  page,
}) => {
  let currentRevision: Record<string, unknown> = revision;
  let refreshes = 0;
  await mockEditApi(page, { revisions: [revision] });
  await page.unroute(`**${revisionsPath}?*`);
  await page.route(`**${revisionsPath}?*`, (route) => {
    refreshes += 1;
    return route.fulfill({
      json: { data: [currentRevision], pagination: pageInfo(1) },
    });
  });
  await page.route(`**${revisionsPath}/${revisionId}/reject`, (route) => {
    currentRevision = {
      ...revision,
      status: "REJECTED",
      reviewedBy: reviewer,
      reviewedAt: "2026-09-16T13:00:00.000Z",
      reviewNote: "Période incorrecte",
    };
    return route.fulfill({ json: { data: currentRevision } });
  });
  await page.goto(editUrl);
  await expect(page.getByText(/révision en attente/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Soumettre la révision" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Soumettre la révision" }),
  ).toHaveCSS("background-color", "rgb(232, 227, 244)");
  const reject = page.getByRole("button", { name: /rejeter la révision/i });
  await reject.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/rejeter/i);
  await page.keyboard.press("Escape");
  await expect(reject).toBeFocused();
  await reject.click();
  await dialog.getByRole("button", { name: /confirmer le rejet/i }).click();
  await expect(page.getByText("Période incorrecte")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Soumettre la révision" }),
  ).toBeEnabled();
  await expect(page.locator("#duty-edit-history-heading")).toBeFocused();
  expect(refreshes).toBeGreaterThanOrEqual(2);
});

test("approval uses the revision endpoint and reloads the canonical duty", async ({
  page,
}) => {
  let approvedOnServer = false;
  let canonicalReads = 0;
  let releaseApproval!: () => void;
  const holdApproval = new Promise<void>((resolve) => {
    releaseApproval = resolve;
  });
  await mockEditApi(page, { revisions: [revision] });
  await page.unroute(`**${revisionsPath}?*`);
  await page.route(`**${revisionsPath}?*`, (route) =>
    route.fulfill({
      json: {
        data: [
          approvedOnServer
            ? {
                ...revision,
                status: "APPROVED",
                reviewedBy: reviewer,
                reviewedAt: "2026-09-16T13:00:00.000Z",
              }
            : revision,
        ],
        pagination: pageInfo(1),
      },
    }),
  );
  await page.unroute(`**${dutyPath}`);
  await page.route(`**${dutyPath}`, (route) => {
    canonicalReads += 1;
    return route.fulfill({
      json: {
        data: approvedOnServer
          ? { ...canonical, ...revision.proposed }
          : canonical,
      },
    });
  });
  await page.route(
    `**${revisionsPath}/${revisionId}/approve`,
    async (route) => {
      await holdApproval;
      approvedOnServer = true;
      return route.fulfill({
        json: {
          data: {
            ...revision,
            status: "APPROVED",
            reviewedBy: reviewer,
            reviewedAt: "2026-09-16T13:00:00.000Z",
            reviewNote: null,
          },
        },
      });
    },
  );
  await page.goto(editUrl);
  await page.getByRole("button", { name: /approuver la révision/i }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText(/approuver/i);
  const approval = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname ===
        `${revisionsPath}/${revisionId}/approve`,
  );
  await confirmation
    .getByRole("button", { name: /confirmer l.approbation/i })
    .click();
  await approval;
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: "Validation…" }),
  ).toBeDisabled();
  releaseApproval();
  await expect(page.getByText("Garde publiée", { exact: true })).toBeVisible();
  await expect(page.getByText(/révision approuvée/i)).toBeVisible();
  await expect(page.getByLabel("Date de début")).toHaveValue("2026-09-18");
  await expect.poll(() => canonicalReads).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#duty-edit-history-heading")).toBeFocused();
});

test("409 on submit never claims publication and offers recovery", async ({
  page,
}) => {
  await mockEditApi(page);
  await page.route(`**${revisionsPath}`, (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: "CONFLICT", message: "Stale duty version" } },
    }),
  );
  await page.goto(editUrl);
  await page.getByLabel("Motif de la révision").fill("Correction vérifiée");
  await page.getByRole("button", { name: "Soumettre la révision" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /conflit|modifi|version/i,
  );
  await expect(page.getByText(/révision.*en attente/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /réessayer|actualiser/i }),
  ).toBeVisible();
});

test("409 on review keeps PENDING and never claims proposed values are live", async ({
  page,
}) => {
  await mockEditApi(page, { revisions: [revision] });
  await page.route(`**${revisionsPath}/${revisionId}/approve`, (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: "CONFLICT", message: "Stale duty version" } },
    }),
  );
  await page.goto(editUrl);
  await page.getByRole("button", { name: /approuver la révision/i }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /confirmer l.approbation/i })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    /conflit|modifi|version/i,
  );
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByText(/révision en attente/i)).toBeVisible();
  await expect(page.getByText(/révision approuvée/i)).toHaveCount(0);
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Annuler" })
    .click();
  await expect(
    page.getByRole("button", { name: /approuver la révision/i }),
  ).toBeFocused();
});

test("loading, 401, 403, 404, malformed 200 and retry are distinct states", async ({
  page,
}) => {
  let release!: () => void;
  const holdDuty = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockEditApi(page, { holdDuty });
  await page.goto(editUrl);
  await expect(page.getByRole("status")).toContainText(/chargement/i);
  release();
  await expect(
    page.getByRole("heading", { name: "Modifier une garde" }),
  ).toBeVisible();

  for (const [status, expected] of [
    [401, /connexion requise|session.*expirée/i],
    [403, /accès refusé|autorisation/i],
    [404, /garde introuvable/i],
  ] as const) {
    await page.unroute(`**${dutyPath}`);
    await mockEditApi(page, {
      dutyStatus: status,
      dutyBody: { error: { code: "NOT_FOUND", message: "Unavailable" } },
    });
    await page.reload();
    await expect(page.getByRole("alert")).toContainText(expected);
    if (status === 401) {
      await expect(
        page.getByRole("link", { name: /se connecter/i }),
      ).toHaveAttribute("href", "/admin/connexion");
    }
  }

  await page.unroute(`**${dutyPath}`);
  await mockEditApi(page, {
    dutyBody: { data: { ...canonical, status: "UNSAFE" } },
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    /données.*invalides|réponse.*invalide/i,
  );
  await page.unroute(`**${dutyPath}`);
  await mockEditApi(page);
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByText("Garde publiée", { exact: true })).toBeVisible();
});

test("reference regions reflow without overflow at 320, 390, 768 and 1440", async ({
  page,
}) => {
  await mockEditApi(page, { revisions: [] });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(editUrl);
    const form = page.getByRole("region", {
      name: /informations de la garde/i,
    });
    const history = page.getByRole("region", {
      name: /historique des modifications/i,
    });
    await expect(form).toBeVisible();
    await expect(history).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Retour aux gardes" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const formBox = await form.boundingBox();
    const historyBox = await history.boundingBox();
    expect(formBox).not.toBeNull();
    expect(historyBox).not.toBeNull();
    if (!formBox || !historyBox) continue;
    if (width >= 1440) {
      expect(historyBox.x).toBeGreaterThan(formBox.x + formBox.width);
      const pharmacyBox = await page
        .getByRole("region", { name: "Pharmacie", exact: true })
        .boundingBox();
      const statusBox = await page
        .getByText("Garde publiée", { exact: true })
        .boundingBox();
      expect(pharmacyBox).not.toBeNull();
      expect(statusBox).not.toBeNull();
      if (pharmacyBox && statusBox) {
        expect(pharmacyBox.y).toBeLessThan(formBox.y);
        expect(statusBox.y + statusBox.height).toBeLessThan(pharmacyBox.y);
      }
    }
    if (width <= 390) expect(historyBox.y).toBeGreaterThan(formBox.y);
  }
  const submit = page.getByRole("button", { name: "Soumettre la révision" });
  await submit.focus();
  await expect(submit).toBeFocused();
  await expect(submit).toHaveCSS("outline-style", /solid|auto/);
  const targetSize = await submit.boundingBox();
  expect(targetSize?.height).toBeGreaterThanOrEqual(44);
  await expect(submit).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("visual evidence for populated and legacy edit states", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.WANZILA_DUTY_EDIT_CAPTURE ||
      testInfo.project.name !== "desktop",
    "Manual visual evidence only",
  );
  for (const [name, revisions] of [
    ["populated", [revision]],
    ["legacy", []],
  ] as const) {
    await mockEditApi(page, { revisions: [...revisions] });
    const widths = process.env.WANZILA_DUTY_LIVE_MAP
      ? [390, 1440, 1586]
      : [320, 390, 768, 1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 900 : 992 });
      await page.goto(editUrl);
      await expect(
        page.getByRole("heading", { name: "Modifier une garde" }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", {
          name: `Carte de localisation de ${pharmacy.name}`,
        }),
      ).toHaveAttribute("data-map-status", "ready", { timeout: 20_000 });
      const filename = `duty-edit-${name}-${width}${process.env.WANZILA_DUTY_LIVE_MAP ? "-live-map" : ""}.png`;
      await page.screenshot({
        path: process.env.WANZILA_DUTY_EDIT_EVIDENCE
          ? resolve(process.cwd(), "docs/design/evidence/issue-73", filename)
          : testInfo.outputPath(filename),
        animations: "disabled",
        fullPage: true,
      });
    }
  }
});
