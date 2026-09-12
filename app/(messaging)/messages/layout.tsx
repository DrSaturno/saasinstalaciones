import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getCurrentUser,
  isCoordinatorSomewhere,
  isInstallerArea,
} from "@/lib/auth";
import { companyNav, installerNav, needsLocationReview } from "@/lib/navigation";
import { fetchTwoFactorStatus, twoFactorGate } from "@/lib/data/two-factor";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shared/app-shell";

export default async function MessagingLayout({ children }: { children: React.ReactNode }) {
  const [user, t] = await Promise.all([
    getCurrentUser(),
    getTranslations("Navigation"),
  ]);
  if (!user) redirect("/login");
  const companyMode = user.role === "company_manager";
  if (!companyMode && !isInstallerArea(user)) redirect("/");

  // Mismo gate que `(company)` y `(master)`. Mensajería es una pantalla
  // compartida y se había quedado sin él: quien activó el segundo factor y
  // todavía no lo verificó entraba igual a leer sus conversaciones. Que hoy
  // MFA sea opcional no cambia nada — el que la activó pidió esta protección.
  const supabase = await createClient();
  const twoFactor = twoFactorGate(await fetchTwoFactorStatus(supabase), user.role);
  if (twoFactor) redirect(twoFactor);

  // El mismo menú que en el área de cada uno: entrar por Mensajería no puede
  // cambiar de qué ítems dispone la persona.
  const nav = companyMode
    ? companyNav(t, { needsLocationReview: await needsLocationReview(supabase) })
    : installerNav(t, { isCoordinator: isCoordinatorSomewhere(user) });

  return (
    <AppShell
      area={companyMode ? t("companyArea") : t("installerArea")}
      nav={nav}
      userName={user.fullName}
      locale={user.locale}
      showNotifications
    >
      {children}
    </AppShell>
  );
}
