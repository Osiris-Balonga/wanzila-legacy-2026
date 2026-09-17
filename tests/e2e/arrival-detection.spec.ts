import { expect, test, type Page } from "@playwright/test";

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

type Witness = {
  calls: number;
  cleared: number[];
  success?: PositionCallback;
  error?: PositionErrorCallback;
};
type Attempt = {
  attemptId: string;
  pharmacyId: string;
  sessionId: string;
  outcome: string;
  startedAt: string;
  resolvedAt: string | null;
};

async function installLocationMock(page: Page) {
  await page.addInitScript(() => {
    const witness: Witness = { calls: 0, cleared: [] };
    (window as typeof window & { __arrivalWitness: Witness }).__arrivalWitness =
      witness;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition() {
          throw new Error("Preview GPS must not be used by arrival watch");
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

async function emitPosition(
  page: Page,
  latitude: number,
  longitude: number,
  accuracy = 5,
) {
  await page.evaluate(
    ({ latitude, longitude, accuracy }) => {
      (
        window as typeof window & { __arrivalWitness: Witness }
      ).__arrivalWitness.success?.({
        coords: { latitude, longitude, accuracy },
      } as GeolocationPosition);
    },
    { latitude, longitude, accuracy },
  );
}

async function emitError(page: Page, code: number) {
  await page.evaluate((code) => {
    (
      window as typeof window & { __arrivalWitness: Witness }
    ).__arrivalWitness.error?.({ code } as GeolocationPositionError);
  }, code);
}

async function witness(page: Page) {
  return page.evaluate(() => {
    const { calls, cleared } = (
      window as typeof window & { __arrivalWitness: Witness }
    ).__arrivalWitness;
    return { calls, cleared };
  });
}

async function mockAttempts(
  page: Page,
  options: { failStartOnce?: boolean; failOutcomeOnce?: boolean } = {},
) {
  const attempts = new Map<string, Attempt>();
  const requests: Array<{ method: string; body: Record<string, string> }> = [];
  let startFailed = false;
  let outcomeFailed = false;
  await page.route("**/api/v1/route-attempts**", async (route) => {
    const method = route.request().method();
    const body = route.request().postDataJSON() as Record<string, string>;
    requests.push({ method, body });
    if (method === "POST") {
      if (options.failStartOnce && !startFailed) {
        startFailed = true;
        await route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE" } },
        });
        return;
      }
      const prior = attempts.get(body.attemptId);
      const attempt = prior ?? {
        attemptId: body.attemptId,
        pharmacyId: body.pharmacyId,
        sessionId: body.sessionId,
        outcome: "UNKNOWN",
        startedAt: "2026-09-17T12:00:00.000Z",
        resolvedAt: null,
      };
      attempts.set(attempt.attemptId, attempt);
      await route.fulfill({
        status: prior ? 200 : 201,
        json: { data: attempt },
      });
      return;
    }
    const attemptId = new URL(route.request().url()).pathname
      .split("/")
      .at(-2)!;
    const attempt = attempts.get(attemptId)!;
    if (options.failOutcomeOnce && !outcomeFailed) {
      outcomeFailed = true;
      await route.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE" } },
      });
      return;
    }
    if (attempt.outcome !== "UNKNOWN" && attempt.outcome !== body.outcome) {
      await route.fulfill({
        status: 409,
        json: { error: { code: "CONFLICT" } },
      });
      return;
    }
    attempt.outcome = body.outcome;
    attempt.resolvedAt = "2026-09-17T12:01:00.000Z";
    await route.fulfill({ json: { data: attempt } });
  });
  return { attempts, requests };
}

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
  await page.route("**/api/v1/analytics/events", (route) =>
    route.fulfill({ status: 202, json: { data: {} } }),
  );
});

