"use server";
import { getTranslations } from "next-intl/server";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";
import { financeUploadSchema } from "@/lib/domain/finance-upload";
export async function prepareFinanceUpload(input:unknown){
  const t=await getTranslations('FinanceOperations.errors');const user=await getAuthorizedUser();
  if(!user?.companyId||!user.canManageFinance)return {error:t('denied')};
  const parsed=financeUploadSchema.safeParse(input);if(!parsed.success)return {error:t('fileData')};
  const data=parsed.data,db=await createClient();
  if(data.scope==='entry'){
    const {data:entry}=await db.from('finance_entries').select('id').eq('id',data.targetId??'').eq('company_id',user.companyId).neq('status','void').maybeSingle();
    if(!entry)return {error:t('entryMissing')};
  }
  const targetId=data.scope==='invoice'?crypto.randomUUID():data.targetId!;
  const path=`${user.companyId}/${data.scope==='invoice'?'invoices':targetId}/${data.scope==='invoice'?targetId:crypto.randomUUID()}`;
  const {data:upload,error}=await db.storage.from('finance-private').createSignedUploadUrl(path,{upsert:false});
  if(error||!upload)return {error:t('upload')};
  return {error:null,upload:{path,token:upload.token,targetId}};
}
