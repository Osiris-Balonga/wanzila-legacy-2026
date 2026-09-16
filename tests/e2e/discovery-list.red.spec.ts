import { analyticsEventEnvelopeSchema } from "../../packages/contracts/src/analytics.ts";
import { expect, test, type Page } from "@playwright/test";

const pharmacyId = "00000000-0000-4000-8000-000000000006";
const viewports = [
  { name: "320", width: 320, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 1000 },
];

const pharmacyListResponse = {
  data: [
    {
      id: pharmacyId,
      name: "Pharmacie Centrale",
      address: {
        line: "12 avenue de la Paix",
        district: "Plateau",
        arrondissement: "Poto-Poto",
      },
      coordinates: { latitude: -4.2634, longitude: 15.2429 },
      currentDuty: {
        state: "ACTIVE",
        startsAt: "2026-09-15T08:00:00.000Z",
        endsAt: "2026-09-16T08:00:00.000Z",
        sourceFreshness: "FRESH",
        source: {
          name: "Ordre national des pharmaciens",
          observedAt: "2026-09-15T08:30:00.000Z",
        },
      },
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

type PharmacyMockOptions = {
  totalPages?: number;
  onRequest?: (url: URL) => void;
};

async function mockPharmacyList(
  page: Page,
  options: PharmacyMockOptions = {},
): Promise<void> {
  await page.route("**/api/v1/pharmacies?**", async (route) => {
    const url = new URL(route.request().url());
    options.onRequest?.(url);
    const query = url.searchParams.get("q");

    if (query === "Erreur") {
      await route.fulfill({
        status: 503,
        json: {
          error: { code: "INTERNAL_ERROR", message: "Service indisponible" },
        },
      });
      return;
    }

    if (query === "Inconnue") {
      await route.fulfill({
        json: {
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      });
      return;
    }

    const totalPages = options.totalPages ?? 1;
    const currentPage = Number(url.searchParams.get("page") ?? "1");
    await route.fulfill({
      json: {
        ...pharmacyListResponse,
        pagination: {
          page: currentPage,
          pageSize: 20,
          total: totalPages * 20,
          totalPages,
        },
      },
    });
  });
}

type CapturedAnalyticsRequest = {
  serialized: string;
  envelope: BrowserAnalyticsEnvelope;
};

type BrowserAnalyticsEnvelope = {
  schemaVersion: 1;
  name:
    | "discovery_viewed"
    | "search_submitted"
    | "filters_applied"
    | "empty_results_shown"
    | "discovery_failed";
  sessionId: string;
  properties: Record<string, unknown>;
};

type AnalyticsEnvelopeParser = {
  parse: (value: unknown) => BrowserAnalyticsEnvelope;
};

const analyticsEnvelopeParser =
  analyticsEventEnvelopeSchema as unknown as AnalyticsEnvelopeParser;

async function captureAnalytics(
  page: Page,
): Promise<CapturedAnalyticsRequest[]> {
  const requests: CapturedAnalyticsRequest[] = [];
  await page.route("**/api/v1/analytics/events", async (route) => {
    const body = route.request().postData();
    if (body) {
      const candidate: unknown = JSON.parse(body);
      requests.push({
        serialized: body,
        envelope: analyticsEnvelopeParser.parse(candidate),
      });
    }
    await route.fulfill({ status: 202, json: { data: {} } });
  });
  return requests;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.locator("html").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    )
    .toEqual({
      clientWidth: await page
        .locator("html")
        .evaluate((element) => element.clientWidth),
      scrollWidth: await page
        .locator("html")
        .evaluate((element) => element.clientWidth),
    });
}

for (const viewport of viewports) {
  test(`discovery list remains usable at ${viewport.name}px without a map`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockPharmacyList(page);
    await page.goto("/?q=Centrale&district=Plateau&arrondissement=Poto-Poto");

    await expect(
      page.getByRole("heading", { name: "Pharmacies de garde" }),
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", {
        name: "Rechercher une pharmacie, un quartier",
      }),
    ).toHaveValue("Centrale");
    await expect(
      page.getByRole("combobox", { name: "Quartier", exact: true }),
    ).toHaveValue("Plateau");
    await expect(
      page.getByRole("combobox", { name: "Arrondissement", exact: true }),
    ).toHaveValue("Poto-Poto");
    await expect(
      page.getByRole("list", { name: "Résultats de pharmacies de garde" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Pharmacie Centrale/ }),
    ).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
}

test("search URL state is shareable, restored through navigation, and keyboard focus stays visible", async ({
  page,
}) => {
  const requests: URL[] = [];
  await mockPharmacyList(page, { onRequest: (url) => requests.push(url) });
  await page.goto("/?q=Alpha");
  const search = page.getByRole("searchbox", {
    name: "Rechercher une pharmacie, un quartier",
  });

  await expect(search).toHaveValue("Alpha");
  await page.locator("body").press("Tab");
  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Pharma Garde, accueil" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  expect(
    await search.evaluate((element) => element.matches(":focus-visible")),
  ).toBe(true);

  await page.keyboard.press("Tab");
  const district = page.getByRole("combobox", {
    name: "Quartier",
    exact: true,
  });
  await expect(district).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(district).toHaveValue("Plateau");
  await expect(page).toHaveURL(/district=Plateau/);
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.searchParams.get("district") === "Plateau" &&
          url.searchParams.get("page") === "1",
      ),
    )
    .toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(search).toBeFocused();

  await page.keyboard.press("Control+A");
  await page.keyboard.type("Centrale");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?q=Centrale/);
  await page.goBack();
  await expect(search).toHaveValue("Alpha");
});

