import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";
import { SyncIndicator } from "@/components/installer/sync-indicator";
import { ServiceWorkerRegister } from "@/components/installer/service-worker-register";

export default async function InstallerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // El coordinador ES un instalador con un privilegio extra: gestionar las
  // órdenes de su equipo. Usa esta misma área, con una entrada de menú más.
  if (!["installer", "coordinator"].includes(user.role)) {
    redirect(ROLE_HOME[user.role]);
  }
  const t = await getTranslations("Navigation");
  const nav = [
    { href: "/home", label: t("home"), icon: "dashboard" as const },
    { href: "/tasks", label: t("tasks"), icon: "tasks" as const },
    ...(user.role === "coordinator"
      ? [{ href: "/coordination", label: t("coordination"), icon: "orders" as const }]
      : []),
    { href: "/route", label: t("route"), icon: "route" as const },
    { href: "/jobs", label: t("jobs"), icon: "jobs" as const },
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
      <SyncIndicator />
      {children}
    </AppShell>
  );
}
