import { test as setup, expect } from "@playwright/test";
import { ACTORS, E2E_PASSWORD, type ActorName } from "./actors";
import { generateTotp } from "./totp";

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

    // Segundo factor (SEC-13): los roles con MFA obligatoria (admin/gerencia)
    // no pueden entrar sin enrolar. Sobre la base fresca del CI no hay factor,
    // así que el gate manda a /two-factor/setup: se hace el enrolamiento real,
    // leyendo el secreto que genera Supabase y calculando el código con él (en
    // vez de sembrar un secreto propio, que Supabase podría guardar cifrado).
    if (actor.mfa) {
      await page.waitForURL("**/two-factor/setup", { timeout: 30_000 });
      const secretBox = page.locator("code").first();
      await expect(secretBox).toBeVisible({ timeout: 15_000 });
      const secret = ((await secretBox.textContent()) ?? "").trim();
      expect(secret.length).toBeGreaterThan(0);
      await page.locator("#totp-code").fill(generateTotp(secret));
      await page.getByRole("button", { name: /activar/i }).click();
    }

    // El proxy resuelve el rol y manda a su área: llegar ahí es la señal de
    // que la sesión quedó bien, no que el POST devolvió 200.
    await page.waitForURL(`**${actor.landing}`, { timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`${actor.landing}$`));

    await page.context().storageState({ path: actor.storageState });
  });
}
