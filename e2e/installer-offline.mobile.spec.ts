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

test("un avance cargado sin red se encola, se avisa y se sincroniza al volver", async ({ page, context }) => {
  await page.goto("/home");
  await waitForServiceWorker(page);

  // Orden propia y distinta de la que usa `installer-field-flow`: del seed sale
  // `en_proceso`, que es el estado donde se pueden cargar avances. Compartir
  // una orden entre specs las haría depender del orden de ejecución.
  await warmRoute(page, "/tasks");
  const link = page
    .locator('a[href^="/tasks/"]')
    .filter({ hasText: "Estación 004" })
    .first();
  await expect(link, "no se encontró la orden en proceso del seed").toBeVisible();
  const href = (await link.getAttribute("href"))!;
  await warmRoute(page, href);

  const noteBox = page.locator("textarea").first();
  await expect(
    noteBox,
    "la orden no ofrece cargar un avance; ¿cambió su estado en el seed?",
  ).toBeVisible();

  // Guardar un avance NO cambia el estado de la orden: es idempotente entre
  // reintentos de CI, a diferencia de una transición, que sólo se puede hacer
  // una vez y dejaría el segundo intento sin nada que probar.
  await context.setOffline(true);
  try {
    await noteBox.fill(`Avance offline de prueba ${Date.now()}`);
    await page.getByRole("button", { name: /guardar avance/i }).click();

    // Lo que UX-003 vino a arreglar: sin red, la persona tiene que ver que su
    // trabajo quedó guardado y sin enviar — no un éxito falso ni silencio.
    await expect(
      page.getByText(/sin enviar/i).first(),
      "sin red no se avisó que el avance quedó pendiente de envío",
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.setOffline(false);
  }

  // Al recuperar señal la cola descarga sola y el aviso de pendiente se apaga.
  await expect(
    page.getByText(/sin enviar|por sincronizar/i).first(),
    "el avance encolado no se sincronizó al recuperar la señal",
  ).toBeHidden({ timeout: 40_000 });
});
