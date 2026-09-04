import { Camera, KeyRound, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/shared/change-password-form";
import { FieldSettingsForm } from "@/components/company/field-settings-form";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const [t, user, supabase] = await Promise.all([
    getTranslations("Settings"),
    getCurrentUser(),
    createClient(),
  ]);
  const { data: company } = await supabase
    .from("companies")
    .select("min_completion_photos")
    .limit(1)
    .maybeSingle();
  const isManager = user?.role === "company_manager";

  return (
    <main className="mx-auto max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>

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
      </div>
    </main>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate ${mono ? "font-mono text-sm" : "text-sm font-medium"}`}>{value}</p>
    </div>
  );
}
