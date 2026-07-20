import { redirect } from "next/navigation";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";
import { SyncIndicator } from "@/components/installer/sync-indicator";
import { ServiceWorkerRegister } from "@/components/installer/service-worker-register";

const NAV = [
  { href: "/tasks", label: "Mis tareas" },
  { href: "/jobs", label: "Bolsa de zona" },
  { href: "/profile", label: "Perfil" },
];

export default async function InstallerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "installer") redirect(ROLE_HOME[user.role]);

  return (
    <AppShell area="Instalador" nav={NAV} userName={user.fullName} showNotifications>
      <ServiceWorkerRegister />
      <SyncIndicator />
      {children}
    </AppShell>
  );
}
