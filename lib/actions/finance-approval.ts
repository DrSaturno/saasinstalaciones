"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { INTL_LOCALE } from "@/i18n/config";
import { applicationOrigin } from "@/lib/app-origin";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { financeMoney } from "@/lib/domain/finance-presentation";
import { sendFinanceEmail } from "@/lib/email/finance";
import { supplierNoticeEmail } from "@/lib/email/finance-templates";
import { requestPushDelivery } from "@/lib/push/events";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null; approved?: number };

/** Lo que devuelve `finance_approve_payables` por cada proveedor a avisar. */
type ApprovedNotice = {
  entry_id: string;
  installer_id: string;
  email: string | null;
  locale: string;
  name: string | null;
  order_number: string | null;
  amount: number;
  currency: string;
};

const itemsSchema = z.array(z.object({
  entryId: z.string().uuid(),
  // Importe confirmado. Si coincide con el actual no cambia nada; si difiere, la
  // base lo corrige en la OT (D8). Siempre positivo y con dos decimales (D4).
  amount: z.number().positive().max(999999999999.99)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001).optional(),
})).min(1).max(200);

/** Códigos que levanta la base → clave de mensaje. Lo desconocido cae en uno genérico. */
const APPROVAL_ERRORS: Record<string, string> = {
  approval_owner_only: "ownerOnly",
  order_completion_required: "orderNotFinished",
  entry_not_reviewable: "notReviewable",
  amount_locked: "amountLocked",
  amount_change_requires_source: "amountNotEditable",
  amount_source_changed: "amountSourceChanged",
  invalid_amount: "invalidAmount",
};

/**
 * Aprueba en lote los pagos elegidos, con el importe confirmado o corregido.
 * Sólo el dueño de la empresa (D11); la base lo vuelve a exigir.
 * Todo o nada: si un pago no se puede aprobar, no se aprueba ninguno.
 */
export async function approveFinancePayables(input: unknown): Promise<Result> {
  const t = await getTranslations("FinanceApproval.errors");
  const user = await getAuthorizedUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) return { error: t("denied") };
  if (!user.isOwner) return { error: t("ownerOnly") };
  const parsed = itemsSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };
  if (new Set(parsed.data.map((item) => item.entryId)).size !== parsed.data.length) return { error: t("invalidData") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_approve_payables", {
    p_items: parsed.data.map((item) => ({
      entry_id: item.entryId,
      ...(item.amount === undefined ? {} : { amount: Math.round(item.amount * 100) / 100 }),
    })),
  });
  if (error) {
    const code = Object.keys(APPROVAL_ERRORS).find((key) => error.message.includes(key));
    return { error: t((code ? APPROVAL_ERRORS[code] : "save") as "save") };
  }

  // Avisos: la notificación dentro de la app ya la dejó la base. Push y correo
  // son mejora progresiva: si fallan, la aprobación ya está hecha y no se revierte.
  const notices = (Array.isArray(data) ? data : []) as ApprovedNotice[];
  const { data: company } = await supabase.from("companies").select("name").eq("id", user.companyId).maybeSingle();
  let origin: string | null = null;
  try { origin = applicationOrigin(); } catch { origin = null; }
  await Promise.all(notices.map(async (notice) => {
    await requestPushDelivery(supabase, "payment_approved", notice.entry_id, notice.installer_id);
    if (!origin) return;
    const locale = notice.locale === "pt" ? "pt" : "es";
    const copy = await getTranslations({ locale: INTL_LOCALE[locale], namespace: "FinanceEmails.paymentApproved" });
    const amount = financeMoney(Number(notice.amount), notice.currency, locale);
    await sendFinanceEmail({
      to: notice.email,
      event: "payment_approved",
      idempotencyKey: `finance-payment-approved-${notice.entry_id}`,
      email: supplierNoticeEmail({
        locale,
        url: `${origin}/earnings`,
        copy: {
          subject: copy("subject", { amount }),
          eyebrow: company?.name ?? "",
          heading: copy("heading"),
          body: copy(notice.order_number ? "bodyOrder" : "body", { amount, order: notice.order_number ?? "" }),
          cta: copy("cta"),
          footnote: copy("footnote"),
        },
      }),
    });
  }));

  revalidatePath("/finance", "layout");
  return { error: null, approved: parsed.data.length };
}

/**
 * Finanzas devuelve una factura mal cargada por el proveedor. Sólo si todavía
 * no se pagó nada de lo que cubre. El proveedor recibe el motivo y vuelve a
 * ver esos pagos en «Para facturar».
 */
export async function rejectSupplierInvoice(invoiceId: string, reason: string): Promise<Result> {
  const t = await getTranslations("FinanceApproval.errors");
  const user = await getAuthorizedUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) return { error: t("denied") };
  const parsed = z.object({ invoiceId: z.string().uuid(), reason: z.string().trim().min(3).max(300) })
    .safeParse({ invoiceId, reason });
  if (!parsed.success) return { error: t("reasonRequired") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("finance_reject_supplier_invoice", {
    p_invoice: parsed.data.invoiceId, p_reason: parsed.data.reason,
  });
  if (error) return { error: t(error.message.includes("invoice_has_payments") ? "invoiceHasPayments" : "save") };
  revalidatePath("/finance", "layout");
  return { error: null };
}
