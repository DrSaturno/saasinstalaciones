import { test, expect } from "@playwright/test";
import XLSX from "xlsx";
import { ACTORS } from "./actors";
import { SITE_TEMPLATE_HEADERS } from "../lib/domain/site-template";

/**
 * Exportación de locaciones (R2-IMP-04).
 *
 * El contrato es el ida y vuelta, así que lo que se verifica es que el archivo
 * generado tenga exactamente las columnas que la importación espera leer. Los
 * tests unitarios prueban la transformación; esto prueba que el .xlsx real que
 * sale del servidor cumple el contrato.
 */

const PROYECTO_SEED = "22222222-2222-2222-2222-222222222222";

test.describe("gerente", () => {
  test.use({ storageState: ACTORS.manager.storageState });

  test("baja una planilla con las columnas que la importación espera", async ({
    page,
  }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      // `goto` rechaza cuando la navegación termina siendo una descarga.
      page
        .goto(`/api/projects/${PROYECTO_SEED}/sites/export`)
        .catch(() => undefined),
    ]);

    expect(download.suggestedFilename()).toMatch(/^locaciones-.+\.xlsx$/);

    const ruta = await download.path();
    const libro = XLSX.readFile(ruta);
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json<string[]>(hoja, {
      header: 1,
      raw: false,
      defval: "",
    });

    // Sin el "*" que sí lleva la plantilla en blanco: acá no se pide completar
    // nada, y el asterisco volvería pegado al encabezado al reimportar.
    expect(filas[0]).toEqual([...SITE_TEMPLATE_HEADERS]);
    expect(filas.length - 1).toBe(20);
    expect(filas[1][0]).not.toBe("");
  });
});

test.describe("instalador", () => {
  test.use({ storageState: ACTORS.installer.storageState });

  test("no puede bajar las locaciones de un proyecto ajeno", async ({
    request,
  }) => {
    // RLS no le devuelve el proyecto, así que la ruta responde 404 en vez de
    // entregar una planilla con datos de otra empresa.
    const respuesta = await request.get(
      `/api/projects/${PROYECTO_SEED}/sites/export`,
    );
    expect(respuesta.status()).toBe(404);
  });
});
