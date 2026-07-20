import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Cliente Supabase con service_role — BYPASEA RLS.
 *
 * ⚠️ REGLA NO NEGOCIABLE: este módulo SOLO puede importarse desde
 * `app/api/master/**` (el tablero maestro). Importarlo en cualquier otro
 * lugar es un bug de seguridad crítico. El import "server-only" hace que
 * el build falle si termina en un bundle de cliente.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
