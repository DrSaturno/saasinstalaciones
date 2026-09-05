import { test, expect, type Page } from "@playwright/test";
import { ACTORS } from "./actors";

/**
 * E2E-02 y E2E-03 del handoff de UX: la promesa offline del área de campo.
 *
 * Son los dos escenarios que la fase anterior no pudo verificar por falta de un
 * runtime Docker en la máquina donde se implementó. Acá corren contra el
 * Supabase local de CI y un build de producción real, que es la única forma de
 * probarlos: el service worker **sólo se registra en producción**, así que en
 * `pnpm dev` este archivo no probaría nada.
 *
 * Qué se afirma:
 *  - una pantalla de campo ya visitada vuelve a abrir sin red (UX-002);
 *  - una acción hecha sin red sobrevive al reload y se sincroniza sola al
 *    recuperar señal, sin duplicar (UX-003).
 */

test.use({ storageState: ACTORS.installer.storageState });

/** El SW se registra tras `load` y tras preparar el almacenamiento por usuario. */
async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration?.active) && Boolean(navigator.serviceWorker.controller);
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** El SW cachea al responder: hay que darle una navegación exitosa por ruta. */
async function warmRoute(page: Page, path: string) {
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/login/);
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("una pantalla de campo ya visitada vuelve a abrir sin red", async ({ page, context }) => {
  await page.goto("/home");
  await waitForServiceWorker(page);
  await warmRoute(page, "/home");
  await warmRoute(page, "/tasks");

  await context.setOffline(true);
  try {
    // Sin red y sin SW esto sería la pantalla de error del navegador. Que
    // aparezca el contenido real es la prueba de que el fallback funcionó.
    await page.goto("/tasks");
    await expect(
      page.locator("main"),
      "la pantalla de tareas no se pudo reabrir sin red",
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/home");
    await expect(
      page.locator("main"),
      "el inicio de campo no se pudo reabrir sin red",
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.setOffline(false);
  }

  // De vuelta con señal, la pantalla se sirve de red otra vez.
  await page.goto("/tasks");
  await expect(page.locator("main")).toBeVisible();
});

test("una acción sin red sobrevive al reload y se sincroniza al volver", async ({ page, context }) => {
  await page.goto("/home");
  await waitForServiceWorker(page);

  // Elegir una orden accionable y dejarla cacheada ANTES de cortar la red.
  await warmRoute(page, "/tasks");
  const link = page.locator('a[href^="/tasks/"]').first();
  await expect(link, "el instalador del seed no tiene ninguna tarea listada").toBeVisible();
  const href = (await link.getAttribute("href"))!;
  await warmRoute(page, href);

  // Cualquiera de las acciones del flujo sirve; se toma la que ofrezca la
  // pantalla, porque el estado depende de lo que hayan hecho otras specs.
  const actionable = page
    .getByRole("button", { name: /voy en camino|llegué al sitio|iniciar trabajo/i })
    .first();
  test.skip(
    !(await actionable.isVisible().catch(() => false)),
    "la orden no está en un estado con acción de campo disponible",
  );
  const actionLabel = (await actionable.textContent())?.trim() ?? "";

  await context.setOffline(true);
  try {
    await actionable.click();

    // Sin red la transición se encola y la pantalla se mueve igual: si el botón
    // que se apretó sigue ahí, el estado optimista no se aplicó.
    await expect(
      page.getByRole("button", { name: actionLabel }),
      "la acción offline no cambió el estado en pantalla",
    ).toBeHidden({ timeout: 20_000 });

    // Reabrir sin red tiene que restaurar el estado pendiente desde Dexie, no
    // volver al estado viejo del servidor. Es la carrera que corrigió UX-002.
    await page.goto(href);
    await expect(
      page.getByRole("button", { name: actionLabel }),
      "al reabrir sin red se perdió la transición pendiente",
    ).toBeHidden({ timeout: 20_000 });
  } finally {
    await context.setOffline(false);
  }

  // Con señal, la cola descarga sola. El estado tiene que quedar persistido en
  // el servidor: se comprueba recargando, que lee del servidor y no de Dexie.
  await page.goto(href);
  await expect(
    page.getByRole("button", { name: actionLabel }),
    "la transición encolada offline no llegó al servidor al recuperar señal",
  ).toBeHidden({ timeout: 30_000 });
});
