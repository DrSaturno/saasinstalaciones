import { getCurrentUser } from "@/lib/auth";
import { loadFinancePage } from "@/lib/data/finance-page";
import { createClient } from "@/lib/supabase/server";
import { FinanceApprovals } from "@/components/company/finance-approvals";
import { DEFAULT_DIGEST_SETTINGS, type DigestSettings } from "@/components/company/finance-digest-settings";
import { FinanceLoadError } from "@/components/company/finance-load-error";

/** Cómo está configurado hoy el aviso semanal de la empresa (sin fila = valores de fábrica). */
async function loadDigestSettings(companyId: string): Promise<DigestSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("finance_payment_rules")
    .select("digest_enabled,digest_weekday,digest_hour,digest_email")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return DEFAULT_DIGEST_SETTINGS;
  return { enabled: data.digest_enabled, weekday: data.digest_weekday, hour: data.digest_hour, email: data.digest_email ?? "" };
}

/**
 * Aprobación semanal de pagos. La ve cualquiera con acceso a Finanzas; aprobar
 * es sólo del dueño de la empresa (D11) — la base lo vuelve a exigir.
 */
export default async function FinanceApprovalsPage() {
  const [context, user] = await Promise.all([loadFinancePage(), getCurrentUser()]);
  if (!context) return <FinanceLoadError />;
  const isOwner = Boolean(user?.isOwner);
  const settings = user?.companyId ? await loadDigestSettings(user.companyId) : DEFAULT_DIGEST_SETTINGS;
  return (
    <FinanceApprovals
      {...context}
      canApprove={isOwner}
      digest={{ settings, accountEmail: user?.email ?? "", canEdit: isOwner }}
    />
  );
}
