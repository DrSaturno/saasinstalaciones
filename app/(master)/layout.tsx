import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchTwoFactorStatus, twoFactorGate } from "@/lib/data/two-factor";
import { AppShell } from "@/components/shared/app-shell";

export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "platform_admin") redirect(ROLE_HOME[user.role]);

  // MFA obligatoria para el admin de plataforma (SEC-13): es la cuenta más
  // crítica (maneja el service_role). Sin AAL2 no entra.
  const supabase = await createClient();
  const twoFactor = twoFactorGate(await fetchTwoFactorStatus(supabase), user.role);
  if (twoFactor) redirect(twoFactor);

  const t = await getTranslations("Navigation");
  const nav = [
    { href: "/master", label: t("overview"), icon: "dashboard" as const },
    { href: "/master/companies", label: t("companies"), icon: "companies" as const },
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
