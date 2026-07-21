import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";
import { ServiceWorkerRegister } from "@/components/installer/service-worker-register";

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "company_manager") redirect(ROLE_HOME[user.role]);
  const t = await getTranslations("Navigation");
  const nav = [
    { href: "/dashboard", label: t("home") },
    { href: "/projects", label: t("projects") },
    { href: "/orders", label: t("orders") },
    { href: "/team", label: t("team") },
    { href: "/broadcasts", label: t("broadcasts") },
  ];

  return (
    <AppShell
      area={t("companyArea")}
      nav={nav}
      userName={user.fullName}
      locale={user.locale}
      showNotifications
    >
      <ServiceWorkerRegister />
      {children}
    </AppShell>
  );
}
