// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor,within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/es.json";
import { buildFinanceDemo } from "@/lib/domain/finance-demo";
import { FinanceOperationsTable } from "@/components/company/finance-operations-table";
import { TooltipProvider } from "@/components/ui/tooltip";

const actions=vi.hoisted(()=>({changeFinanceEntryStatus:vi.fn().mockResolvedValue({error:null}),registerFinanceTransaction:vi.fn().mockResolvedValue({error:null}),uploadFinanceDocument:vi.fn().mockResolvedValue({error:null}),rejectSupplierInvoice:vi.fn().mockResolvedValue({error:null}),attachFinanceTransactionProof:vi.fn().mockResolvedValue({error:null})}));
vi.mock('@/components/company/finance-action-context',()=>({useFinanceActions:()=>actions,useFinanceDemo:()=>false}));
// El detalle refresca la página al terminar; acá no hay router.
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));

afterEach(()=>{cleanup();vi.clearAllMocks();});
const entry={...buildFinanceDemo('2026-10-27',{}).entries[0],amount:1000,open_amount:700,available_amount:500,paid_amount:300,reserved_amount:200};
const invoice={id:'file',entry_id:entry.id,file_name:'factura-ficticia.pdf',kind:'invoice'};
function mount(documents=[invoice]) {return render(<NextIntlClientProvider locale="es-AR" messages={messages}><TooltipProvider><FinanceOperationsTable entries={[entry]} documents={documents} filters={{direction:'payable'}} today="2026-10-27" hideFilters/></TooltipProvider></NextIntlClientProvider>);}

describe('compact obligations and detail panel',()=>{
  it('keeps documents available from the compact row and supports keyboard navigation between panel tabs',async()=>{
    mount();expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:`Documentos de ${entry.partyName}`}));
    const panel=screen.getByRole('dialog');expect(within(panel).getAllByRole('link',{name:/factura-ficticia/})[0].getAttribute('href')).toBe('/api/finance/documents/file');
    const documents=within(panel).getByRole('tab',{name:/Documentos/});fireEvent.keyDown(documents,{key:'ArrowLeft'});
    expect(within(panel).getByRole('tab',{name:'Detalle y movimiento'}).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(within(panel).getByRole('button',{name:'Cerrar'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button',{name:`Documentos de ${entry.partyName}`}));
  });
  it('preserves amount and reference while inspecting documents and prevents accidental draft dismissal',async()=>{
    mount();fireEvent.click(screen.getByRole('button',{name:'Ver detalle'}));
    const panel=screen.getByRole('dialog');
    fireEvent.change(within(panel).getByLabelText('Importe a registrar'),{target:{value:'123.45'}});
    fireEvent.change(within(panel).getByLabelText('Referencia'),{target:{value:'TEST-123'}});
    fireEvent.click(within(panel).getByRole('tab',{name:/Documentos/}));
    fireEvent.click(within(panel).getByRole('tab',{name:'Detalle y movimiento'}));
    expect((within(panel).getByLabelText('Importe a registrar') as HTMLInputElement).value).toBe('123.45');
    expect((within(panel).getByLabelText('Referencia') as HTMLInputElement).value).toBe('TEST-123');
    fireEvent.click(within(panel).getByRole('button',{name:'Cerrar'}));
    expect(within(panel).getByRole('alert').textContent).toContain('registro sin guardar');
    fireEvent.click(within(panel).getByRole('button',{name:'Seguir editando'}));
    expect((within(panel).getByLabelText('Importe a registrar') as HTMLInputElement).value).toBe('123.45');
    fireEvent.click(within(panel).getByRole('button',{name:'Cerrar'}));
    fireEvent.click(within(panel).getByRole('button',{name:'Descartar borrador'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('exports all filtered rows even when the table only displays one page',async()=>{
    const rows=Array.from({length:25},(_,index)=>({...entry,id:`entry-${index}`,orderNumber:`OT-${index}`}));
    let output:Blob|undefined;
    Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn((blob:Blob)=>{output=blob;return 'blob:test';})});
    Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
    render(<NextIntlClientProvider locale="es-AR" messages={messages}><TooltipProvider><FinanceOperationsTable entries={rows.slice(0,20)} exportEntries={rows} documents={[]} filters={{direction:'payable'}} today="2026-10-27" hideFilters/></TooltipProvider></NextIntlClientProvider>);
    fireEvent.click(screen.getByRole('button',{name:'Exportar 25 resultados'}));
    const csv=await new Promise<string>((resolve)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsText(output!);});
    expect(csv.split('\r\n')).toHaveLength(26);expect(csv).toContain('OT-24');
    expect(csv).toContain('"1000","300","700"');click.mockRestore();
  });
  it('submits the selected obligation and available amount through the existing payment action',async()=>{
    mount();fireEvent.click(screen.getByRole('button',{name:'Ver detalle'}));
    const panel=screen.getByRole('dialog'),amount=within(panel).getByLabelText('Importe a registrar') as HTMLInputElement;
    expect(amount.value).toBe('500');expect(amount.max).toBe('500');
    fireEvent.change(amount,{target:{value:'100'}});fireEvent.change(within(panel).getByLabelText('Medio'),{target:{value:'cash'}});
    fireEvent.click(within(panel).getByRole('button',{name:'Registrar pago'}));
    await waitFor(()=>expect(actions.registerFinanceTransaction).toHaveBeenCalledTimes(1));
    const payload=actions.registerFinanceTransaction.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(payload.entries())).toMatchObject({entryId:entry.id,amount:'100',occurredOn:'2026-10-27',method:'cash'});
    expect(String(payload.get('requestId'))).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('sin factura del proveedor no deja registrar el pago y explica por qué',()=>{
    mount([]);
    expect(screen.getByRole('button',{name:'Aprobado · falta factura'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Ver detalle'}));
    const panel=screen.getByRole('dialog');
    expect(within(panel).queryByLabelText('Importe a registrar')).toBeNull();
    expect(within(panel).queryByRole('button',{name:'Registrar pago'})).toBeNull();
    expect(within(panel).getByRole('status').textContent).toContain('falta la factura');
  });
  it('con la factura cargada el pago queda listo y la factura se ve en el detalle',()=>{
    mount();
    expect(screen.getByRole('button',{name:'Listo para pagar'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Ver detalle'}));
    const panel=screen.getByRole('dialog');
    expect(within(panel).getByRole('heading',{name:/Factura del proveedor/})).toBeTruthy();
    expect(within(panel).getByLabelText(/Comprobante de pago/)).toBeTruthy();
  });
  it('abre el detalle directo cuando se llega con el pago elegido desde el Resumen',()=>{
    render(<NextIntlClientProvider locale="es-AR" messages={messages}><TooltipProvider><FinanceOperationsTable entries={[entry]} documents={[invoice]} filters={{direction:'payable'}} today="2026-10-27" hideFilters initialEntryId={entry.id}/></TooltipProvider></NextIntlClientProvider>);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
