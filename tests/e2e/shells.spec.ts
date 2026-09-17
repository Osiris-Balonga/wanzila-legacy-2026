import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { name: "320", width: 320, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 1000 },
];

const expectNoHorizontalOverflow = async (page: Page) => {
  const documentWidth = await page.locator("html").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(documentWidth.scrollWidth).toBe(documentWidth.clientWidth);
};

for (const viewport of viewports) {
  test(`public shell is usable at ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/#list");
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByRole("navigation", { name: "Navigation publique" }),
    ).toBeVisible();
  });
}

for (const viewport of viewports) {
  test(`admin shell is usable at ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/admin");
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if (viewport.width < 768) {
      await page
        .getByRole("button", { name: "Ouvrir le menu d’administration" })
        .click();
    }

    await expect(
      page.getByRole("navigation", { name: "Navigation administration" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Navigation administration" })
        .getByRole("link", { name: "Signalements" }),
    ).toHaveCount(0);
  });
}

test("keyboard focus remains visible on shell navigation", async ({ page }) => {
  await page.goto("/#list");
  await page.locator("body").press("Tab");
  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Pharma Garde, accueil" }),
  ).toBeFocused();
});

test("the narrow administration Sheet preserves keyboard focus lifecycle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/admin");
  const trigger = page.getByRole("button", {
    name: "Ouvrir le menu d’administration",
  });
  const sheet = page.getByRole("dialog", {
    name: "Navigation administration",
  });

  await trigger.focus();
  await trigger.press("Enter");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Fermer" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Dashboard" })).toBeFocused();
  await expect(
    sheet.getByRole("navigation", { name: "Navigation administration" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("administration placeholder tabs support pointer and keyboard selection", async ({
  page,
}) => {
  await page.goto("/admin/parametres");
  const tablist = page.getByRole("tablist", {
    name: "Sections de démonstration",
  });
  const overviewTab = tablist.getByRole("tab", { name: "Vue d’ensemble" });
  const componentsTab = tablist.getByRole("tab", { name: "Composants" });

  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await expect(overviewTab).toHaveAttribute("tabindex", "0");
  await expect(componentsTab).toHaveAttribute("aria-selected", "false");
  await expect(componentsTab).toHaveAttribute("tabindex", "-1");

  await componentsTab.click();
  await expect(componentsTab).toHaveAttribute("aria-selected", "true");
  await expect(componentsTab).toHaveAttribute("tabindex", "0");
  await expect(overviewTab).toHaveAttribute("tabindex", "-1");

  await componentsTab.press("Home");
  await expect(overviewTab).toBeFocused();
  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await overviewTab.press("ArrowRight");
  await expect(componentsTab).toBeFocused();
  await expect(componentsTab).toHaveAttribute("aria-selected", "true");
  await componentsTab.press("ArrowLeft");
  await expect(overviewTab).toBeFocused();
  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await overviewTab.press("End");
  await expect(componentsTab).toBeFocused();
  await expect(componentsTab).toHaveAttribute("aria-selected", "true");
});
