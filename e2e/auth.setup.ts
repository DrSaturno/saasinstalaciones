import { test as setup, expect } from "@playwright/test";
import { ACTORS, E2E_PASSWORD, type ActorName } from "./actors";

/**
 * Inicia sesión una vez por actor y guarda la cookie en disco.
 *
 * Cada spec arranca de ese estado en vez de repetir el login: el formulario ya
 * se prueba acá, y repetirlo en cada caso sólo agrega tiempo y un punto de
 * falla compartido.
 */
for (const [name, actor] of Object.entries(ACTORS) as [ActorName, (typeof ACTORS)[ActorName]][]) {
  setup(`autenticar ${name}`, async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill(actor.email);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /ingresar|entrar|iniciar/i }).click();

    // El proxy resuelve el rol y manda a su área: llegar ahí es la señal de
    // que la sesión quedó bien, no que el POST devolvió 200.
    await page.waitForURL(`**${actor.landing}`, { timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`${actor.landing}$`));

    await page.context().storageState({ path: actor.storageState });
  });
}
