import { test, expect } from "@playwright/test";
import { ACTORS } from "./actors";

/**
 * El área installer se diseña a 375 px primero, así que su smoke corre en el
 * proyecto `mobile`. Verifica que las pantallas de campo abren y que la página
 * no desborda horizontalmente, que es la falla típica en ese ancho.
 */

test.use({ storageState: ACTORS.installer.storageState });

for (const path of ["/home", "/tasks", "/route", "/profile"]) {
  test(`${path} abre en mobile`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page).not.toHaveURL(/\/login/);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `${path} desborda a lo ancho`).toBe(false);
  });
}

test("el service worker queda registrado", async ({ page }) => {
  await page.goto("/home");

  // El registro no es inmediato: el componente espera el evento `load` y a que
  // termine de prepararse el almacenamiento offline. Consultarlo apenas navega
  // devolvía `undefined` por carrera, no porque el SW estuviera roto.
  const registered = await page
    .waitForFunction(
      async () => {
        if (!("serviceWorker" in navigator)) return false;
        return Boolean(await navigator.serviceWorker.getRegistration());
      },
      undefined,
      { timeout: 15_000 },
    )
    .then(() => true)
    .catch(() => false);

  expect(registered).toBe(true);
});
