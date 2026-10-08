import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { throwIfDataError } from "@/lib/data/errors";

export type CompanyStaffMember = {
  userId: string;
  fullName: string;
  canManageFinance: boolean;
  canManageSettings: boolean;
};

/**
 * Subcuentas de la empresa (SUBCTA-*), con sus permisos. Sólo el dueño llega a
 * pedir esto: la RLS de `company_staff_permissions` limita el resto a su
 * propia fila (`company_staff_permissions_self_read`), así que para cualquier
 * otra sesión esto vuelve vacío en vez de fallar.
 */
export async function fetchCompanyStaff(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<CompanyStaffMember[]> {
  const { data, error } = await supabase
    .from("company_staff_permissions")
    .select("user_id, can_manage_finance, can_manage_settings, profiles(full_name)")
    .eq("company_id", companyId)
    .overrideTypes<
      {
        user_id: string;
        can_manage_finance: boolean;
        can_manage_settings: boolean;
        profiles: { full_name: string } | { full_name: string }[] | null;
      }[]
    >();
  throwIfDataError("company_staff.list", error);

  // El email vive en `auth.users`, no en `profiles`, y `auth.admin.*` es
  // `service_role` — sólo se puede importar en `app/api/master/**` y en
  // `lib/actions/invite-signup.ts` (regla no negociable de `AGENTS.md`). Esta
  // lista identifica por nombre, como el resto del roster.
  return (data ?? [])
    .map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        userId: row.user_id,
        fullName: profile?.full_name ?? "",
        canManageFinance: row.can_manage_finance,
        canManageSettings: row.can_manage_settings,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
}

export type PendingStaffInvitation = {
  id: string;
  email: string;
  token: string;
  expiresAt: string;
  expired: boolean;
  canManageFinance: boolean;
  canManageSettings: boolean;
};

/** Invitaciones de subcuenta pendientes (sección propia: nunca se mezclan con las de equipo). */
export async function fetchPendingStaffInvitations(
  supabase: SupabaseClient<Database>,
): Promise<PendingStaffInvitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, token, expires_at, staff_can_manage_finance, staff_can_manage_settings")
    .eq("role", "company_staff")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  throwIfDataError("company_staff.pending_invitations", error);

  const now = Date.now();
  return (data ?? []).map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    token: invitation.token,
    expiresAt: invitation.expires_at,
    expired: new Date(invitation.expires_at).getTime() < now,
    canManageFinance: invitation.staff_can_manage_finance,
    canManageSettings: invitation.staff_can_manage_settings,
  }));
}
