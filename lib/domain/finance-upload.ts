import { z } from "zod";
export const financeMimeTypes=['application/pdf','image/jpeg','image/png','image/webp'] as const;
export const financeUploadSchema=z.object({scope:z.enum(['entry','invoice']),targetId:z.string().uuid().optional(),fileName:z.string().trim().min(1).max(255).refine((s)=>!/[\u0000-\u001f\u007f]/.test(s)),mimeType:z.enum(financeMimeTypes),sizeBytes:z.number().int().min(1).max(10485760)});
export function financeUploadPathMatches(path:string,companyId:string,scope:'entry'|'invoice',targetId:string){
  const parts=path.split('/');return parts.length===3&&parts[0]===companyId&&parts[1]===(scope==='invoice'?'invoices':targetId)&&z.string().uuid().safeParse(parts[2]).success&&(scope!=='invoice'||parts[2]===targetId);
}
