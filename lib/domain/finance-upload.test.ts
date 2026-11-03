import { describe,it,expect } from "vitest";
import { financeUploadPathMatches,financeUploadSchema } from "@/lib/domain/finance-upload";
const id='00000000-0000-4000-8000-000000000001';
describe('private financial upload boundaries',()=>{
  it('allows PDF and supported images up to 10 MiB and rejects executable/oversized content',()=>{
    const base={scope:'entry',targetId:id,fileName:'recibo.pdf',mimeType:'application/pdf',sizeBytes:10485760};
    expect(financeUploadSchema.safeParse(base).success).toBe(true);
    expect(financeUploadSchema.safeParse({...base,sizeBytes:10485761}).success).toBe(false);
    expect(financeUploadSchema.safeParse({...base,mimeType:'text/html'}).success).toBe(false);
    expect(financeUploadSchema.safeParse({...base,fileName:'recibo\r\nX: injected'}).success).toBe(false);
  });
  it('binds paths to the same company, obligation or invoice',()=>{
    expect(financeUploadPathMatches(`company/${id}/${id}`,'company','entry',id)).toBe(true);
    expect(financeUploadPathMatches(`other/${id}/${id}`,'company','entry',id)).toBe(false);
    expect(financeUploadPathMatches(`company/invoices/${id}`,'company','invoice',id)).toBe(true);
    expect(financeUploadPathMatches(`company/${id}/${id}/extra`,'company','entry',id)).toBe(false);
  });
});
