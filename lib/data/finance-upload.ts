import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { financeMimeTypes,financeUploadPathMatches } from "@/lib/domain/finance-upload";
export async function verifyFinanceUpload(db:SupabaseClient<Database>,companyId:string,path:string,scope:'entry'|'invoice',targetId:string,fileName:string){
  if(!financeUploadPathMatches(path,companyId,scope,targetId)||!fileName||fileName.length>255||/[\u0000-\u001f\u007f]/.test(fileName))return null;
  const {data,error}=await db.storage.from('finance-private').info(path);if(error||!data)return null;
  const parsed=z.object({size:z.number().int().min(1).max(10485760),mime:z.enum(financeMimeTypes)}).safeParse({size:data.size,mime:data.contentType});
  return parsed.success?{name:fileName,size:parsed.data.size,type:parsed.data.mime}:null;
}
