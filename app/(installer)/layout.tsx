import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getCurrentUser,
  isCoordinatorSomewhere,
  isInstallerArea,
  ROLE_HOME,
} from "@/lib/auth";
import { installerNav } from "@/lib/navigation";
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
  const nav = installerNav(t, { isCoordinator: isCoordinatorSomewhere(user) });

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
