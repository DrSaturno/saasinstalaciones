import { redirect } from "next/navigation";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";

const NAV = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/projects", label: "Proyectos" },
  { href: "/orders", label: "Órdenes" },
  { href: "/team", label: "Equipo" },
  { href: "/broadcasts", label: "Bolsa de zona" },
];

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "company_manager") redirect(ROLE_HOME[user.role]);

  return (
    <AppShell area="Empresa" nav={NAV} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
