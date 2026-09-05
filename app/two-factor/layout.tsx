import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/shared/logout-button";

/**
 * Área de verificación en dos pasos. Vive FUERA de los layouts de rol
 * ((company)/(master)) a propósito: esos exigen AAL2, así que enrolar o
 * verificar acá adentro sería un loop. Sólo pide sesión iniciada.
 */
export default async function TwoFactorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, t, navigationT] = await Promise.all([
    getCurrentUser(),
    getTranslations("TwoFactor"),
    getTranslations("Navigation"),
  ]);
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      {children}
      <aside className="mt-4 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("recoveryHint")}
          </p>
          {user.email ? (
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {user.email}
            </p>
          ) : null}
        </div>
        <LogoutButton
          label={navigationT("logout")}
          className="min-h-11 shrink-0"
        />
      </aside>
    </main>
  );
}
