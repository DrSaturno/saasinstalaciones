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
      // `main` y no `main, body`: el layout de empresa anida dos <main>, y un
      // selector que además matchea <body> resuelve a tres elementos, lo que en
      // modo estricto es error aunque la página haya cargado bien.
      await expect(page.locator("main").first()).toBeVisible();
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
      const projectName = (await projectLink.innerText()).trim();
      expect(projectName).not.toBe("");

      const pageB = await b.newPage();
      await pageB.goto(href!);

      // Lo que hay que probar es que no se filtren datos, no que haya un
      // redirect: ante un id de otra empresa la app deja la URL puesta y
      // devuelve su propio 404. Afirmar sobre la URL daba un rojo que no
      // correspondía a ninguna falla real de aislamiento.
      await expect(pageB.getByText(projectName, { exact: false })).toHaveCount(0);
      // El "404" va en dígitos en las dos locales; el texto que lo acompaña no,
      // y el gerente B ve la app en pt-BR.
      await expect(pageB.getByText("404")).toBeVisible();
    } finally {
      await a.close();
      await b.close();
    }
  });
});
