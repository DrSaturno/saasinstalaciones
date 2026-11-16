"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CheckCircle2, Clock3, FileUp, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { prepareSupplierInvoiceUpload, submitSupplierInvoice } from "@/lib/actions/installer-billing";
import { invoiceTotal, supplierInvoiceUploadSchema, type BillingGroup, type BillingItem } from "@/lib/domain/installer-billing";
import { createClient } from "@/lib/supabase/client";

/**
 * «Para facturar» en el perfil del instalador o coordinador (FLX-20/21).
 * Tarjetas, no tabla: se usa desde el teléfono. Elige los trabajos aprobados
 * que cubre su factura, ve el total exacto que tiene que facturar (sin IVA) y
 * sube el archivo. Todo queda en la app, sin mandar nada por fuera.
 */
export function BillingSection({ groups, today }: { groups: BillingGroup[]; today: string }) {
  const t = useTranslations("InstallerBilling");
  if (!groups.some((group) => group.toInvoice.length || group.invoiced.length)) return null;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="billing-title">
      <div>
        <h2 id="billing-title" className="flex items-center gap-2 text-lg font-semibold"><ReceiptText className="size-5 text-primary" aria-hidden="true" />{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {groups.map((group) => (group.toInvoice.length > 0 || group.invoiced.length > 0) && (
        <CompanyBilling key={group.companyId} group={group} today={today} showCompany={groups.length > 1} />
      ))}
    </section>
  );
}

function CompanyBilling({ group, today, showCompany }: { group: BillingGroup; today: string; showCompany: boolean }) {
  const t = useTranslations("InstallerBilling");
  const format = useFormatter();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(group.toInvoice.map((item) => item.entry_id)));
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const money = (value: number, currency: string) => format.number(value, { style: "currency", currency });
  const chosen = group.toInvoice.filter((item) => selected.has(item.entry_id));
  const total = invoiceTotal(chosen);

  function toggle(id: string) {
    setError("");
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function submit(form: HTMLFormElement) {
    const payload = new FormData(form);
    const file = payload.get("file");
    if (!total) { setError(t("errors.pickSameCurrency")); return; }
    if (!(file instanceof File) || !supplierInvoiceUploadSchema.safeParse({ companyId: group.companyId, fileName: file.name, mimeType: file.type, sizeBytes: file.size }).success) {
      setError(t("errors.file")); return;
    }
    // Aviso temprano: la base lo vuelve a exigir, pero acá se entiende mejor.
    if (Math.round(Number(payload.get("amount")) * 100) !== Math.round(total.amount * 100)) {
      setError(t("errors.amountMismatchExact", { amount: money(total.amount, total.currency) })); return;
    }
    setError("");
    start(async () => {
      const prepared = await prepareSupplierInvoiceUpload({ companyId: group.companyId, fileName: file.name, mimeType: file.type, sizeBytes: file.size });
      if (prepared.error || !prepared.upload) { setError(prepared.error ?? t("errors.upload")); return; }
      const { error: uploadError } = await createClient().storage.from("finance-private")
        .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, { contentType: file.type, cacheControl: "0" });
      if (uploadError) { setError(t("errors.upload")); return; }
      const submit = new FormData();
      submit.set("invoiceId", prepared.upload.invoiceId); submit.set("companyId", group.companyId);
      submit.set("invoiceNumber", String(payload.get("invoiceNumber") ?? "")); submit.set("issuedOn", String(payload.get("issuedOn") ?? ""));
      submit.set("amount", String(payload.get("amount") ?? "")); submit.set("fileName", file.name);
      submit.set("entryIds", JSON.stringify(chosen.map((item) => item.entry_id)));
      const result = await submitSupplierInvoice(submit);
      if (result.error) { setError(result.error); return; }
      toast.success(t("sent")); form.reset(); router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5">
      {showCompany && <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.companyName}</p>}

      {group.toInvoice.length > 0 && (
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
          <p className="text-sm font-medium">{t("pickJobs")}</p>
          <ul className="flex flex-col gap-2">
            {group.toInvoice.map((item) => <JobRow key={item.entry_id} item={item} checked={selected.has(item.entry_id)} onToggle={() => toggle(item.entry_id)} money={money} />)}
          </ul>
          <div className="rounded-xl bg-primary-soft/40 p-4">
            <p className="text-xs text-muted-foreground">{t("totalToInvoice", { count: chosen.length })}</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{total ? money(total.amount, total.currency) : "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("withoutTax")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">{t("invoiceNumber")}
              <input name="invoiceNumber" required maxLength={100} placeholder={t("invoiceNumberPlaceholder")} className="min-h-11 rounded-lg border bg-background px-3" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">{t("issuedOn")}
              <input name="issuedOn" type="date" required max={today} defaultValue={today} className="min-h-11 rounded-lg border bg-background px-3" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">{t("invoiceAmount")}
              {/* `key` reinicia el valor cuando cambia la selección: el importe sugerido es siempre el total elegido. */}
              <input key={total?.amount ?? 0} name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" required defaultValue={total?.amount ?? ""} className="min-h-11 rounded-lg border bg-background px-3 font-mono" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">{t("file")}
              <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="min-h-11 rounded-lg border border-dashed bg-background p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5" />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{t("fileFormats")}</p>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <button disabled={pending || chosen.length === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
            <FileUp className="size-4" aria-hidden="true" />{pending ? t("sending") : t("send")}
          </button>
        </form>
      )}

      {group.invoiced.length > 0 && (
        <div className={group.toInvoice.length > 0 ? "mt-5 border-t pt-4" : ""}>
          <p className="flex items-center gap-2 text-sm font-medium"><Clock3 className="size-4 text-primary" aria-hidden="true" />{t("waitingPayment")}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {group.invoiced.map((item) => (
              <li key={item.entry_id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{item.order_number ?? t("noOrder")}</p>
                  <p className="truncate text-sm font-medium">{item.title || item.site_name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />{item.invoice ? t("invoiceSent", { number: item.invoice.number }) : t("noInvoiceNeeded")}</p>
                  {item.due_on && <p className="mt-0.5 text-xs text-muted-foreground">{t("payDay", { date: format.dateTime(new Date(`${item.due_on}T12:00:00Z`), { day: "numeric", month: "long", timeZone: "UTC" }) })}</p>}
                </div>
                <p className="shrink-0 font-mono text-sm font-semibold">{money(item.amount, item.currency)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function JobRow({ item, checked, onToggle, money }: { item: BillingItem; checked: boolean; onToggle: () => void; money: (value: number, currency: string) => string }) {
  const t = useTranslations("InstallerBilling");
  return (
    <li>
      <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-primary bg-primary-soft/30" : ""}`}>
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 size-5 accent-[var(--primary)]" />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs text-muted-foreground">{item.order_number ?? t("noOrder")}</span>
          <span className="block truncate text-sm font-medium">{item.title || item.site_name}</span>
          {item.site_name && item.title && <span className="block truncate text-xs text-muted-foreground">{item.site_name}</span>}
        </span>
        <span className="shrink-0 font-mono text-sm font-semibold">{money(item.amount, item.currency)}</span>
      </label>
    </li>
  );
}
