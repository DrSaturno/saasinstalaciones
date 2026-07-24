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
  if (user.role !== "installer") redirect(ROLE_HOME[user.role]);
  const t = await getTranslations("Navigation");
  const nav = [
    { href: "/tasks", label: t("tasks"), icon: "tasks" as const },
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
      <ServiceWorkerRegister />
      <SyncIndicator />
      {children}
    </AppShell>
  );
}
