import type { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countUnlinkedSites } from "@/lib/data/canonical-divergence";
import { countPendingLocationIssues } from "@/lib/data/location-issues";
import type { Database } from "@/types/database";
import type { NavItem } from "@/types/navigation";

type NavTranslations = Awaited<ReturnType<typeof getTranslations<"Navigation">>>;

/**
 * El menú lateral, en un solo lugar.
 *
 * Vivía copiado a mano en cuatro layouts —`(company)`, `(installer)`,
 * `(messaging)` y `(inbox)`— y las copias se desincronizaron: entrando por
 * Mensajería el gerente perdía Agenda, Revisar locaciones y Configuración, y
 * el instalador perdía Agenda y Ganancias. El menú cambiaba según por dónde
 * hubieras entrado, que es exactamente lo que un menú no puede hacer.
 *
 * Los grupos de rutas entre paréntesis no comparten layout, así que la única
 * forma de que las cuatro áreas muestren lo mismo es que lean de acá.
 */
export function companyNav(
  t: NavTranslations,
  { needsLocationReview }: { needsLocationReview: boolean },
): NavItem[] {
  return [
    { href: "/dashboard", label: t("home"), icon: "dashboard" },
    { href: "/projects", label: t("projects"), icon: "projects" },
    { href: "/orders", label: t("orders"), icon: "orders" },
    { href: "/agenda", label: t("agenda"), icon: "agenda" },
    { href: "/clients", label: t("clients"), icon: "clients" },
    { href: "/team", label: t("team"), icon: "team" },
    { href: "/broadcasts", label: t("broadcasts"), icon: "broadcasts" },
    { href: "/messages", label: t("messages"), icon: "messages" },
    { href: "/finance", label: t("finance"), icon: "finance" },
    // La cola de revisión del backfill es transitoria: sólo se muestra
    // mientras haya filas sin decidir. Un ítem fijo para un artefacto de
    // migración sería ruido permanente en el menú.
    ...(needsLocationReview
      ? [{ href: "/locations/review", label: t("locationReview"), icon: "orders" as const }]
      : []),
    { href: "/settings", label: t("settings"), icon: "settings" },
  ];
}

export function installerNav(
  t: NavTranslations,
  { isCoordinator }: { isCoordinator: boolean },
): NavItem[] {
  return [
    { href: "/home", label: t("home"), icon: "dashboard" },
    { href: "/tasks", label: t("tasks"), icon: "tasks" },
    { href: "/schedule", label: t("agenda"), icon: "agenda" },
    ...(isCoordinator
      ? [{ href: "/coordination", label: t("coordination"), icon: "orders" as const }]
      : []),
    { href: "/route", label: t("route"), icon: "route" },
    { href: "/jobs", label: t("jobs"), icon: "jobs" },
    { href: "/earnings", label: t("earnings"), icon: "finance" },
    { href: "/messages", label: t("messages"), icon: "messages" },
    { href: "/profile", label: t("profile"), icon: "profile" },
  ];
}

/** Si queda algo sin decidir del backfill de locaciones. */
export async function needsLocationReview(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const [pendingIssues, unlinkedSites] = await Promise.all([
    countPendingLocationIssues(supabase),
    countUnlinkedSites(supabase),
  ]);
  return pendingIssues > 0 || unlinkedSites > 0;
}
