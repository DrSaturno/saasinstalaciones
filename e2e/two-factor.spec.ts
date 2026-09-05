import { test, expect } from "@playwright/test";
import { ACTORS, E2E_PASSWORD } from "./actors";

/**
 * E2E-06 del handoff de UX: el segundo factor no puede ser un callejón sin
 * salida (UX-014).
 *
 * El riesgo real que cubre: `platform_admin` y `company_manager` tienen MFA
 * obligatoria. Si alguien pierde el autenticador —teléfono roto, app borrada—
 * y la pantalla de verificación no ofrece más que un campo de código, esa
 * cuenta queda encerrada, y son justo las dos cuentas con las que se administra
 * el producto.
 *
 * Arranca SIN estado de sesión a propósito: los `storageState` guardados ya
 * pasaron el segundo factor (AAL2) y esta pantalla sólo existe en AAL1. La
 * única forma honesta de llegar acá es iniciando sesión de verdad.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ACTORS.manager.email);
  await page.locator("#password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /ingresar|entrar|iniciar/i }).click();
  await page.waitForURL("**/two-factor/verify", { timeout: 30_000 });
});

test("ofrece salida y orientación a quien perdió el autenticador", async ({ page }) => {
  // La orientación de recuperación: sin esto, la pantalla no dice qué hacer.
  await expect(
    page.getByText(/no tenés acceso a tu autenticador/i),
    "la pantalla de verificación no explica qué hacer si se perdió el autenticador",
  ).toBeVisible();

  // Saber con qué cuenta se está: la mitad de los casos reales es haber entrado
  // con la cuenta equivocada.
  await expect(
    page.getByText(ACTORS.manager.email),
    "la pantalla no muestra con qué cuenta se está intentando entrar",
  ).toBeVisible();

  // Y la salida de verdad. `min-h-11` en el layout: 44 px, el mínimo táctil.
  const logout = page.getByRole("button", { name: /salir/i });
  await expect(logout, "no hay forma de cerrar sesión desde el segundo factor").toBeVisible();
  const box = await logout.boundingBox();
  expect(box?.height ?? 0, "el botón de salir no alcanza el mínimo táctil").toBeGreaterThanOrEqual(44);

  await logout.click();
  await page.waitForURL(/\/login|\/$/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/two-factor/);
});

test("un código incorrecto explica el error y no deja pasar", async ({ page }) => {
  await page.locator("#totp-code").fill("000000");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(
    page.getByRole("alert"),
    "un código incorrecto no mostró ningún mensaje de error",
  ).toBeVisible({ timeout: 20_000 });

  // Lo importante: sigue afuera. La exigencia de AAL2 no se relaja.
  await expect(page).toHaveURL(/\/two-factor\/verify/);
});
