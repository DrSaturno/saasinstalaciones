import { expect, test } from "@playwright/test";
import { ACTORS } from "./actors";

/**
 * Alta manual de una instalación desde el formulario del proyecto.
 *
 * No existía ningún test de este camino, y por ese hueco el alta manual estuvo
 * rota en producción para todas las empresas desde agosto: la base la
 * rechazaba con 42501 (ver `20260921000000_locations_manager_read_inline`) y
 * el gerente sólo veía «No se pudo completar la operación». La importación por
 * planilla sí andaba y sí tenía test, así que nada se puso en rojo.
 *
 * Por eso no alcanza con que aparezca el aviso de éxito: se recarga y se busca
 * el local guardado.
 */

const PROYECTO_SEED = "22222222-2222-2222-2222-222222222222";

test.describe("gerente", () => {
  test.use({ storageState: ACTORS.manager.storageState });

  test("da de alta una instalación a mano y queda guardada", async ({ page }) => {
    // Nombre único por corrida: si el test pasara por encontrar un local de
    // una corrida anterior, no probaría nada.
    const nombre = `Local manual ${Date.now()}`;

    await page.goto(`/projects/${PROYECTO_SEED}`);
    await page.getByRole("button", { name: "Agregar instalación" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Nueva instalación" })).toBeVisible();
    await dialog.getByLabel("Nombre del local", { exact: true }).fill(nombre);
    await dialog.getByLabel("Dirección", { exact: true }).fill("Av. Test 123");
    await dialog.getByRole("button", { name: "Crear instalación" }).click();

    await expect(
      page.getByText("Instalación creada"),
      "el alta manual falló: mirar el aviso en el diálogo de la traza",
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText(nombre).first()).toBeVisible();
  });
});
