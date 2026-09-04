import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchTwoFactorStatus } from "@/lib/data/two-factor";
import { TotpVerify } from "@/components/security/totp-verify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TwoFactorVerifyPage() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("TwoFactor")]);
  if (!user) redirect("/login");

  const supabase = await createClient();
  const status = await fetchTwoFactorStatus(supabase);
  // Ya subió a AAL2: a su área. Sin factor todavía: primero hay que enrolar.
  if (status.satisfied) redirect(ROLE_HOME[user.role]);
  if (!status.enrolled) redirect("/two-factor/setup");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("verifyTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <TotpVerify redirectTo={ROLE_HOME[user.role]} />
      </CardContent>
    </Card>
  );
}
