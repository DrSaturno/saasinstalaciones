import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import type { Database, RosterStatus } from "@/types/database";

export type RosterMember = {
  installerId: string;
  name: string;
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
};

/**
 * Roster de la empresa: miembros (activos y removidos) con su nombre,
 * reputación y cuántas órdenes abiertas tienen asignadas ahora mismo.
 * RLS ya filtra company_installers por tenant.
 */
export async function fetchRoster(
  supabase: SupabaseClient<Database>,
): Promise<RosterMember[]> {
  const t = await getTranslations("DataFallbacks");
  const { data: roster } = await supabase
    .from("company_installers")
    .select("installer_id, status, joined_at")
    .order("joined_at", { ascending: false });

  if (!roster || roster.length === 0) return [];

  const ids = roster.map((r) => r.installer_id);

  const [{ data: profiles }, { data: installers }, { data: orders }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", ids),
      supabase
        .from("installers")
        .select("id, zones, rating_avg, rating_count")
        .in("id", ids),
      supabase
        .from("work_orders")
        .select("assigned_installer_id")
        .in("assigned_installer_id", ids)
        .not("status", "in", "(finalizada,cancelada)"),
    ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const instById = new Map((installers ?? []).map((i) => [i.id, i]));
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
    return {
      installerId: r.installer_id,
      name: nameById.get(r.installer_id) ?? t("installer"),
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
  const { data } = await supabase
    .from("invitations")
    .select("id, email, token, created_at, expires_at, status")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const now = Date.now();
  return (data ?? []).map((inv) => ({
    id: inv.id,
    email: inv.email,
    token: inv.token,
    createdAt: inv.created_at,
    expiresAt: inv.expires_at,
    expired: new Date(inv.expires_at).getTime() < now,
  }));
}
