import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getTranslations } from "next-intl/server";
import { isFinanceDevelopmentRequest } from "@/lib/development/finance-request";
import { FinanceSummaryDocument } from "@/lib/pdf/finance-summary-document";
import { buildFinanceSummaryData } from "@/lib/domain/finance-summary";
import { financePeriodRange } from "@/lib/domain/finance-ledger";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";
export async function GET(request:Request){
  if(!isFinanceDevelopmentRequest(request))return new NextResponse(null,{status:404});
  const t=await getTranslations('FinanceV2');
  const {financeDevelopmentState}=await import('@/lib/development/finance-store');
  const {data}=await financeDevelopmentState();
  const params=new URL(request.url).searchParams;
  if(params.get('summary')==='1'){
    const today=financeBusinessDate(new Date(),'America/Argentina/Buenos_Aires');
    let range:{from:string;to:string};try{range=financePeriodRange(today,'custom',params.get('from')??undefined,params.get('to')??undefined);}catch{return new NextResponse(null,{status:400});}
    const summary=buildFinanceSummaryData({workspace:data,today,...range,company:t('developmentBanner'),locale:'es',labels:{
      title:t('module')+' · '+t('summary'),scope:t('movementDates'),forecastTitle:t('forecastHint'),movementsTitle:t('movements'),empty:t('emptyMovements'),
      realized:t('realized'),planned:t('planned'),outgoing:t('outgoing'),incoming:t('incoming'),chequePending:t('chequePending'),monday:t('monday'),tuesday:t('tuesday'),
    }});
    const pdf=await renderToBuffer(<FinanceSummaryDocument data={summary}/>);
    return new NextResponse(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="finanzas-demo-${range.from}-${range.to}.pdf"`,'Cache-Control':'no-store'}});
  }
  const buffer=await renderToBuffer(<FinanceSummaryDocument data={{title:t('developmentDocument'),company:t('developmentBanner'),period:'',scope:t('balanceScopes'),forecastTitle:t('currentPending'),forecasts:[],movementsTitle:t('movements'),empty:t('emptyMovements'),rows:data.entries.filter((e)=>e.status!=='void').map((e)=>({id:e.id,date:e.due_on??'—',party:e.partyName,state:t(e.direction==='payable'?'outgoing':'incoming'),amount:new Intl.NumberFormat('es-AR',{style:'currency',currency:e.currency}).format(e.open_amount)}))}}/>);
  return new NextResponse(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store'}});
}
