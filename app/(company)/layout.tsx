import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchTwoFactorStatus, twoFactorGate } from "@/lib/data/two-factor";
import { companyNav, needsLocationReview } from "@/lib/navigation";
import { AppShell } from "@/components/shared/app-shell";
import { ServiceWorkerRegister } from "@/components/installer/service-worker-register";

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Sólo el gerente: el coordinador vive en el área instalador y gestiona las
  // órdenes de su equipo desde /coordination.
  if (user.role !== "company_manager") {
    redirect(ROLE_HOME[user.role]);
  }
  const t = await getTranslations("Navigation");
  const supabase = await createClient();

  // MFA obligatoria para el gerente (SEC-13): sin AAL2 no entra a su área. El
  // gate manda a enrolar (si no tiene factor) o a verificar (si lo tiene pero
  // no subió de nivel). `/two-factor` está fuera de este layout, así que no
  // hay loop.
  const twoFactor = twoFactorGate(await fetchTwoFactorStatus(supabase), user.role);
  if (twoFactor) redirect(twoFactor);

  const nav = companyNav(t, { needsLocationReview: await needsLocationReview(supabase) });

  return (
    <AppShell
      area={t("companyArea")}
      nav={nav}
      userName={user.fullName}
      locale={user.locale}
      showNotifications
    >
      <ServiceWorkerRegister userId={user.id} />
      {children}
    </AppShell>
  );
}
