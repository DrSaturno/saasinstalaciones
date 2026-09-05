import { test, expect, type Page } from "@playwright/test";
import { ACTORS } from "./actors";

/**
 * E2E-01 del handoff de UX: continuidad de la orden durante el trabajo de campo.
 *
 * El bug que cierra (UX-001) era éste: apenas el instalador confirmaba que salía
 * o que había llegado, la orden dejaba de contar como trabajo abierto y
 * desaparecía de sus pantallas. Un test que sólo mirara el detalle no lo habría
 * detectado —el detalle siempre responde por URL—, así que después de CADA
 * transición se comprueba que la orden sigue apareciendo en «Mis tareas».
 *
 * Corre en el proyecto `mobile`: es la pantalla real de esta persona.
 *
 * Sobre el estado inicial: el test NO asume que la orden está en `planificada`.
 * Playwright reintenta una vez en CI y las transiciones son persistentes, así
 * que un reintento arrancaría desde donde quedó el intento anterior. Por eso
 * avanza desde el estado en el que la encuentre y sólo afirma sobre los pasos
 * que efectivamente ejecuta.
 */

test.use({ storageState: ACTORS.installer.storageState });

/**
 * Del seed: la sexta orden por nombre de sitio queda `planificada` y asignada a
 * `instalador1@demo.dev`, que es el actor `installer`. Ver `supabase/seed.sql`.
 */
const ORDER_SITE = "Estación 006";

/** Cada paso: el botón que lo dispara y el botón que debe quedar después. */
const STEPS = [
  { action: /voy en camino/i, next: /llegué al sitio/i, state: "en_camino" },
  { action: /llegué al sitio/i, next: /iniciar trabajo/i, state: "en_sitio" },
  { action: /iniciar trabajo/i, next: /marcar terminado/i, state: "en_proceso" },
] as const;

/** Cualquiera de las acciones de campo, para leer en qué paso está la orden. */
const ANY_STEP = /voy en camino|llegué al sitio|iniciar trabajo/i;

async function openOrder(page: Page): Promise<string> {
  await page.goto("/tasks");
  const link = page.locator(`a[href^="/tasks/"]`).filter({ hasText: ORDER_SITE }).first();
  await expect(link, `no se encontró la orden de ${ORDER_SITE} en Mis tareas`).toBeVisible();
  const href = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]+$/);
  return href!;
}

/** La orden tiene que seguir listada, que es exactamente lo que UX-001 rompía. */
async function expectStillListed(page: Page, href: string, afterState: string) {
  await page.goto("/tasks");
  await expect(
    page.locator(`a[href="${href}"]`).first(),
    `la orden desapareció de Mis tareas en estado ${afterState}`,
  ).toBeVisible();
}

test("la orden sigue accesible y avanza de estado durante todo el trabajo", async ({ page }) => {
  const href = await openOrder(page);

  // La orden del seed no tiene `installer_accepted_at`, así que el primer paso
  // es confirmar que se hace cargo. Si un reintento ya la aceptó, no aparece.
  const accept = page.getByRole("button", { name: /^aceptar$/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await expect(accept).toBeHidden({ timeout: 15_000 });
  }

  // Aceptar dispara un `router.refresh()`: la acción de campo aparece recién
  // cuando ese refresh termina. Preguntar por su visibilidad en el instante
  // siguiente al click daba "no hay nada que hacer" y el test se declaraba
  // exitoso sin ejecutar una sola transición — sólo el reintento de CI lo
  // salvaba, porque encontraba la orden ya aceptada. Se espera de verdad.
  await expect(
    page.getByRole("button", { name: ANY_STEP }).first(),
    "tras aceptar la orden no apareció ninguna acción de campo",
  ).toBeVisible({ timeout: 20_000 });

  let advanced = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const current = page.getByRole("button", { name: ANY_STEP }).first();
    if (!(await current.isVisible().catch(() => false))) break;

    const label = ((await current.textContent()) ?? "").trim();
    const step = STEPS.find((candidate) => candidate.action.test(label));
    if (!step) break;

    const button = page.getByRole("button", { name: step.action });
    await button.click();

    // La transición pasa por la cola offline: la UI se mueve de forma optimista
    // y el servidor confirma después. Esperar al botón siguiente cubre las dos.
    await expect(
      page.getByRole("button", { name: step.next }),
      `tras pasar a ${step.state} no apareció la acción siguiente`,
    ).toBeVisible({ timeout: 20_000 });

    advanced++;
    await expectStillListed(page, href, step.state);

    // Volver al detalle y recargar: si el estado sobrevive a un reload, se
    // persistió de verdad y no quedó sólo en el optimismo de la pantalla.
    await page.goto(href);
    await expect(
      page.getByRole("button", { name: step.next }),
      `el estado ${step.state} no sobrevivió a recargar la página`,
    ).toBeVisible({ timeout: 20_000 });
  }

  expect(advanced, "no se pudo ejecutar ninguna transición del flujo de campo").toBeGreaterThan(0);
});
