import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchTwoFactorStatus, twoFactorGate } from "@/lib/data/two-factor";
import { countPendingLocationIssues } from "@/lib/data/location-issues";
import { countUnlinkedSites } from "@/lib/data/canonical-divergence";
import { AppShell } from "@/components/shared/app-shell";
import { ServiceWorkerRegister } from "@/components/installer/service-worker-register";

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Sólo el gerente: el coordinador vive en el área instalador y gestiona las
  // órdenes de su equipo desde /coordination.
  if (user.role !== "company_manager") {
    redirect(ROLE_HOME[user.role]);
  }
  const t = await getTranslations("Navigation");
  // La cola de revisión del backfill es transitoria: sólo se muestra mientras
  // haya filas sin decidir. Un ítem fijo para un artefacto de migración sería
  // ruido permanente en el menú.
  const supabase = await createClient();

  // MFA obligatoria para el gerente (SEC-13): sin AAL2 no entra a su área. El
  // gate manda a enrolar (si no tiene factor) o a verificar (si lo tiene pero
  // no subió de nivel). `/two-factor` está fuera de este layout, así que no
  // hay loop.
  const twoFactor = twoFactorGate(await fetchTwoFactorStatus(supabase), user.role);
  if (twoFactor) redirect(twoFactor);

  const [pendingLocationIssues, unlinkedSites] = await Promise.all([
    countPendingLocationIssues(supabase),
    countUnlinkedSites(supabase),
  ]);
  const needsLocationReview = pendingLocationIssues > 0 || unlinkedSites > 0;
  const nav = [
    { href: "/dashboard", label: t("home"), icon: "dashboard" as const },
    { href: "/projects", label: t("projects"), icon: "projects" as const },
    { href: "/orders", label: t("orders"), icon: "orders" as const },
    { href: "/agenda", label: t("agenda"), icon: "agenda" as const },
    { href: "/clients", label: t("clients"), icon: "clients" as const },
    { href: "/team", label: t("team"), icon: "team" as const },
    { href: "/broadcasts", label: t("broadcasts"), icon: "broadcasts" as const },
    { href: "/messages", label: t("messages"), icon: "messages" as const },
    ...(user.role === "company_manager"
      ? [{ href: "/finance", label: t("finance"), icon: "finance" as const }]
      : []),
    ...(needsLocationReview
      ? [
          {
            href: "/locations/review",
            label: t("locationReview"),
            icon: "orders" as const,
          },
        ]
      : []),
    { href: "/settings", label: t("settings"), icon: "settings" as const },
  ];

  return (
    <AppShell
      area={t("companyArea")}
      nav={nav}
      userName={user.fullName}
      locale={user.locale}
      showNotifications
    >
      <ServiceWorkerRegister userId={user.id} />
      {children}
    </AppShell>
  );
}
