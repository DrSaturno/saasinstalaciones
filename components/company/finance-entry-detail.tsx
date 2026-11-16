"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Check, FileText, Paperclip, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { FinanceConfirmNotice } from "@/components/company/finance-confirm-notice";
import { FinanceHelp, FinanceStageBadge } from "@/components/company/finance-hint";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useFinanceActions, useFinanceDemo } from "@/components/company/finance-action-context";
import { financeRequiresInvoice, financeStage } from "@/lib/domain/finance-approval";
import { financeDisplayDate, financeMoney, type FinanceTableEntry, type FinanceTableDocument } from "@/lib/domain/finance-presentation";

const PROOF_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

/**
 * Panel de un pago o cobro. Sigue el circuito semanal (FLX-30):
 *   en revisión → (aprueba el dueño) → falta factura → listo para pagar → saldado.
 * Muestra la factura del proveedor, bloquea el pago mientras falte y deja
 * cargar nuestro comprobante en el mismo paso en que se registra el pago.
 */
export function FinanceEntryDetail({ entry, files, today, initialTab, onClose, onRestoreFocus }: {
  entry: FinanceTableEntry; files: FinanceTableDocument[]; today: string;
  initialTab: "movement" | "documents"; onClose: () => void; onRestoreFocus: () => void;
}) {
  const t = useTranslations("FinanceOperations"), v2 = useTranslations("FinanceV2"), ux = useTranslations("FinanceUX");
  const flow = useTranslations("FinanceApproval");
  const locale = useLocale();
  const router = useRouter();
  const { changeFinanceEntryStatus, registerFinanceTransaction, uploadFinanceDocument, rejectSupplierInvoice, attachFinanceTransactionProof } = useFinanceActions();
  const demo = useFinanceDemo();
  const [tab, setTab] = useState(initialTab), [pending, start] = useTransition();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()), [uploadId, setUploadId] = useState(() => crypto.randomUUID());
  const [dirty, setDirty] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState("");
  const [discard, setDiscard] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function close() { if (pending) return; if (dirty) setDiscard(true); else onClose(); }

  const available = entry.available_amount ?? entry.open_amount ?? entry.amount;
  const money = (value: number) => financeMoney(value, entry.currency, locale);
  const payable = entry.direction === "payable";
  const invoices = files.filter((file) => file.kind === "invoice");
  const proofKind = payable ? "transfer_proof" : "bank_credit";
  const proofs = files.filter((file) => file.kind === proofKind);
  const hasInvoice = invoices.length > 0;
  const stage = financeStage(entry, hasInvoice);
  const needsInvoice = financeRequiresInvoice(entry.direction, entry.category);
  const fieldTeam = ["installer", "coordinator"].includes(entry.supplierKind ?? "");
  const paid = entry.paid_amount ?? 0;
  // Cobrado por completo pero sin factura emitida: el cobro no se cierra (D5).
  const collectedWithoutInvoice = !payable && entry.status === "approved" && available <= 0 && paid > 0 && !hasInvoice;
  const canRegister = entry.status === "approved" && available > 0 && !receipt && stage === "ready";
  const fileHref = (file: FinanceTableDocument) => file.url ?? `/api/finance/documents/${file.id}`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent
        onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }}
        className="finance-entry-panel top-0 right-0 bottom-0 left-auto flex h-dvh max-w-full translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-[540px]"
        aria-describedby="finance-entry-description"
      >
        <header className="shrink-0 border-b px-6 pt-7 pb-5">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${payable ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>{flow(payable ? "kindPayment" : "kindCollection")}</span>
            {entry.orderNumber ?? v2("generalCosts")}
          </p>
          <DialogTitle className="pr-8 text-xl leading-snug font-semibold tracking-tight">{entry.partyName}</DialogTitle>
          <DialogDescription id="finance-entry-description" className="mt-2 text-xs leading-relaxed">{entry.description || t(`categories.${entry.category}` as "categories.installation")}</DialogDescription>
          <div className="mt-5 rounded-xl border border-[#e3ebf1] bg-[#f6f9fc] p-4">
            <p className="text-xs text-[#6b7f8f]">{v2("currentPending")}</p>
            <p className="mt-1.5 text-[28px] font-semibold tracking-tight tabular-nums">{money(entry.open_amount ?? entry.amount)}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#e0e8ee] pt-3 text-xs text-[#6b7f8f]">
              <span>{flow(entry.status === "review" ? "amountToConfirm" : "approvedAmount")} <strong className="ml-1 font-medium text-[#29495e]">{money(entry.amount)}</strong></span>
              <span>{v2("alreadyRecorded")} <strong className="ml-1 font-medium text-[#29495e]">{money(paid)}</strong></span>
            </div>
          </div>
        </header>
        {discard && <div className="shrink-0 px-6 py-3"><FinanceConfirmNotice message={ux("discardDraft")} confirmLabel={ux("discardChanges")} onCancel={() => setDiscard(false)} onConfirm={onClose} /></div>}
        <div className="flex shrink-0 gap-5 border-b px-6" role="tablist" aria-label={v2("entryDetail")}>
          {(["movement", "documents"] as const).map((value) => (
            <button
              key={value} type="button" id={`finance-tab-${value}`} role="tab" tabIndex={tab === value ? 0 : -1}
              aria-selected={tab === value} aria-controls="finance-entry-tabpanel"
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "movement" : event.key === "End" ? "documents" : tab === "movement" ? "documents" : "movement";
                setTab(next);
                (event.currentTarget.parentElement?.querySelector(`#finance-tab-${next}`) as HTMLButtonElement | null)?.focus();
              }}
              onClick={() => setTab(value)}
              className={`border-b-2 py-3.5 text-sm font-medium ${tab === value ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              {value === "movement" ? v2("entryDetail") : t("documents")}
              {value === "documents" && <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{files.length}</span>}
            </button>
          ))}
        </div>
        <div id="finance-entry-tabpanel" role="tabpanel" aria-labelledby={`finance-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-6">
          <div hidden={tab !== "movement"} className="space-y-6">
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            {receipt && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{receipt}</p>}
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-xs">
              <div><dt className="text-muted-foreground">{t("status")}</dt><dd className="mt-1.5"><FinanceStageBadge stage={stage} direction={entry.direction} /></dd></div>
              <div><dt className="flex items-center gap-1 text-muted-foreground">{flow(payable ? "payDay" : "dueDay")}{payable && entry.zone && <FinanceHelp text={flow("payDayHelp")} />}</dt><dd className="mt-1.5 font-medium">{financeDisplayDate(entry.due_on, locale)}{entry.zone && <span className="ml-2 rounded-md bg-[#eef5fa] px-1.5 py-0.5 text-[11px] text-[#54809b]">{entry.zone === "amba" ? "AMBA" : flow("zones.interior")}</span>}</dd></div>
              {!!entry.reserved_amount && <div className="col-span-2 rounded-lg bg-amber-50 p-3 text-amber-900">{v2("reserved")}: {money(entry.reserved_amount)}</div>}
              {!!entry.credit_amount && <div className="col-span-2 rounded-lg bg-emerald-50 p-3 text-emerald-800">{v2("credit")}: {money(entry.credit_amount)}</div>}
            </dl>
            {entry.order_id && <Link href={`/finance/orders/${entry.order_id}`} className="inline-flex items-center gap-2 text-xs font-medium text-primary">{v2("viewOrder")}<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>}

            {/* Factura del proveedor: siempre a la vista en el detalle del pago (FLX-23/30). */}
            {payable && needsInvoice && entry.status !== "void" && (
              <section className="rounded-xl border border-[#e3ebf1] p-4" aria-labelledby="finance-supplier-invoice">
                <h3 id="finance-supplier-invoice" className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-primary" aria-hidden="true" />{flow("supplierInvoice")}<FinanceHelp text={flow("supplierInvoiceHelp")} /></h3>
                {invoices.length === 0 && <p className="mt-2 text-xs leading-relaxed text-[#718391]">{flow(entry.status === "review" ? "invoiceAfterApproval" : fieldTeam ? "invoicePendingFieldTeam" : "invoicePendingSupplier")}</p>}
                <div className="mt-3 space-y-2">
                  {invoices.map((file) => (
                    <div key={file.id} className="rounded-lg border border-[#e3ebf1] bg-[#f8fafc] p-3">
                      <a href={fileHref(file)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-medium text-[#25465b] hover:text-primary">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-primary"><FileText className="size-4" aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1 truncate">{file.file_name}</span>
                        <span className="text-xs text-primary">{flow("openInvoice")}</span>
                      </a>
                      {file.url?.startsWith("/api/finance/invoices/") && paid === 0 && entry.status === "approved" && (
                        rejecting === file.id ? (
                          <form className="mt-3 space-y-2" onSubmit={(event) => {
                            event.preventDefault();
                            const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
                            start(async () => {
                              const result = await rejectSupplierInvoice(file.id, reason);
                              if (result.error) { toast.error(result.error); return; }
                              toast.success(flow("invoiceReturned")); setRejecting(null); router.refresh();
                            });
                          }}>
                            <label className="block space-y-1.5 text-xs text-[#6b7f8f]">{flow("returnReason")}<input name="reason" required minLength={3} maxLength={300} className="block w-full border" /></label>
                            <div className="flex gap-2"><button type="button" className="finance-button" onClick={() => setRejecting(null)}>{ux("keepEditing")}</button><button disabled={pending} className="finance-button border-red-200 text-red-700">{flow("returnInvoice")}</button></div>
                          </form>
                        ) : <button type="button" className="mt-2 text-xs text-red-700 underline-offset-4 hover:underline" onClick={() => setRejecting(file.id)}>{flow("returnInvoice")}</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {entry.status === "review" && payable && (
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-4">
                <p className="mb-3 flex items-start gap-2 text-sm leading-relaxed text-amber-950"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{flow("needsOwnerApproval")}</p>
                <Link href="/finance/approvals" className="finance-button finance-button-primary">{flow("goToApprovals")}<ArrowUpRight className="size-4" aria-hidden="true" /></Link>
              </div>
            )}
            {entry.status === "review" && !payable && (
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-4">
                <p className="mb-4 text-sm leading-relaxed text-amber-950">{v2("reviewBeforeApproval")}</p>
                <button disabled={pending} className="finance-button finance-button-primary" onClick={() => start(async () => { const result = await changeFinanceEntryStatus(entry.id, "approved"); if (result.error) toast.error(result.error); else toast.success(t("saved")); })}><Check className="size-4" aria-hidden="true" />{t("approve")}</button>
              </div>
            )}
            {stage === "awaitingInvoice" && (
              <p role="status" className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-relaxed text-violet-950">{flow(fieldTeam ? "blockedNoInvoiceFieldTeam" : "blockedNoInvoiceSupplier")}{demo && fieldTeam && <span className="mt-2 block font-medium">{flow("demoInvoiceHint")}</span>}</p>
            )}
            {collectedWithoutInvoice && (
              <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">{flow("collectedWithoutInvoice")} <Link href="/finance/invoices?direction=issued" className="font-medium underline">{flow("registerIssuedInvoice")}</Link></p>
            )}

            {canRegister && (
              <form onChange={() => setDirty(true)} className="space-y-4 border-t border-[#e5ecf1] pt-5" onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget, payload = new FormData(form);
                const proof = payload.get("file");
                payload.delete("file");
                payload.set("entryId", entry.id); payload.set("requestId", requestId);
                setError("");
                start(async () => {
                  try {
                    const result = await registerFinanceTransaction(payload);
                    if (result.error) { setError(result.error); return; }
                    const amount = Number(payload.get("amount"));
                    let message = ux("recorded", { amount: money(amount), party: entry.partyName, balance: money(Math.max(0, (entry.open_amount ?? available) - amount)) });
                    // El comprobante se ata al movimiento recién creado: así nunca queda
                    // «sin comprobante» algo que sí lo tiene (FLX-71).
                    if (proof instanceof File && proof.size > 0) {
                      const attach = new FormData();
                      attach.set("file", proof); attach.set("entryId", entry.id);
                      attach.set("operationId", requestId); attach.set("operationType", "batch");
                      const linked = await attachFinanceTransactionProof(attach);
                      message += " " + flow(linked.error ? "proofNotAttached" : "proofAttached");
                    } else if (!payload.get("proofDocumentId")) {
                      message += " " + flow("proofPending");
                    }
                    setDirty(false); setReceipt(message); setRequestId(crypto.randomUUID()); router.refresh();
                  } catch { setError(ux("retryError")); }
                });
              }}>
                <p className="text-xs leading-relaxed text-muted-foreground">{ux("recordOnly")}</p>
                <h3 className="text-sm font-semibold">{payable ? t("registerPayment") : t("registerCollection")}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <label className="space-y-1.5 text-xs text-[#6b7f8f]">{t("actualDate")}<input name="occurredOn" type="date" defaultValue={today} max={today} required className="block w-full border" /></label>
                  <label className="space-y-1.5 text-xs text-[#6b7f8f]">{t("transactionAmount")}<input name="amount" type="number" min="0.01" max={available} step="0.01" defaultValue={available} required className="block w-full border tabular-nums" /></label>
                  <label className="space-y-1.5 text-xs text-[#6b7f8f]">{t("paymentMethod")}<select name="method" defaultValue="transfer" className="block w-full border">{(["transfer", "cash"] as const).map((method) => <option key={method} value={method}>{t(`paymentMethods.${method}`)}</option>)}</select></label>
                  <label className="space-y-1.5 text-xs text-[#6b7f8f]">{t("paymentReference")}<input name="reference" maxLength={160} className="block w-full border" /></label>
                  <label className="col-span-2 space-y-1.5 text-xs text-[#6b7f8f]">
                    <span className="flex items-center gap-1">{flow(payable ? "paymentProof" : "collectionProof")}<FinanceHelp text={flow("proofHelp")} /></span>
                    <input name="file" type="file" accept={PROOF_ACCEPT} className="block w-full rounded-lg border border-dashed bg-white p-3 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs" />
                  </label>
                  {proofs.length > 0 && (
                    <label className="col-span-2 space-y-1.5 text-xs text-[#6b7f8f]">{flow("orUseUploadedProof")}
                      <select name="proofDocumentId" defaultValue="" className="block w-full border"><option value="">{t("noDocument")}</option>{proofs.map((file) => <option key={file.id} value={file.id}>{file.file_name}</option>)}</select>
                    </label>
                  )}
                </div>
                <button disabled={pending} className="finance-button finance-button-primary w-full">{pending && <span role="status">{ux("saving")} · </span>}{payable ? t("registerPayment") : t("registerCollection")}<ArrowUpRight className="size-4" aria-hidden="true" /></button>
              </form>
            )}
            {!fieldTeam && entry.status !== "void" && available > 0 && stage !== "awaitingInvoice" && <Link href={`/finance/cheques?entry=${entry.id}`} className="finance-button w-full">{v2("newCheque")}</Link>}
          </div>
          <div hidden={tab !== "documents"} className="space-y-6">
            <div className="space-y-2">
              {files.map((file) => (
                <a key={file.id} href={fileHref(file)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-[#e3ebf1] p-3.5 hover:bg-slate-50">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-primary"><FileText className="size-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{t(`documentKinds.${file.kind}` as "documentKinds.invoice")}</p></div>
                  <ArrowUpRight className="size-4 text-slate-400" aria-hidden="true" />
                </a>
              ))}
              {!files.length && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"><Paperclip className="mx-auto mb-2 size-5" aria-hidden="true" />{v2("noFiles")}</div>}
            </div>
            {entry.status !== "void" && (
              <form className="space-y-4 rounded-xl border border-[#e3ebf1] bg-[#f8fafc] p-4" onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget, payload = new FormData(form);
                payload.set("entryId", entry.id); payload.set("requestId", uploadId);
                start(async () => { const result = await uploadFinanceDocument(payload); if (result.error) toast.error(result.error); else { toast.success(t("saved")); form.reset(); setUploadId(crypto.randomUUID()); router.refresh(); } });
              }}>
                <h3 className="text-sm font-semibold">{v2("attachDocument")}</h3>
                <p className="text-xs text-muted-foreground">{ux("attachmentHint")}</p>
                <label className="block space-y-1.5 text-xs text-[#6b7f8f]">{t("documentType")}
                  <select name="kind" defaultValue={entry.status === "settled" || paid > 0 ? proofKind : "invoice"} className="block w-full border">
                    {/* La factura de un instalador o coordinador la carga él mismo desde su perfil (D3). */}
                    {(!fieldTeam || demo) && <option value="invoice">{t("documentKinds.invoice")}</option>}
                    {payable ? <option value="transfer_proof">{t("documentKinds.transfer_proof")}</option> : <><option value="bank_credit">{t("documentKinds.bank_credit")}</option><option value="payment_order">{t("documentKinds.payment_order")}</option></>}
                  </select>
                </label>
                <label className="block space-y-2 text-xs text-[#6b7f8f]">{v2("chooseFile")}<input name="file" type="file" accept={PROOF_ACCEPT} required className="block w-full rounded-lg border border-dashed bg-white p-3 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs" /></label>
                <p className="text-xs text-muted-foreground">{v2("fileFormats")}</p>
                <button disabled={pending} className="finance-button w-full"><Upload className="size-4" aria-hidden="true" />{t("attach")}</button>
              </form>
            )}
          </div>
        </div>
        {["review", "approved"].includes(entry.status) && (
          <footer className="shrink-0 border-t px-6 py-4">
            <button disabled={pending} onClick={() => { if (window.confirm(t("voidConfirm"))) start(async () => { const result = await changeFinanceEntryStatus(entry.id, "void"); if (result.error) toast.error(result.error); else toast.success(t("saved")); }); }} className="text-xs text-red-700 underline-offset-4 hover:underline disabled:opacity-50">{t("void")}</button>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
