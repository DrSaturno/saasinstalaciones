import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getCurrentUser,
  isCoordinatorSomewhere,
  isInstallerArea,
  ROLE_HOME,
} from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";
import { SyncIndicator } from "@/components/installer/sync-indicator";
import { ServiceWorkerRegister } from "@/components/installer/service-worker-register";

export default async function InstallerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, t] = await Promise.all([
    getCurrentUser(),
    getTranslations("Navigation"),
  ]);
  if (!user) redirect("/login");
  if (!isInstallerArea(user)) {
    redirect(ROLE_HOME[user.role]);
  }
  const nav = [
    { href: "/home", label: t("home"), icon: "dashboard" as const },
    { href: "/tasks", label: t("tasks"), icon: "tasks" as const },
    ...(isCoordinatorSomewhere(user)
      ? [{ href: "/coordination", label: t("coordination"), icon: "orders" as const }]
      : []),
    { href: "/route", label: t("route"), icon: "route" as const },
    { href: "/jobs", label: t("jobs"), icon: "jobs" as const },
    { href: "/earnings", label: t("earnings"), icon: "finance" as const },
    { href: "/messages", label: t("messages"), icon: "messages" as const },
    { href: "/profile", label: t("profile"), icon: "profile" as const },
  ];

  return (
    <AppShell
      area={t("installerArea")}
      nav={nav}
      userName={user.fullName}
      locale={user.locale}
      showNotifications
    >
      <ServiceWorkerRegister userId={user.id} />
      <SyncIndicator userId={user.id} />
      {children}
    </AppShell>
  );
}
