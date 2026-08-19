import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * Guardas y constantes compartidas por los casos de uso de proyectos.
 *
 * No lleva `"use server"`: en ese modo cada export tendría que ser una Server
 * Action asíncrona, y acá también viven constantes. Los módulos de caso de uso
 * sí llevan la directiva.
 */

/** Insertar 2000 filas en un solo insert es frágil y lento. */
export const BATCH_SIZE = 500;

/** Toda acción de empresa resuelve company_id desde la sesión, nunca del cliente. */
export async function requireOperator() {
  const user = await getCurrentUser();
  if (
    !user ||
    // Sólo el gerente: los proyectos son gestión de empresa. El coordinador
    // opera únicamente órdenes (lib/actions/orders/).
    user.role !== "company_manager" ||
    !user.companyId
  ) {
    throw new Error("Acceso denegado");
  }
  return {
    supabase: await createClient(),
    companyId: user.companyId,
    userId: user.id,
  };
}
