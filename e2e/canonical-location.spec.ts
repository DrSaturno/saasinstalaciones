import { expect, test } from "@playwright/test";
import { ACTORS } from "./actors";

const CLIENT_SEED = "33333333-3333-3333-3333-333333333333";

/** Ficha transversal de la locacion canonica (R2-UI-01). */
test.describe("gerente", () => {
  test.use({ storageState: ACTORS.manager.storageState });

  test("abre la ficha permanente desde el cliente y conserva la historia del proyecto", async ({ page }) => {
    await page.goto(`/clients/${CLIENT_SEED}`);
    const locationLink = page.locator('a[href^="/locations/"]').first();
    await expect(locationLink).toBeVisible();
    const locationName = (await locationLink.innerText()).trim();

    await locationLink.click();
    await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+$/);

    const main = page.locator("main").last();
    await expect(main.getByRole("heading", { level: 1, name: locationName })).toBeVisible();
    await expect(main.getByText("Ficha permanente de la locación")).toBeVisible();
    await expect(main.getByText("Refacción Estaciones Norte")).toBeVisible();
    await expect(main.getByText(/Recambio de gráfica/).first()).toBeVisible();
    await expect(main.getByRole("heading", { name: "Auditoría de la ficha" })).toBeVisible();
  });
});

test.describe("aislamiento", () => {
  test("otro tenant no puede leer la ficha canonica", async ({ browser }) => {
    const managerA = await browser.newContext({ storageState: ACTORS.manager.storageState });
    const managerB = await browser.newContext({ storageState: ACTORS.managerB.storageState });

    try {
      const pageA = await managerA.newPage();
      await pageA.goto(`/clients/${CLIENT_SEED}`);
      const href = await pageA.locator('a[href^="/locations/"]').first().getAttribute("href");
      expect(href).toBeTruthy();

      const pageB = await managerB.newPage();
      await pageB.goto(href!);
      await expect(pageB.getByText("404")).toBeVisible();
    } finally {
      await managerA.close();
      await managerB.close();
    }
  });
});