test("GPS confirms only after a confident away fix, with one terminal outcome and no coordinates sent", async ({
  page,
}) => {
  await installLocationMock(page);
  const { attempts, requests } = await mockAttempts(page);
  const outbound: string[] = [];
  page.on("request", (request) =>
    outbound.push(`${request.url()} ${request.postData() ?? ""}`),
  );
  await page.goto(`/pharmacies/${id}/itineraire`);
  expect(await witness(page)).toEqual({ calls: 0, cleared: [] });
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/pharmacies/${id}/navigation$`));
  await expect.poll(async () => (await witness(page)).calls).toBe(1);
  await emitPosition(page, -4.2646, 15.2429);
  await expect(
    page.getByRole("heading", { name: /suivi d’arrivée en cours/i }),
  ).toBeVisible();
  await emitPosition(page, -4.2636, 15.2429, 1000);
  await expect(page.getByText(/précision insuffisante/i)).toBeVisible();
  expect([...attempts.values()][0]?.outcome).toBe("UNKNOWN");
  await emitPosition(page, -4.2636, 15.2429);
  await expect(
    page.getByRole("heading", { name: /arrivée à proximité estimée/i }),
  ).toBeVisible();
  await expect(page.getByText("Résultat du trajet enregistré.")).toBeVisible();
  expect([...attempts.values()].map((attempt) => attempt.outcome)).toEqual([
    "GPS_CONFIRMED",
  ]);
  expect(requests.map(({ method }) => method)).toEqual(["POST", "PATCH"]);
  expect(requests[1]?.body.outcome).toBe("GPS_CONFIRMED");
  expect(await witness(page)).toEqual({ calls: 1, cleared: [1] });
  await emitPosition(page, -4.2636, 15.2429);
  expect(requests).toHaveLength(2);
  const storage = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }));
  expect(JSON.stringify(storage)).not.toContain("-4.2636");
  expect(outbound.join("\n")).not.toContain("-4.2646");
});

test("nearby at first reliable fix is separate from a completed journey", async ({
  page,
}) => {
  await installLocationMock(page);
  const { attempts } = await mockAttempts(page);
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect.poll(async () => (await witness(page)).calls).toBe(1);
  await emitPosition(page, -4.2636, 15.2429, 1000);
  await emitPosition(page, -4.2636, 15.2429);
  await expect(
    page.getByRole("heading", { name: "Déjà à proximité" }),
  ).toBeVisible();
  await expect(page.getByText("Résultat du trajet enregistré.")).toBeVisible();
  expect([...attempts.values()][0]?.outcome).toBe("ALREADY_NEARBY");
});

test("GPS failure permits a clearly declared arrival; explicit stop has its own result", async ({
  page,
}) => {
  await installLocationMock(page);
  const { attempts } = await mockAttempts(page);
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect.poll(async () => (await witness(page)).calls).toBe(1);
  await emitError(page, 1);
  await expect(page.getByText(/position refusée/i)).toBeVisible();
  await page.getByRole("button", { name: "Je suis arrivé" }).click();
  await expect(
    page.getByRole("heading", { name: "Arrivée déclarée" }),
  ).toBeVisible();
  await expect(page.getByText("Résultat du trajet enregistré.")).toBeVisible();
  expect([...attempts.values()][0]?.outcome).toBe("USER_DECLARED");
  await page.getByRole("button", { name: "Terminer le suivi" }).click();
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect.poll(async () => (await witness(page)).calls).toBe(2);
  await emitPosition(page, -4.2646, 15.2429);
  await page.getByRole("button", { name: "Quitter le suivi" }).click();
  await expect(page.getByText("Résultat du trajet enregistré.")).toBeVisible();
  expect([...attempts.values()].map((attempt) => attempt.outcome)).toEqual([
    "USER_DECLARED",
    "STOPPED",
  ]);
});

test("leaving the page leaves an unknown outcome, never a presumed failure", async ({
  page,
}) => {
  await installLocationMock(page);
  const { attempts } = await mockAttempts(page);
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect.poll(async () => (await witness(page)).calls).toBe(1);
  await emitPosition(page, -4.2646, 15.2429);
  await page.goBack();
  expect([...attempts.values()][0]?.outcome).toBe("UNKNOWN");
  expect((await witness(page)).cleared).toEqual([1]);
});

test("reloading during tracking leaves its attempt unknown", async ({
  page,
}) => {
  await installLocationMock(page);
  const { attempts, requests } = await mockAttempts(page);
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect.poll(async () => (await witness(page)).calls).toBe(1);
  await emitPosition(page, -4.2646, 15.2429);
  await page.reload();
  expect([...attempts.values()][0]?.outcome).toBe("UNKNOWN");
  expect(requests.map((request) => request.method)).toEqual(["POST"]);
});

test("a failed start does not activate GPS and retries the same attempt", async ({
  page,
}) => {
  await installLocationMock(page);
  const { attempts, requests } = await mockAttempts(page, {
    failStartOnce: true,
  });
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    /n’a pas pu être enregistré/i,
  );
  expect(await witness(page)).toEqual({ calls: 0, cleared: [] });
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect.poll(async () => (await witness(page)).calls).toBe(1);
  expect(requests[0]?.body.attemptId).toBe(requests[1]?.body.attemptId);
  expect(attempts.size).toBe(1);
});

test("a failed outcome remains unknown until idempotent retry succeeds", async ({
  page,
}) => {
  await installLocationMock(page);
  const { attempts, requests } = await mockAttempts(page, {
    failOutcomeOnce: true,
  });
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect.poll(async () => (await witness(page)).calls).toBe(1);
  await emitPosition(page, -4.2646, 15.2429);
  await emitPosition(page, -4.2636, 15.2429);
  await expect(page.getByRole("alert")).toContainText(/bilan reste inconnu/i);
  expect([...attempts.values()][0]?.outcome).toBe("UNKNOWN");
  await page
    .getByRole("button", { name: "Réessayer l’enregistrement" })
    .click();
  await expect(page.getByText("Résultat du trajet enregistré.")).toBeVisible();
  expect(
    requests
      .filter((request) => request.method === "PATCH")
      .map((request) => request.body.outcome),
  ).toEqual(["GPS_CONFIRMED", "GPS_CONFIRMED"]);
  expect([...attempts.values()][0]?.outcome).toBe("GPS_CONFIRMED");
});

test("mobile and desktop outcome states retain layout without horizontal overflow", async ({
  page,
}, testInfo) => {
  await installLocationMock(page);
  await mockAttempts(page);
  await page.goto(`/pharmacies/${id}/itineraire`);
  await page.addStyleTag({
    content: ".skip-link { visibility: hidden !important; }",
  });
  await page
    .getByRole("button", { name: "Démarrer le suivi d’arrivée" })
    .click();
  await expect.poll(async () => (await witness(page)).calls).toBe(1);
  await emitPosition(page, -4.2646, 15.2429);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: /suivi d’arrivée en cours/i }),
    ).toBeVisible();
    expect(
      await page
        .locator("html")
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath("visual-evidence", `active-${width}.png`),
      fullPage: true,
      animations: "disabled",
      scale: "css",
    });
  }
  await emitPosition(page, -4.2636, 15.2429);
  await expect(page.getByText("Résultat du trajet enregistré.")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("visual-evidence", "confirmed-390.png"),
    fullPage: true,
    animations: "disabled",
    scale: "css",
  });
});
