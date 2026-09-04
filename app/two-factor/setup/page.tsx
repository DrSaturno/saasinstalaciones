import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchTwoFactorStatus, mfaRequiredFor } from "@/lib/data/two-factor";
import { TotpEnroll } from "@/components/security/totp-enroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TwoFactorSetupPage() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("TwoFactor")]);
  if (!user) redirect("/login");

  const supabase = await createClient();
  const status = await fetchTwoFactorStatus(supabase);
  // Ya cumple: nada que enrolar. Si tiene factor pero falta el código, ese es
  // el paso de verificar, no el de enrolar.
  if (status.satisfied) redirect(ROLE_HOME[user.role]);
  if (status.mustStepUp) redirect("/two-factor/verify");

  const required = mfaRequiredFor(user.role);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("setupTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {required ? t("setupRequiredHint") : t("setupOptionalHint")}
        </p>
      </CardHeader>
      <CardContent>
        <TotpEnroll redirectTo={ROLE_HOME[user.role]} required={required} />
      </CardContent>
    </Card>
  );
}
