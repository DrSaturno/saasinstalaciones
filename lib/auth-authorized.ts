import "server-only";

import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { fetchTwoFactorStatus, twoFactorGate } from "@/lib/data/two-factor";
import { createClient } from "@/lib/supabase/server";

/**
 * Autorización para acciones, incluidas las que no pasan por ningún layout.
 *
 * **Falla CERRADO cuando no se puede determinar el estado del segundo factor.**
 * Es la diferencia deliberada con los layouts de página, que ante lo mismo
 * dejan pasar: una página que se bloquea es un área entera caída y no protege
 * nada —lo que se lee ya está acotado por RLS—, mientras que una acción es una
 * escritura, y una escritura no se ejecuta con el estado de seguridad en duda.
 * El costo de equivocarse es asimétrico, así que la respuesta también.
 *
 * Devuelve `null`, que es como todos los llamadores ya expresan "denegado"
 * (`requireOperator`, `requireInstaller` y las rutas de Calendar lo convierten
 * en su propio error). Antes esto se conseguía dejando propagar una excepción
 * de `fetchTwoFactorStatus`, pero esa misma excepción llegaba a los layouts y
 * les tumbaba la pantalla; ahora el estado viaja como dato y cada capa decide.
 */
export const getAuthorizedUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const twoFactor = await fetchTwoFactorStatus(supabase);
  if (!twoFactor.resolved) return null;
  if (twoFactorGate(twoFactor, user.role)) return null;

  return user;
});
