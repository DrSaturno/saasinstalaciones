import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getCurrentUser,
  isCoordinatorSomewhere,
  isInstallerArea,
} from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";

export default async function MessagingLayout({ children }: { children: React.ReactNode }) {
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
    { href: "/clients", label: t("clients"), icon: "clients" as const },
    { href: "/team", label: t("team"), icon: "team" as const },
    { href: "/broadcasts", label: t("broadcasts"), icon: "broadcasts" as const },
    { href: "/messages", label: t("messages"), icon: "messages" as const },
    { href: "/finance", label: t("finance"), icon: "finance" as const },
  ];
  const installerNav = [
    { href: "/home", label: t("home"), icon: "dashboard" as const },
    { href: "/tasks", label: t("tasks"), icon: "tasks" as const },
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
