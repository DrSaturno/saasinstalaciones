import { expect, test } from "@playwright/test";
import { ACTORS } from "./actors";

const CLIENT_SEED = "33333333-3333-3333-3333-333333333333";

/**
 * Link a una ficha de locación dentro del contenido de la página.
 *
 * Acotado a `main` y excluyendo `/locations/review`: la cola de revisión vive
 * en el menú lateral bajo el mismo prefijo, y un `a[href^="/locations/"]` suelto
 * la agarraba antes que a cualquier ficha.
 */
const FICHA_LINK = 'a[href^="/locations/"]:not([href="/locations/review"])';

/** Ficha transversal de la locacion canonica (R2-UI-01). */
test.describe("gerente", () => {
  test.use({ storageState: ACTORS.manager.storageState });

  test("abre la ficha permanente desde el cliente y conserva la historia del proyecto", async ({ page }) => {
    await page.goto(`/clients/${CLIENT_SEED}`);
    const locationLink = page.locator("main").last().locator(FICHA_LINK).first();
    await expect(locationLink).toBeVisible();
    const locationName = (await locationLink.innerText()).trim();

    await locationLink.click();
    await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+$/);

    const main = page.locator("main").last();
    await expect(main.getByRole("heading", { level: 1, name: locationName })).toBeVisible();
    await expect(main.getByText("Ficha permanente de la locación")).toBeVisible();
    await expect(main.getByText("Refacción Estaciones Norte")).toBeVisible();
    await expect(main.getByText(/Recambio de gráfica/).first()).toBeVisible();
    // Por texto y no por rol: los títulos de tarjeta usan `CardTitle`, que
    // renderiza un <div>. El texto está, pero no es un encabezado semántico
    // (ver la nota de accesibilidad en tasks.md, R2-UI-01).
    await expect(main.getByText("Auditoría de la ficha")).toBeVisible();
  });
});

test.describe("aislamiento", () => {
  test("otro tenant no puede leer la ficha canonica", async ({ browser }) => {
    const managerA = await browser.newContext({ storageState: ACTORS.manager.storageState });
    const managerB = await browser.newContext({ storageState: ACTORS.managerB.storageState });

    try {
      const pageA = await managerA.newPage();
      await pageA.goto(`/clients/${CLIENT_SEED}`);
      const href = await pageA
        .locator("main")
        .last()
        .locator(FICHA_LINK)
        .first()
        .getAttribute("href");
      expect(href).toBeTruthy();
      // Si esto agarrara el link del menú, el test pasaría sin haber probado
      // nada: la cola de revisión sí es visible para cualquier gerente.
      expect(href).toMatch(/^\/locations\/[0-9a-f-]{36}$/);

      const pageB = await managerB.newPage();
      await pageB.goto(href!);
      await expect(pageB.getByText("404")).toBeVisible();
    } finally {
      await managerA.close();
      await managerB.close();
    }
  });
});
