import { test, expect } from "@playwright/test";
import { ACTORS } from "./actors";

/**
 * Rol dual y multiempresa (R1-QA-03 / ADR-001).
 *
 * `instalador1@demo.dev` es el actor dual del seed: en «Gráfica Demo SA» tiene
 * las capacidades `coordinator` e `installer` a la vez, y en «Grafica Demo
 * Brasil» sólo `installer`. Es el caso que el modelo de roles escalar no podía
 * representar y que motivó `company_membership_roles`.
 *
 * Lo que se prueba acá es que las dos capacidades COEXISTEN: que ganar
 * coordinación no le saca las pantallas de campo, y que tener trabajo asignado
 * no le esconde la coordinación. La denegación de autoaprobación no se prueba
 * acá sino donde está implementada —trigger `validate_order_transition`
 * (pgTAP `no_self_approval.test.sql`) y dominio (`order-rules.test.ts`)—
 * porque montar esa transición por UI depende de estado que el seed no fija.
 */

test.use({ storageState: ACTORS.installer.storageState });

test("conserva las pantallas de campo", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator("main").first()).toBeVisible();

  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page).not.toHaveURL(/\/login/);
});

test("además entra a coordinación", async ({ page }) => {
  await page.goto("/coordination");
  await expect(page).toHaveURL(/\/coordination$/);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("main").first()).toBeVisible();
});

test("la navegación ofrece las dos capacidades a la vez", async ({ page }) => {
  await page.goto("/home");

  // El tab de coordinación sale de `isCoordinatorSomewhere`, no de un rol
  // escalar: si volviera a derivarse de `company_installers.role`, esta
  // aserción y la anterior no podrían pasar las dos.
  const nav = page.getByRole("navigation").first();
  await expect(nav.locator('a[href="/coordination"]')).toHaveCount(1);
  await expect(nav.locator('a[href="/tasks"]')).toHaveCount(1);
});

test("coordinar en una empresa no lo convierte en gerente", async ({ page }) => {
  // Coordinación es una capacidad dentro del área installer. El área de empresa
  // sigue siendo de `company_manager`, y el proxy tiene que sacarlo de ahí.
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/\/dashboard$/);
});
