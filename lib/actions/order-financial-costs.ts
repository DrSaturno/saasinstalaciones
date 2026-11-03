"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";
const schema=z.object({id:z.string().uuid().optional(),orderId:z.string().uuid(),payeeId:z.string().uuid(),category:z.enum(['installation','coordination','travel','other']),description:z.string().trim().min(2).max(200),amount:z.coerce.number().min(0).max(999999999999.99),active:z.boolean()});
export async function saveOrderFinancialCost(input:unknown) {
  const t=await getTranslations('FinanceV2');const user=await getAuthorizedUser();const parsed=schema.safeParse(input);
  if(user?.role!=='company_manager'||!user.companyId)return {error:t('denied')};
  if(!parsed.success)return {error:t('invalidData')};
  const db=await createClient(),d=parsed.data;
  const values={company_id:user.companyId,order_id:d.orderId,payee_id:d.payeeId,category:d.category,description:d.description,amount:d.amount,active:d.active,updated_by:user.id};
  const result=d.id?await db.from('order_financial_costs').update(values).eq('company_id',user.companyId).eq('id',d.id).eq('order_id',d.orderId).select('id').single()
    :await db.from('order_financial_costs').insert({...values,created_by:user.id}).select('id').single();
  if(result.error)return {error:t('costError')};
  revalidatePath(`/orders/${d.orderId}`);revalidatePath('/finance','layout');return {error:null};
}
