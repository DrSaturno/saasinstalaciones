import { test, expect } from "@playwright/test";
import { ACTORS } from "./actors";

/**
 * Cola de revisión del backfill canónico (R2-UI-03).
 *
 * El seed deja dos filas pendientes que reproducen los casos reales de
 * producción: una referencia externa repetida en dos locales de ciudades
 * distintas, y una fila sin referencia.
 */

test.describe("gerente", () => {
  test.use({ storageState: ACTORS.manager.storageState });

  test("la cola muestra los conflictos con sus variantes", async ({ page }) => {
    await page.goto("/locations/review");
    await expect(page).toHaveURL(/\/locations\/review$/);

    const main = page.locator("main").first();
    await expect(main).toBeVisible();

    // El conflicto va primero: es el único que dejó una ficha con datos que
    // pueden ser de otro local.
    await expect(
      main.getByText("Misma referencia, datos distintos"),
    ).toBeVisible();
    await expect(main.getByText("ypf001")).toBeVisible();

    // Las dos variantes tienen que verse enfrentadas, no una sola.
    await expect(main.getByText("monroe y libertador")).toBeVisible();
    await expect(main.getByText("av. horizonte 473")).toBeVisible();

    // Y el aviso de cuántos campos no coinciden, que es lo que hace rápida la
    // decisión.
    await expect(main.getByText(/campos no coinciden/)).toBeVisible();
  });

  test("mide la divergencia contra el modelo canónico", async ({ page }) => {
    await page.goto("/locations/review");
    const main = page.locator("main").last();

    // El corte a la ficha canónica sólo es seguro con divergencia cero, así que
    // el número tiene que estar a la vista y no escondido en un log.
    await expect(main.getByText("Estado de la unificación")).toBeVisible();
    await expect(main.getByText(/\d+ de \d+ alineados/)).toBeVisible();
  });

  test("exige explicar la decisión antes de cerrar una fila", async ({ page }) => {
    await page.goto("/locations/review");

    await page.getByRole("button", { name: "Ignorar" }).first().click();

    const nota = page.locator("textarea").first();
    await expect(nota).toBeVisible();
    // La nota es obligatoria: sin ella queda una fila cerrada que no le explica
    // nada a quien venga después.
    await expect(nota).toHaveAttribute("required", "");
  });
});

test.describe("instalador", () => {
  test.use({ storageState: ACTORS.installer.storageState });

  test("no llega a la cola de revisión", async ({ page }) => {
    // Resolver el backfill es de gerencia: toca datos permanentes de locaciones.
    await page.goto("/locations/review");
    await expect(page).not.toHaveURL(/\/locations\/review$/);
  });
});
