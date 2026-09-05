import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { fetchActiveCompanyRoleMemberships } from "@/lib/data/company-membership-roles";
import { rolesByUser } from "@/lib/domain/membership-roles";
import type {
  Database,
  MembershipRole,
  RosterStatus,
  UnavailabilityStatus,
} from "@/types/database";
import { throwIfDataError } from "@/lib/data/errors";

export type RosterMember = {
  installerId: string;
  name: string;
  /** Capacidades independientes: una persona puede tener ambas. */
  roles: MembershipRole[];
  avatarUrl: string | null;
  status: RosterStatus;
  joinedAt: string | null;
  zones: string[];
  ratingAvg: number;
  ratingCount: number;
  openOrders: number;
};

export type PendingInvitation = {
  id: string;
  email: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  role: "installer" | "coordinator";
};

export type CoordinatorOption = { id: string; name: string };

export async function fetchCoordinators(
  supabase: SupabaseClient<Database>,
): Promise<CoordinatorOption[]> {
  const memberships = await fetchActiveCompanyRoleMemberships(
    supabase,
    "coordinator",
  );
  const ids = [...new Set(memberships.map((item) => item.userId))];
  if (!ids.length) return [];

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids)
    .order("full_name");
  throwIfDataError("team.coordinators", error);
  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    name: profile.full_name,
  }));
}

export type UnavailableInstaller = {
  id: string;
  installerId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  status: UnavailabilityStatus;
  reviewNote: string;
};

export async function fetchUnavailableInstallers(
  supabase: SupabaseClient<Database>,
): Promise<UnavailableInstaller[]> {
  const { data: exceptions, error: exceptionsError } = await supabase
    .from("installer_unavailability")
    .select("id, installer_id, starts_at, ends_at, reason, status, review_note")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");
  throwIfDataError("team.unavailability", exceptionsError);
  const ids = [...new Set((exceptions ?? []).map((item) => item.installer_id))];
  if (!ids.length) return [];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  throwIfDataError("team.unavailability_profiles", profilesError);
  const names = new Map((profiles ?? []).map((item) => [item.id, item.full_name]));
  return (exceptions ?? []).map((item) => ({
    id: item.id,
    installerId: item.installer_id,
    name: names.get(item.installer_id) ?? "",
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    reason: item.reason,
    status: item.status,
    reviewNote: item.review_note,
  }));
}

/**
 * Roster de la empresa: miembros (activos y removidos) con su nombre,
 * reputación y cuántas órdenes abiertas tienen asignadas ahora mismo.
 * RLS ya filtra company_installers por tenant.
 */
export async function fetchRoster(
  supabase: SupabaseClient<Database>,
): Promise<RosterMember[]> {
  const t = await getTranslations("DataFallbacks");
  const { data: roster, error: rosterError } = await supabase
    .from("company_installers")
    .select("company_id, installer_id, status, joined_at")
    .order("joined_at", { ascending: false });
  throwIfDataError("team.roster", rosterError);

  if (!roster || roster.length === 0) return [];

  const ids = roster.map((r) => r.installer_id);

  const [profilesResult, installersResult, ordersResult, rolesResult] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_path").in("id", ids),
      supabase
        .from("installers")
        .select("id, zones, rating_avg, rating_count")
        .in("id", ids),
      supabase
        .from("work_orders")
        .select("assigned_installer_id")
        .in("assigned_installer_id", ids)
        .not("status", "in", "(finalizada,cancelada)"),
      supabase
        .from("company_membership_roles")
        .select("user_id, role")
        .in("company_id", [...new Set(roster.map((r) => r.company_id))])
        .in("user_id", ids),
    ]);
  throwIfDataError("team.roster_profiles", profilesResult.error);
  throwIfDataError("team.roster_installers", installersResult.error);
  throwIfDataError("team.roster_orders", ordersResult.error);
  throwIfDataError("team.roster_roles", rolesResult.error);
  const profiles = profilesResult.data;
  const installers = installersResult.data;
  const orders = ordersResult.data;
  const roleRows = rolesResult.data;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const instById = new Map((installers ?? []).map((i) => [i.id, i]));
  const memberRoles = rolesByUser(roleRows ?? []);
  const openCount = new Map<string, number>();
  for (const o of orders ?? []) {
    if (o.assigned_installer_id) {
      openCount.set(
        o.assigned_installer_id,
        (openCount.get(o.assigned_installer_id) ?? 0) + 1,
      );
    }
  }

  return roster.map((r) => {
    const inst = instById.get(r.installer_id);
    const profile = profileById.get(r.installer_id);
    const roles = memberRoles.get(r.installer_id) ?? [];
    return {
      installerId: r.installer_id,
      name: profile?.full_name ?? t("installer"),
      roles,
      avatarUrl: profile?.avatar_path
        ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data
            .publicUrl
        : null,
      status: r.status,
      joinedAt: r.joined_at,
      zones: inst?.zones ?? [],
      ratingAvg: inst?.rating_avg ?? 0,
      ratingCount: inst?.rating_count ?? 0,
      openOrders: openCount.get(r.installer_id) ?? 0,
    };
  });
}

/** Invitaciones pendientes de la empresa (para reenviar link o cancelar). */
export async function fetchPendingInvitations(
  supabase: SupabaseClient<Database>,
): Promise<PendingInvitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, token, created_at, expires_at, status, role")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  throwIfDataError("team.pending_invitations", error);

  const now = Date.now();
  return (data ?? []).map((inv) => ({
    id: inv.id,
    email: inv.email,
    token: inv.token,
    createdAt: inv.created_at,
    expiresAt: inv.expires_at,
    expired: new Date(inv.expires_at).getTime() < now,
    role: inv.role,
  }));
}
