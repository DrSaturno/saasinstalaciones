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

/**
 * La bandeja es una sola pantalla para las dos áreas.
 *
 * Los route groups entre paréntesis NO prefijan la URL, así que
 * `(company)/notifications` y `(installer)/notifications` serían la misma
 * ruta y Next lo rechaza como build error. El patrón que ya resuelve esto
 * en este repo es `(messaging)`: un grupo propio que decide el nav según
 * quién entra. Esto es lo mismo.
 */
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const [user, t] = await Promise.all([
    getCurrentUser(),
    getTranslations("Navigation"),
  ]);
  if (!user) redirect("/login");
  const companyMode = user.role === "company_manager";
  if (!companyMode && !isInstallerArea(user)) redirect("/");

  // Ídem Mensajería: pantalla compartida, mismo gate que el área de cada uno.
  const supabase = await createClient();
  const twoFactor = twoFactorGate(await fetchTwoFactorStatus(supabase), user.role);
  if (twoFactor) redirect(twoFactor);

  // Ídem Mensajería: la bandeja es una pantalla compartida, pero el menú tiene
  // que ser el del área de quien entra.
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
