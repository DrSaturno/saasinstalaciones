"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";

import { useFinanceQuery } from "@/lib/client/use-finance-query";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";


type AvailableEntry = {
  id: string; partyId: string; direction: "issued" | "received";
  label: string; capacity: number; currency: string;
};

export function FinanceInvoiceForm({
  entries, clients, suppliers,
}: {
  entries: AvailableEntry[];
  clients: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const {registerFinanceInvoice}=useFinanceActions();
  const t = useTranslations("FinanceOperations");
  const {params}=useFinanceQuery();
  const [direction, setDirection] = useState<"issued" | "received">(params.get("direction")==="issued"?"issued":"received");
  const [partyId, setPartyId] = useState(params.get("party")??"");
  const [currency, setCurrency] = useState("ARS");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const available = entries.filter((entry) => entry.direction === direction &&
    entry.partyId === partyId && entry.currency === currency && entry.capacity > 0);
  const allocations = available.filter((entry) => selected[entry.id] !== undefined)
    .map((entry) => ({ entry_id: entry.id, amount: Number(selected[entry.id]) }));
  const total = allocations.reduce((sum, entry) => sum + (Number.isFinite(entry.amount) ? entry.amount : 0), 0);
  return <form className="space-y-4 rounded-xl border bg-white p-5" onSubmit={(event) => {
    event.preventDefault();
    if (!allocations.length || allocations.some((row) => row.amount <= 0)) {
      toast.error(t("errors.invoiceData")); return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("allocations", JSON.stringify(allocations));
    startTransition(async () => {
      const result = await registerFinanceInvoice(data);
      if (result.error) toast.error(result.error);
      else { toast.success(t("saved")); form.reset(); setSelected({}); setPartyId(""); }
    });
  }}>
    <h2 className="font-semibold">{t("registerInvoice")}</h2>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">{t("invoiceDirection")}
        <select name="direction" value={direction} onChange={(event) => {
          setDirection(event.target.value as "issued" | "received"); setPartyId(""); setSelected({});
        }} className="mt-1 w-full rounded-md border p-2"><option value="received">{t("receivedInvoice")}</option><option value="issued">{t("issuedInvoice")}</option></select>
      </label>
      <label className="text-sm">{direction === "issued" ? t("client") : t("supplier")}
        <select name="partyId" value={partyId} onChange={(event) => { setPartyId(event.target.value); setSelected({}); }} required className="mt-1 w-full rounded-md border p-2">
          <option value="" disabled>{t("choose")}</option>
          {(direction === "issued" ? clients : suppliers).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
        </select>
      </label>
      <label className="text-sm">{t("invoiceNumber")}
        <input name="invoiceNumber" maxLength={100} required className="mt-1 w-full rounded-md border p-2" />
      </label>
      <label className="text-sm">{t("currency")}
        <select name="currency" value={currency} onChange={(event) => { setCurrency(event.target.value); setSelected({}); }} className="mt-1 w-full rounded-md border p-2"><option>ARS</option><option>BRL</option></select>
      </label>
      <label className="text-sm">{t("issuedOn")}
        <input name="issuedOn" type="date" required className="mt-1 w-full rounded-md border p-2" />
      </label>
      <label className="text-sm">{t("dueOn")}
        <input name="dueOn" type="date" className="mt-1 w-full rounded-md border p-2" />
      </label>
      <label className="text-sm sm:col-span-2">{t("invoiceFile")}
        <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="mt-1 w-full rounded-md border p-2" />
      </label>
    </div>
    <div><h3 className="text-sm font-semibold">{t("allocateInvoice")}</h3>
      <p className="text-xs text-muted-foreground">{t("allocateInvoiceHint")}</p>
      <div className="mt-2 divide-y rounded-lg border">{available.map((entry) =>
        <div key={entry.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
          <label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={selected[entry.id] !== undefined} onChange={(event) => setSelected((current) => {
            const next = { ...current }; if (event.target.checked) next[entry.id] = entry.capacity.toFixed(2); else delete next[entry.id]; return next;
          })} />{entry.label}</label>
          <span className="text-muted-foreground">{t("unallocated")}: {entry.capacity.toFixed(2)}</span>
          {selected[entry.id] !== undefined && <input aria-label={t("allocatedAmount")} type="number" min="0.01" max={entry.capacity} step="0.01" value={selected[entry.id]} onChange={(event) => setSelected((current) => ({ ...current, [entry.id]: event.target.value }))} className="w-32 rounded-md border p-2" />}
        </div>)}
        {available.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t("noAllocatableEntries")}</p>}</div>
    </div>
    <div className="flex flex-wrap items-center gap-4"><p className="font-mono font-semibold">{t("amount")}: {new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(total)}</p>
      <button disabled={pending || !allocations.length} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("registerInvoice")}</button></div>
  </form>;
}
