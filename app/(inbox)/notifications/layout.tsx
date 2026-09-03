import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getCurrentUser,
  isCoordinatorSomewhere,
  isInstallerArea,
} from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";

/**
 * La bandeja es una sola pantalla para las dos áreas.
 *
 * Los route groups entre paréntesis NO prefijan la URL, así que
 * `(company)/notifications` y `(installer)/notifications` serían la misma
 * ruta y Next lo rechaza como build error. El patrón que ya resuelve esto
 * en este repo es `(messaging)`: un grupo propio que decide el nav según
 * quién entra. Esto es lo mismo.
 */
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const [user, t] = await Promise.all([
    getCurrentUser(),
    getTranslations("Navigation"),
  ]);
  if (!user) redirect("/login");
  const companyMode = user.role === "company_manager";
  if (!companyMode && !isInstallerArea(user)) redirect("/");

  const companyNav = [
    { href: "/dashboard", label: t("home"), icon: "dashboard" as const },
    { href: "/projects", label: t("projects"), icon: "projects" as const },
    { href: "/orders", label: t("orders"), icon: "orders" as const },
    { href: "/agenda", label: t("agenda"), icon: "agenda" as const },
    { href: "/clients", label: t("clients"), icon: "clients" as const },
    { href: "/team", label: t("team"), icon: "team" as const },
    { href: "/broadcasts", label: t("broadcasts"), icon: "broadcasts" as const },
    { href: "/messages", label: t("messages"), icon: "messages" as const },
    { href: "/finance", label: t("finance"), icon: "finance" as const },
  ];
  const installerNav = [
    { href: "/home", label: t("home"), icon: "dashboard" as const },
    { href: "/tasks", label: t("tasks"), icon: "tasks" as const },
    { href: "/schedule", label: t("agenda"), icon: "agenda" as const },
    ...(isCoordinatorSomewhere(user)
      ? [{ href: "/coordination", label: t("coordination"), icon: "orders" as const }]
      : []),
    { href: "/route", label: t("route"), icon: "route" as const },
    { href: "/jobs", label: t("jobs"), icon: "jobs" as const },
    { href: "/messages", label: t("messages"), icon: "messages" as const },
    { href: "/profile", label: t("profile"), icon: "profile" as const },
  ];

  return (
    <AppShell
      area={companyMode ? t("companyArea") : t("installerArea")}
      nav={companyMode ? companyNav : installerNav}
      userName={user.fullName}
      locale={user.locale}
      showNotifications
    >
      {children}
    </AppShell>
  );
}
