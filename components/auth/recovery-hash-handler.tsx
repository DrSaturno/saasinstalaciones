"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseAuthHash } from "@/lib/domain/auth-callback";

/**
 * Canjea la sesión de recuperación que Supabase deja en el fragmento de la URL
 * (`#access_token=…&type=recovery`) cuando el mail se mandó desde su panel. El
 * servidor no ve el fragmento, así que esto sólo se puede hacer en el
 * navegador. Va en el layout raíz: el link puede caer en cualquier página.
 *
 * El proxy cubre la otra forma del mismo problema (el código en la query).
 */
export function RecoveryHashHandler() {
  useEffect(() => {
    const parsed = parseAuthHash(window.location.hash);
    if (!parsed) return;

    // Primero sacar los tokens de la barra de direcciones: no tienen que
    // quedar en el historial ni viajar si la persona comparte la URL. Y así el
    // cliente de Supabase no intenta procesarlos por su cuenta.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );

    if (parsed.kind === "error") {
      window.location.replace("/reset-password?error=link");
      return;
    }

    void createClient()
      .auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      })
      .then(({ error }) => {
        // Navegación completa: la página de contraseña lee la sesión en el
        // servidor, desde las cookies que acaba de escribir el cliente.
        window.location.replace(
          error ? "/reset-password?error=link" : "/reset-password",
        );
      });
  }, []);

  return null;
}
