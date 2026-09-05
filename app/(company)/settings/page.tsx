import { Camera, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/shared/change-password-form";
import { FieldSettingsForm } from "@/components/company/field-settings-form";
import { TwoFactorSettings } from "@/components/security/two-factor-settings";
import { createClient } from "@/lib/supabase/server";
import { fetchTwoFactorStatus, mfaRequiredFor } from "@/lib/data/two-factor";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const [t, twoFactorT, user, supabase] = await Promise.all([
    getTranslations("Settings"),
    getTranslations("TwoFactor"),
    getCurrentUser(),
    createClient(),
  ]);
  const [{ data: company }, twoFactor] = await Promise.all([
    supabase.from("companies").select("min_completion_photos").limit(1).maybeSingle(),
    fetchTwoFactorStatus(supabase),
  ]);
  const isManager = user?.role === "company_manager";

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mt-8 grid gap-4">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center gap-2">
              <UserRound className="size-4 text-primary" aria-hidden="true" />
              <CardTitle>{t("accountTitle")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label={t("name")} value={user?.fullName ?? "—"} />
            <Field label={t("email")} value={user?.email ?? "—"} mono />
            <Field label={t("role")} value={user ? t(`roles.${user.role}`) : "—"} />
          </CardContent>
        </Card>

        {/* Sólo gerencia: el mínimo de evidencia es política de la empresa,
            no una preferencia de quien coordina un proyecto. La acción lo
            vuelve a comprobar. */}
        {isManager ? (
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center gap-2">
                <Camera className="size-4 text-primary" aria-hidden="true" />
                <CardTitle>{t("fieldTitle")}</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">{t("fieldDescription")}</p>
            </CardHeader>
            <CardContent>
              <FieldSettingsForm minCompletionPhotos={company?.min_completion_photos ?? 3} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              <CardTitle>{t("securityTitle")}</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">{t("securityDescription")}</p>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              <CardTitle>{twoFactorT("settingsTitle")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <TwoFactorSettings
              enrolled={twoFactor.enrolled}
              required={user ? mfaRequiredFor(user.role) : false}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate ${mono ? "font-mono text-sm" : "text-sm font-medium"}`}>{value}</p>
    </div>
  );
}
