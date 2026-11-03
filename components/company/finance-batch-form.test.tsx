// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/es.json";
import { buildFinanceDemo } from "@/lib/domain/finance-demo";
import { assembleFinanceWorkspace } from "@/lib/domain/finance-workspace";
import { FinanceBatchForm } from "@/components/company/finance-batch-form";

const actions=vi.hoisted(()=>({registerFinanceBatch:vi.fn().mockResolvedValue({error:null}),uploadFinanceDocument:vi.fn().mockResolvedValue({error:null})}));
vi.mock('@/components/company/finance-action-context',()=>({useFinanceActions:()=>actions}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const base=buildFinanceDemo('2026-10-31',{}).entries[0];
const data=assembleFinanceWorkspace({
  entries:[{...base,id:'one',order_id:null,description:'Trabajo uno',client_id:'client',supplier_id:null,direction:'receivable',amount:500,paid_amount:100,open_amount:400,reserved_amount:50,available_amount:350,credit_amount:0}],
  clients:[{id:'client',name:'Cliente de prueba'},{id:'empty',name:'Sin pendientes'}],suppliers:[],orders:[],projects:[],sites:[],transactions:[],cheques:[],allocations:[],documents:[],invoiceAllocations:[],invoices:[],events:[],people:[],
});
function mount(){render(<NextIntlClientProvider locale="es-AR" messages={messages}><FinanceBatchForm data={data} today="2026-10-31" direction="receivable" embedded/></NextIntlClientProvider>);}

describe('guided batch registration',()=>{
  it('starts with the recipient, explains empty accounts and limits full allocation to available balance',()=>{
    mount();expect(screen.queryByRole('spinbutton')).toBeNull();
    fireEvent.change(screen.getByLabelText(/¿Quién te pagó/),{target:{value:'empty'}});
    expect(screen.getByRole('button',{name:'Confirmar registro'}).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('link',{name:'Pendientes de revisión'})).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/¿Quién te pagó/),{target:{value:'client'}});
    fireEvent.click(screen.getByRole('button',{name:'Aplicar saldo completo'}));
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('350');
    fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'351'}});
    expect(screen.getByRole('button',{name:'Confirmar registro'}).hasAttribute('disabled')).toBe(true);
  });
  it('preserves the draft after a network failure, retries with the same id and shows a receipt after success',async()=>{
    actions.registerFinanceBatch.mockRejectedValueOnce(new Error('network'));
    mount();fireEvent.change(screen.getByLabelText(/¿Quién te pagó/),{target:{value:'client'}});
    fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'120.50'}});
    fireEvent.change(screen.getByLabelText('Número / referencia'),{target:{value:'UX-TEST'}});
    fireEvent.click(screen.getByRole('button',{name:'Confirmar registro'}));
    await screen.findByRole('alert');
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('120.50');
    expect((screen.getByLabelText('Número / referencia') as HTMLInputElement).value).toBe('UX-TEST');
    fireEvent.click(screen.getByRole('button',{name:'Confirmar registro'}));
    await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Cliente de prueba'));
    const [first,retry]=actions.registerFinanceBatch.mock.calls;
    expect(retry[0]).toBe(first[0]);
    expect(retry[1]).toMatchObject({amount:120.5,reference:'UX-TEST',allocations:[{entry_id:'one',amount:120.5}]});
    expect(screen.queryByRole('button',{name:'Confirmar registro'})).toBeNull();
  });
});
