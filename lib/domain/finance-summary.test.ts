import { describe,expect,it } from "vitest";
import type { FinanceWorkspace,WorkspaceEntry } from "@/lib/data/finance-workspace";
import { buildFinanceDemo } from "@/lib/domain/finance-demo";
import { buildFinanceSummaryData,type FinanceSummaryLabels } from "@/lib/domain/finance-summary";

const today='2026-10-27';
const labels:FinanceSummaryLabels={title:'Finanzas',scope:'Fechas',forecastTitle:'Previsión',movementsTitle:'Movimientos',empty:'Sin movimientos',realized:'Realizado',planned:'Previsto',outgoing:'Pagar',incoming:'Cobrar',chequePending:'Cheque pendiente',monday:'Lunes',tuesday:'Martes'};
function workspace():FinanceWorkspace {
  const base=buildFinanceDemo(today,{}).entries[0];
  const entry:WorkspaceEntry={...base,id:'entry',order_id:'order',amount:1000,paid_amount:200,open_amount:800,reserved_amount:300,available_amount:500,credit_amount:0,
    due_on:'2026-10-28',supplierKind:'installer',installerId:null,projectId:null,projectName:null,siteId:null,siteName:null,invoices:[]};
  return {suppliers:[],clients:[],projects:[],orders:[],sites:[],people:[],documents:[],events:[],entries:[entry],
    transactions:[{id:'tx',company_id:base.company_id,entry_id:'entry',amount:200,occurred_on:today,method:'transfer',reference:'Ejemplo',proof_document_id:null,created_by:null,created_at:today,cheque_id:null,batch_id:null,installment:'partial'}],
    cheques:[{id:'check',company_id:base.company_id,direction:'payable',supplier_id:null,client_id:null,project_id:null,kind:'physical',reference:'Cheque ficticio',bank:'Banco ficticio',issued_on:today,maturity_on:'2026-11-26',term_days:30,amount:300,currency:'ARS',status:'pending',settled_on:null,created_by:'user',created_at:today,request_payload:{},installment:'partial'}],
    allocations:[{company_id:base.company_id,cheque_id:'check',entry_id:'entry',amount:300}],
  };
}
describe('financial summary export',()=>{
  it('separates confirmed cash, available debt and pending cheques without counting the reservation twice',()=>{
    const report=buildFinanceSummaryData({workspace:workspace(),today,from:'2026-10-01',to:'2026-12-31',company:'Demo',locale:'es',labels});
    expect(report.rows.map((r)=>[r.id,r.state])).toEqual([
      ['check-entry','Cheque pendiente'],['plan-entry','Previsto · Pagar'],['tx','Realizado · Pagar'],
    ]);
    expect(report.rows.map((r)=>r.amount)).toEqual([300,500,200].map((amount)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(amount)));
    // The weekly funding requirement uses remaining debt, regardless of the report period.
    expect(report.forecasts).toEqual([{label:'Lunes',date:'2026-11-02',amount:new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(800)}]);
  });
  it('uses effective dates for cash and maturity dates for reservations, with inclusive bounds',()=>{
    const report=buildFinanceSummaryData({workspace:workspace(),today,from:today,to:today,company:'Demo',locale:'es',labels});
    expect(report.rows.map((r)=>r.id)).toEqual(['tx']);
    const data=workspace();data.cheques[0].status='settled';
    const settled=buildFinanceSummaryData({workspace:data,today,from:'2026-11-26',to:'2026-11-26',company:'Demo',locale:'es',labels});
    expect(settled.rows).toEqual([]);
  });
});
