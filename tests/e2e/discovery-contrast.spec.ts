import { expect, test } from "@playwright/test";

function luminance(color: string): number {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Unsupported CSS color: ${color}`);
  }
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrastRatio(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

test("discovery duty text reaches AA contrast in selected list at four widths", async ({
  page,
}) => {
  await page.route("**/maps/wanzila-style.json", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#f9faff" },
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "00000000-0000-4000-8000-000000000083",
            name: "Pharmacie Centrale",
            address: {
              line: "12 avenue de la Paix",
              district: "Bacongo",
              arrondissement: "Bacongo",
            },
            coordinates: { latitude: -4.2634, longitude: 15.2429 },
            currentDuty: {
              state: "ACTIVE",
              startsAt: "2026-09-16T08:00:00.000Z",
              endsAt: "2026-09-18T08:00:00.000Z",
              sourceFreshness: "FRESH",
            },
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.route("**/api/v1/analytics/events", (route) =>
    route.fulfill({ status: 202, json: { data: {} } }),
  );

  await page.goto("/");
  await page
    .getByRole("button", { name: "Pharmacie Centrale sur la carte" })
    .click();
  await expect(
    page.getByRole("region", { name: "Pharmacie sélectionnée" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Liste" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Pharmacie Centrale" }),
  ).toHaveAttribute("data-selected", "true");

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const colors = await page.evaluate(() => {
      const pill = document.querySelector<HTMLElement>(
        ".discovery-page__live-pill",
      );
      const duty = document.querySelector<HTMLElement>(
        ".discovery-result__duty",
      );
      const result = document.querySelector<HTMLElement>(".discovery-result");
      const results = document.querySelector<HTMLElement>(".discovery-results");
      if (!pill || !duty || !result || !results)
        throw new Error("Discovery text missing");
      return {
        pillText: getComputedStyle(pill).color,
        pillBackground: getComputedStyle(pill).backgroundColor,
        dutyText: getComputedStyle(duty).color,
        dutyBackground: getComputedStyle(result).backgroundColor,
        resultsBackground: getComputedStyle(results).backgroundColor,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    expect(
      contrastRatio(colors.pillText, colors.pillBackground),
      `pill contrast at ${width}px`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(colors.dutyText, colors.dutyBackground),
      `duty contrast at ${width}px`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(colors.dutyText, colors.resultsBackground),
      `duty contrast on white at ${width}px`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(colors.scrollWidth, `horizontal overflow at ${width}px`).toBe(
      colors.clientWidth,
    );
  }
});

test("published pharmacy badge reaches AA contrast in admin layouts", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/pharmacies?**", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "00000000-0000-4000-8000-000000000083",
            name: "Pharmacie Centrale",
            address: {
              line: "12 avenue de la Paix",
              district: "Bacongo",
              arrondissement: "Bacongo",
            },
            phone: "+242060001234",
            coordinates: { latitude: -4.2634, longitude: 15.2429 },
            status: "PUBLISHED",
            createdAt: "2026-09-15T12:00:00.000Z",
            updatedAt: "2026-09-16T12:00:00.000Z",
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/pharmacies");
    const badge = page.locator(".pharmacy-status--published:visible").first();
    await expect(badge).toBeVisible();
    const colors = await badge.evaluate((element) => ({
      text: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    expect(
      contrastRatio(colors.text, colors.background),
      `published badge contrast at ${width}px`,
    ).toBeGreaterThanOrEqual(4.5);
  }
});
