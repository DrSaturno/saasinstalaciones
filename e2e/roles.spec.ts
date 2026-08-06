import { test, expect } from "@playwright/test";
import { ACTORS, type ActorName } from "./actors";

/**
 * Recorridos mínimos autenticados por rol (R0-PLAT-04).
 *
 * El objetivo del gate no es cubrir cada pantalla: es probar que cada actor
 * entra a SU área y que el proxy lo saca de las demás. La denegación importa
 * tanto como el camino feliz — es la única prueba de extremo a extremo de que
 * el enrutado por rol no se abrió con algún cambio.
 */

test.describe("sin sesión", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ["/dashboard", "/master", "/home", "/tasks"]) {
    test(`${path} manda al login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

for (const [name, actor] of Object.entries(ACTORS) as [ActorName, (typeof ACTORS)[ActorName]][]) {
  test.describe(name, () => {
    test.use({ storageState: actor.storageState });

    test(`entra a ${actor.landing}`, async ({ page }) => {
      await page.goto(actor.landing);
      await expect(page).toHaveURL(new RegExp(`${actor.landing}$`));
      // Si la sesión no valiera, el proxy habría redirigido al login.
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main, body")).toBeVisible();
    });

    for (const forbidden of actor.forbidden) {
      test(`no entra a ${forbidden}`, async ({ page }) => {
        await page.goto(forbidden);
        await expect(page).not.toHaveURL(new RegExp(`${forbidden}$`));
      });
    }
  });
}

test.describe("empresa", () => {
  test.use({ storageState: ACTORS.manager.storageState });

  test("el tablero muestra las secciones de gestión", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("el listado de órdenes carga", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("el equipo carga", async ({ page }) => {
    await page.goto("/team");
    await expect(page).toHaveURL(/\/team$/);
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe("aislamiento entre empresas", () => {
  test("el gerente B no ve los proyectos de la empresa A", async ({ browser }) => {
    const a = await browser.newContext({ storageState: ACTORS.manager.storageState });
    const b = await browser.newContext({ storageState: ACTORS.managerB.storageState });

    try {
      const pageA = await a.newPage();
      await pageA.goto("/projects");
      const projectLink = pageA.locator('a[href^="/projects/"]').first();

      // Si la empresa A no tiene proyectos en el seed, no hay nada que aislar:
      // se prefiere saltar antes que dar un verde que no probó nada.
      const count = await pageA.locator('a[href^="/projects/"]').count();
      test.skip(count === 0, "el seed no dejó proyectos en la empresa A");

      const href = await projectLink.getAttribute("href");
      expect(href).toBeTruthy();

      const pageB = await b.newPage();
      await pageB.goto(href!);
      // Cruzar el id de otra empresa no puede devolver la ficha.
      await expect(pageB).not.toHaveURL(new RegExp(`${href}$`));
    } finally {
      await a.close();
      await b.close();
    }
  });
});
