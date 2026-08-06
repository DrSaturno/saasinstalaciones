import { createClient } from "@/lib/supabase/server";
import {
  canOperateCompany,
  getCurrentUser,
  isCoordinatorSomewhere,
  type CurrentUser,
} from "@/lib/auth";

/**
 * Guardas compartidas por los casos de uso de órdenes.
 *
 * No lleva `"use server"`: en ese modo cada export tendría que ser una Server
 * Action asíncrona, y `operatedCompany` es una validación sincrónica. Los
 * módulos de caso de uso sí llevan la directiva y consumen estas guardas.
 */

export async function requireOperator() {
  const [user, supabase] = await Promise.all([
    getCurrentUser(),
    createClient(),
  ]);
  if (
    !user ||
    (user.role !== "company_manager" && !isCoordinatorSomewhere(user))
  ) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase };
}

export function operatedCompany(user: CurrentUser, companyId: string): string {
  if (!canOperateCompany(user, companyId)) {
    throw new Error("Acceso denegado");
  }
  return companyId;
}
