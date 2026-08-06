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
  const registered = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration);
  });
  expect(registered).toBe(true);
});
