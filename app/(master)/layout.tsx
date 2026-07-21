import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";

export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "platform_admin") redirect(ROLE_HOME[user.role]);
  const t = await getTranslations("Navigation");
  const nav = [
    { href: "/master", label: t("overview") },
    { href: "/master/companies", label: t("companies") },
  ];

  return (
    <AppShell
      area={t("masterArea")}
      nav={nav}
      userName={user.fullName}
      locale={user.locale}
    >
      {children}
    </AppShell>
  );
}
