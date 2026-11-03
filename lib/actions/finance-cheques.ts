"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";

const money=z.number().positive().max(999999999999.99).refine((value)=>Number.isInteger(value*100)||Math.abs(value*100-Math.round(value*100))<.0001);
const allocation=z.object({entry_id:z.string().uuid(),amount:money});
const cheque=z.object({
  direction:z.enum(['payable','receivable']),party_id:z.string().uuid(),project_id:z.string().uuid().optional(),
  kind:z.enum(['physical','electronic']),reference:z.string().trim().min(1).max(100),bank:z.string().trim().min(1).max(160),
  issued_on:z.iso.date(),maturity_on:z.iso.date(),term_days:z.union([z.literal(30),z.literal(60),z.literal(90),z.literal(120)]).optional(),
  amount:money,currency:z.enum(['ARS','BRL']),allocations:z.array(allocation).min(1).max(100),
  installment:z.enum(['total','partial','advance','balance']).default('partial'),
}).refine((value)=>value.maturity_on>=value.issued_on);

function refreshFinance() {revalidatePath('/finance','layout');}
async function context() {
  const user=await getAuthorizedUser();
  if(!user?.companyId||!user.canManageFinance) return null;
  return {user,db:await createClient()};
}
export async function registerFinanceCheque(id:string,input:unknown) {
  const t=await getTranslations('FinanceV2');const ctx=await context();const data=cheque.safeParse(input);
  if(!ctx||!z.string().uuid().safeParse(id).success) return {error:t('denied')};
  if(!data.success) return {error:t('invalidData')};
  const {error}=await ctx.db.rpc('finance_register_cheque',{p_id:id,p_data:data.data});
  if(error) return {error:t('chequeSaveError')};
  refreshFinance();return {error:null};
}
export async function changeFinanceCheque(id:string,status:string,on:string,note:string) {
  const t=await getTranslations('FinanceV2');const ctx=await context();
  const parsed=z.object({id:z.string().uuid(),status:z.enum(['settled','rejected','cancelled','endorsed']),on:z.iso.date(),note:z.string().trim().max(500)}).safeParse({id,status,on,note});
  if(!ctx) return {error:t('denied')};if(!parsed.success) return {error:t('invalidData')};
  const {error}=await ctx.db.rpc('finance_change_cheque',{p_id:id,p_status:status,p_on:on,p_note:note});
  if(error) return {error:t('chequeChangeError')};
  refreshFinance();return {error:null};
}
export async function registerFinanceBatch(id:string,input:unknown) {
  const t=await getTranslations('FinanceV2');const ctx=await context();
  const parsed=z.object({method:z.enum(['transfer','cash']),occurred_on:z.iso.date(),reference:z.string().trim().max(160),amount:money,
    installment:z.enum(['total','partial','advance','balance']).default('partial'),allocations:z.array(allocation.extend({proof_document_id:z.string().uuid().optional()})).min(1).max(100)}).safeParse(input);
  if(!ctx) return {error:t('denied')};if(!parsed.success||!z.string().uuid().safeParse(id).success) return {error:t('invalidData')};
  const {error}=await ctx.db.rpc('finance_register_payment_batch',{p_id:id,p_data:parsed.data});
  if(error) return {error:t('batchError')};
  refreshFinance();return {error:null};
}
export async function importExistingFinanceOrders() {
  const t=await getTranslations('FinanceV2');const ctx=await context();if(!ctx) return {error:t('denied')};
  const {error}=await ctx.db.rpc('finance_import_existing_orders');
  if(error) return {error:t('syncError')};
  refreshFinance();return {error:null};
}