test("discovery flow emits the required analytics through the existing transport", async ({
  page,
}) => {
  const requests = await captureAnalytics(page);
  const rawQuery = "  Inconnue  ";
  await mockPharmacyList(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Pharmacies de garde" }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        requests.filter(
          (request) => request.envelope.name === "discovery_viewed",
        ).length,
    )
    .toBe(1);

  const search = page.getByRole("searchbox", {
    name: "Rechercher une pharmacie, un quartier",
  });
  await search.fill(rawQuery);
  await search.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect
    .poll(
      () =>
        requests.filter(
          (request) => request.envelope.name === "empty_results_shown",
        ).length,
    )
    .toBe(1);
  await page
    .getByRole("combobox", { name: "Quartier", exact: true })
    .selectOption("Plateau");
  await expect
    .poll(
      () =>
        requests.filter(
          (request) => request.envelope.name === "filters_applied",
        ).length,
    )
    .toBe(1);

  await search.fill("Erreur");
  await search.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect
    .poll(
      () =>
        requests.filter(
          (request) => request.envelope.name === "discovery_failed",
        ).length,
    )
    .toBe(1);

  const envelopes = requests.map((request) => request.envelope);
  const serializedRequests = requests.map((request) => request.serialized);
  expect(envelopes).toContainEqual({
    schemaVersion: 1,
    name: "search_submitted",
    sessionId: expect.any(String),
    properties: { queryLength: 8 },
  });
  expect(envelopes).toContainEqual({
    schemaVersion: 1,
    name: "empty_results_shown",
    sessionId: expect.any(String),
    properties: { queryLength: 8, resultCount: 0 },
  });
  expect(envelopes).toContainEqual({
    schemaVersion: 1,
    name: "filters_applied",
    sessionId: expect.any(String),
    properties: { district: "Plateau" },
  });
  expect(envelopes).toContainEqual({
    schemaVersion: 1,
    name: "discovery_failed",
    sessionId: expect.any(String),
    properties: { code: "SERVICE_UNAVAILABLE" },
  });
  expect(envelopes.every((envelope) => envelope.schemaVersion === 1)).toBe(
    true,
  );
  expect(new Set(envelopes.map((envelope) => envelope.sessionId)).size).toBe(1);
  expect(
    envelopes.filter((envelope) => envelope.name === "discovery_viewed"),
  ).toHaveLength(1);
  expect(
    envelopes.filter((envelope) => envelope.name === "search_submitted"),
  ).toHaveLength(2);
  expect(
    envelopes.filter((envelope) => envelope.name === "filters_applied"),
  ).toHaveLength(1);
  expect(
    envelopes.filter((envelope) => envelope.name === "empty_results_shown"),
  ).toHaveLength(1);
  expect(
    envelopes.filter((envelope) => envelope.name === "discovery_failed"),
  ).toHaveLength(1);
  expect(serializedRequests.join("\n")).not.toContain(rawQuery);
  expect(serializedRequests.join("\n")).not.toContain("Inconnue");
});

test("pagination updates the URL and #4 request, resets after a filter change, and restores through history", async ({
  page,
}) => {
  const requests: URL[] = [];
  await mockPharmacyList(page, {
    onRequest: (url) => requests.push(url),
    totalPages: 3,
  });
  await page.goto("/?page=2");

  const pagination = page.getByRole("navigation", {
    name: "Pagination des résultats",
  });
  await expect(pagination).toBeVisible();
  await pagination.getByRole("button", { name: "Page 3" }).click();
  await expect(page).toHaveURL(/\?page=3/);
  await expect
    .poll(() => requests.some((url) => url.searchParams.get("page") === "3"))
    .toBe(true);
  expect(requests.at(-1)?.searchParams.get("pageSize")).toBe("20");

  const search = page.getByRole("searchbox", {
    name: "Rechercher une pharmacie, un quartier",
  });
  await search.fill("Centrale");
  await search.press("Enter");
  await expect(page).toHaveURL(/\?q=Centrale$/);
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.searchParams.get("q") === "Centrale" &&
          url.searchParams.get("page") === "1",
      ),
    )
    .toBe(true);

  await page.goBack();
  await expect(page).toHaveURL(/\?page=3/);
  await expect(
    pagination.getByRole("button", { name: "Page 3" }),
  ).toHaveAttribute("aria-current", "page");

  await page
    .getByRole("combobox", { name: "Quartier", exact: true })
    .selectOption("Plateau");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("page") ?? "1")
    .toBe("1");
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.searchParams.get("district") === "Plateau" &&
          url.searchParams.get("page") === "1",
      ),
    )
    .toBe(true);

  await pagination.getByRole("button", { name: "Page 3" }).click();
  await expect(page).toHaveURL(/page=3/);
  await page
    .getByRole("combobox", { name: "Arrondissement", exact: true })
    .selectOption("Poto-Poto");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("page") ?? "1")
    .toBe("1");
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.searchParams.get("arrondissement") === "Poto-Poto" &&
          url.searchParams.get("page") === "1",
      ),
    )
    .toBe(true);
});

test("retry performs a new pharmacy request and can recover from an API failure", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/v1/pharmacies?**", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        status: 503,
        json: {
          error: { code: "INTERNAL_ERROR", message: "Service indisponible" },
        },
      });
      return;
    }
    await route.fulfill({ json: pharmacyListResponse });
  });
  await page.goto("/");

  const retry = page.getByRole("button", { name: "Réessayer" });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(
    page.getByRole("link", { name: /Pharmacie Centrale/ }),
  ).toBeVisible();
  expect(requestCount).toBe(2);
});
