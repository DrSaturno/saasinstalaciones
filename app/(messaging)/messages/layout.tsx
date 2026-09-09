import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getCurrentUser,
  isCoordinatorSomewhere,
  isInstallerArea,
} from "@/lib/auth";
import { companyNav, installerNav, needsLocationReview } from "@/lib/navigation";
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

  // El mismo menú que en el área de cada uno: entrar por Mensajería no puede
  // cambiar de qué ítems dispone la persona.
  const nav = companyMode
    ? companyNav(t, { needsLocationReview: await needsLocationReview(await createClient()) })
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
