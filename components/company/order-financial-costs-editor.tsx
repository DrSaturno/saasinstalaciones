"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveOrderFinancialCost } from "@/lib/actions/order-financial-costs";
import type { Database } from "@/types/database";
export function OrderFinancialCostsEditor({orderId,costs,people}:{orderId:string;costs:Database['public']['Tables']['order_financial_costs']['Row'][];people:{id:string;full_name:string}[]}) {
  const t=useTranslations('FinanceV2');const [pending,start]=useTransition();const names=new Map(people.map((p)=>[p.id,p.full_name]));
  return <section className="space-y-4 rounded-xl border bg-white p-4"><header><h2 className="font-semibold">{t('operationalCosts')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('operationalCostsHint')}</p></header>
    <div className="space-y-2">{costs.map((cost)=><form key={cost.id} className="flex flex-wrap items-end gap-2 rounded-lg border p-3" onSubmit={(event)=>{event.preventDefault();const payload=new FormData(event.currentTarget);start(async()=>{const res=await saveOrderFinancialCost({id:cost.id,orderId,payeeId:cost.payee_id,category:cost.category,description:payload.get('description'),amount:payload.get('amount'),active:payload.get('active')==='on'});if(res.error)toast.error(res.error);else toast.success(t('saved'));});}}>
      <p className="min-w-40 flex-1 text-sm">{names.get(cost.payee_id)??t('inactivePerson')}<span className="block text-xs text-muted-foreground">{t(`costCategories.${cost.category}` as 'costCategories.other')}</span></p>
      <label className="text-xs">{t('detail')}<input name="description" defaultValue={cost.description} minLength={2} maxLength={200} required className="mt-1 block rounded border p-2 text-sm"/></label>
      <label className="text-xs">{t('amount')}<input name="amount" type="number" min="0" step="0.01" defaultValue={cost.amount} required className="mt-1 block w-32 rounded border p-2 font-mono text-sm"/></label>
      <label className="p-2 text-xs"><input name="active" type="checkbox" defaultChecked={cost.active} className="mr-1"/>{t('active')}</label><button disabled={pending} className="rounded border p-2 text-xs disabled:opacity-50">{t('save')}</button>
    </form>)}</div>
    <details><summary className="cursor-pointer text-sm font-semibold text-primary">{t('addCost')}</summary><form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget,payload=new FormData(form);start(async()=>{const res=await saveOrderFinancialCost({orderId,payeeId:payload.get('payee'),category:payload.get('category'),description:payload.get('description'),amount:payload.get('amount'),active:true});if(res.error)toast.error(res.error);else{toast.success(t('saved'));form.reset();}});}}>
      <label className="text-xs">{t('person')}<select name="payee" required className="mt-1 block w-full rounded border p-2 text-sm"><option value="">{t('choose')}</option>{people.map((p)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
      <label className="text-xs">{t('category')}<select name="category" className="mt-1 block w-full rounded border p-2 text-sm">{(['installation','coordination','travel','other'] as const).map((c)=><option value={c} key={c}>{t(`costCategories.${c}`)}</option>)}</select></label>
      <label className="text-xs">{t('detail')}<input name="description" required minLength={2} maxLength={200} className="mt-1 block w-full rounded border p-2 text-sm"/></label>
      <label className="text-xs">{t('amount')}<input name="amount" type="number" min="0" step="0.01" required className="mt-1 block w-full rounded border p-2 text-sm"/></label>
      <button disabled={pending} className="rounded-lg bg-primary p-2 text-sm font-semibold text-white disabled:opacity-50">{t('addCost')}</button>
    </form></details>
  </section>;
}
