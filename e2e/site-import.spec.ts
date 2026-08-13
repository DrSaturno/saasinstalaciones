import { test, expect } from "@playwright/test";
import XLSX from "xlsx";
import { ACTORS } from "./actors";

/**
 * Importación idempotente y reporte por fila (R2-IMP-03).
 *
 * Lo que se prueba acá es lo que los unitarios no pueden: que confirmar DOS
 * VECES la misma planilla no duplique nada. El dedupe por referencia externa ya
 * existía; lo nuevo es el lote (`import_id`), que es lo que cubre el caso feo —
 * un lote interrumpido a mitad de camino, donde las filas ya creadas no se
 * pueden reconocer solas si no traen código.
 *
 * Cada corrida usa referencias únicas para no chocar con lo que dejó la
 * anterior en staging.
 */

const PROYECTO_SEED = "22222222-2222-2222-2222-222222222222";
const FILAS = 6;

function planilla(prefijo: string): Buffer {
  const filas = [
    ["nombre", "direccion", "ciudad", "provincia", "codigo", "lat", "lng"],
    ...Array.from({ length: FILAS }, (_, i) => [
      `Punto ${prefijo}-${i + 1}`,
      `Av. Test ${100 + i}`,
      "Buenos Aires",
      "AR-BA-AMBA",
      `${prefijo}-${i + 1}`,
      "",
      "",
    ]),
  ];
  return Buffer.from(
    filas.map((f) => f.map((c) => `"${c}"`).join(",")).join("\r\n"),
    "utf8",
  );
}

test.describe("gerente", () => {
  test.use({ storageState: ACTORS.manager.storageState });

  test("importar dos veces la misma planilla no duplica y deja reporte", async ({
    page,
  }) => {
    const prefijo = `E2E${Date.now().toString().slice(-8)}`;
    const archivo = planilla(prefijo);

    const importar = async () => {
      await page.goto(`/projects/${PROYECTO_SEED}`);
      await page.getByRole("button", { name: /Adm\. instalaciones/i }).click();
      await page
        .getByRole("button", { name: /Importar locaciones/i })
        .first()
        .click();
      await page
        .locator('input[type="file"]')
        .setInputFiles({
          name: `${prefijo}.csv`,
          mimeType: "text/csv",
          buffer: archivo,
        });
      // Paso de revisión: el conteo tiene que salir del análisis real.
      const confirmar = page.getByRole("button", { name: /^Importar \d+ locaciones$/ });
      await expect(confirmar).toBeVisible({ timeout: 20_000 });
      const etiqueta = (await confirmar.textContent()) ?? "";
      await confirmar.click();
      // `exact`: el toast dice «6 puntos importados» y el panel sólo «puntos
      // importados». Sin esto el selector agarra los dos.
      await expect(
        page.getByText("puntos importados", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      return Number(etiqueta.match(/\d+/)?.[0] ?? 0);
    };

    // Primera pasada: entran las 6 filas.
    expect(await importar()).toBe(FILAS);

    const reporte = page.getByRole("link", { name: /Descargar reporte/i });
    await expect(reporte).toBeVisible();
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      reporte.click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/^importacion-.+\.xlsx$/);

    const libro = XLSX.readFile((await descarga.path())!);
    const filas = XLSX.utils.sheet_to_json<string[]>(
      libro.Sheets[libro.SheetNames[0]],
      { header: 1, raw: false, defval: "" },
    );
    expect(filas[0]).toEqual(["Fila", "Nombre", "Código", "Resultado", "Motivo"]);
    const importadas = filas.slice(1).filter((f) => f[3] === "Importada");
    expect(importadas).toHaveLength(FILAS);
    // La numeración es la de la planilla: la fila 1 es el encabezado.
    expect(importadas.map((f) => Number(f[0]))).toEqual([2, 3, 4, 5, 6, 7]);

    await page.getByRole("button", { name: /Listo|Cerrar/i }).first().click();

    // Segunda pasada con el MISMO archivo: el análisis ya no ofrece ninguna
    // fila, porque las referencias figuran como cargadas en el proyecto.
    await page.goto(`/projects/${PROYECTO_SEED}`);
    await page.getByRole("button", { name: /Adm\. instalaciones/i }).click();
    await page
      .getByRole("button", { name: /Importar locaciones/i })
      .first()
      .click();
    await page.locator('input[type="file"]').setInputFiles({
      name: `${prefijo}.csv`,
      mimeType: "text/csv",
      buffer: archivo,
    });
    await expect(
      page.getByText("Ninguna fila de la planilla se puede importar."),
    ).toBeVisible({ timeout: 20_000 });
  });

  /**
   * El caso que el dedupe por referencia NO puede cubrir.
   *
   * Sin código externo no hay forma de reconocer que una fila ya se cargó: la
   * única defensa es el lote. Si el `import_id` no existiera, esta segunda
   * confirmación crearía otras 4 locaciones idénticas.
   */
  test("reconfirmar una planilla sin código externo no duplica", async ({
    page,
  }) => {
    const prefijo = `SINCOD${Date.now().toString().slice(-8)}`;
    const filas = [
      ["nombre", "direccion", "ciudad", "provincia"],
      ...Array.from({ length: 4 }, (_, i) => [
        `Sin codigo ${prefijo}-${i + 1}`,
        `Calle ${200 + i}`,
        "Buenos Aires",
        "AR-BA-AMBA",
      ]),
    ];
    const archivo = Buffer.from(
      filas.map((f) => f.map((c) => `"${c}"`).join(",")).join("\r\n"),
      "utf8",
    );

    const confirmar = async () => {
      await page.goto(`/projects/${PROYECTO_SEED}`);
      await page.getByRole("button", { name: /Adm\. instalaciones/i }).click();
      await page
        .getByRole("button", { name: /Importar locaciones/i })
        .first()
        .click();
      await page.locator('input[type="file"]').setInputFiles({
        name: `${prefijo}.csv`,
        mimeType: "text/csv",
        buffer: archivo,
      });
      const boton = page.getByRole("button", {
        name: /^Importar \d+ locaciones$/,
      });
      await expect(boton).toBeVisible({ timeout: 20_000 });
      await boton.click();
      const toast = page.getByText(/^\d+ puntos importados$/);
      await expect(toast).toBeVisible({ timeout: 30_000 });
      return Number((await toast.textContent())?.match(/\d+/)?.[0] ?? "0");
    };

    expect(await confirmar()).toBe(4);
    // Mismo archivo otra vez: el lote ya está cerrado, así que no se vuelve a
    // escribir nada y lo informado es lo que ya había entrado, no 4 nuevos.
    expect(await confirmar()).toBe(4);

    // La prueba de fondo: 4 filas → 4 puntos, no 8. Sin el lote, esta segunda
    // confirmación habría creado otras 4 locaciones idénticas. Se cuenta sobre
    // la exportación real del proyecto, que es la lista completa y paginada.
    const [exportacion] = await Promise.all([
      page.waitForEvent("download"),
      page
        .goto(`/api/projects/${PROYECTO_SEED}/sites/export`)
        .catch(() => undefined),
    ]);
    const libro = XLSX.readFile((await exportacion.path())!);
    const filasExport = XLSX.utils.sheet_to_json<string[]>(
      libro.Sheets[libro.SheetNames[0]],
      { header: 1, raw: false, defval: "" },
    );
    const propias = filasExport.filter((f) =>
      String(f[0] ?? "").includes(prefijo),
    );
    expect(propias).toHaveLength(4);
  });
});
