"use client";
import { createClient } from "@/lib/supabase/client";
import { prepareFinanceUpload } from "@/lib/actions/finance-upload";
import { uploadFinanceDocument,registerFinanceInvoice,attachFinanceTransactionProof } from "@/lib/actions/finance-operations";
import { financeUploadSchema } from "@/lib/domain/finance-upload";
async function directUpload(form:FormData,scope:'entry'|'invoice'){
  const file=form.get('file');if(!(file instanceof File))return {error:'invalid_file'};
  const metadata={scope,targetId:scope==='entry'?String(form.get('entryId')??''):undefined,fileName:file.name,mimeType:file.type,sizeBytes:file.size};
  if(!financeUploadSchema.safeParse(metadata).success)return {error:'invalid_file'};
  const prepared=await prepareFinanceUpload(metadata);if(prepared.error||!prepared.upload)return {error:prepared.error??'upload_failed'};
  const db=createClient();const {error}=await db.storage.from('finance-private').uploadToSignedUrl(prepared.upload.path,prepared.upload.token,file,{contentType:file.type,cacheControl:'0'});
  if(error)return {error:'upload_failed'};
  const payload=new FormData();for(const [key,value]of form.entries())if(key!=='file')payload.append(key,value);
  payload.set('uploadedPath',prepared.upload.path);payload.set('fileName',file.name);
  return {error:null,payload};
}
export async function uploadFinanceDocumentClient(form:FormData){const result=await directUpload(form,'entry');return result.error||!result.payload?{error:result.error}:uploadFinanceDocument(result.payload);}
export async function registerFinanceInvoiceClient(form:FormData){const result=await directUpload(form,'invoice');return result.error||!result.payload?{error:result.error}:registerFinanceInvoice(result.payload);}
export async function attachFinanceTransactionProofClient(form:FormData){const result=await directUpload(form,'entry');return result.error||!result.payload?{error:result.error}:attachFinanceTransactionProof(result.payload);}
