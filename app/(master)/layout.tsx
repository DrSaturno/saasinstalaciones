import { redirect } from "next/navigation";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";

const NAV = [
  { href: "/master", label: "Resumen" },
  { href: "/master/companies", label: "Empresas" },
  { href: "/master/installers", label: "Instaladores" },
];

export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "platform_admin") redirect(ROLE_HOME[user.role]);

  return (
    <AppShell area="Tablero maestro" nav={NAV} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
