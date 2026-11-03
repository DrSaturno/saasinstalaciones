import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getTranslations } from "next-intl/server";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";
import { fetchFinanceWorkspace } from "@/lib/data/finance-workspace";
import { financePeriodRange } from "@/lib/domain/finance-ledger";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";
import { countryTimezone } from "@/lib/domain/availability";
import { buildFinanceSummaryData } from "@/lib/domain/finance-summary";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { FinanceSummaryDocument } from "@/lib/pdf/finance-summary-document";
export async function GET(request:Request) {
  const user=await getAuthorizedUser();if(!user?.companyId||!user.canManageFinance)return new NextResponse(null,{status:403});
  const gate=await enforceRateLimit('finance_summary_pdf',user.id,15,3600);
  if(!gate.allowed)return new NextResponse(null,{status:429,headers:{'Retry-After':String(gate.retryAfterSeconds)}});
  const db=await createClient();const {data:company}=await db.from('companies').select('name,country').eq('id',user.companyId).single();
  if(!company)return new NextResponse(null,{status:404});
  const today=financeBusinessDate(new Date(),countryTimezone(company.country));const params=new URL(request.url).searchParams;
  let range:{from:string;to:string};try{range=financePeriodRange(today,'custom',params.get('from')??undefined,params.get('to')??undefined);}catch{return new NextResponse(null,{status:400});}
  let workspace;try{workspace=await fetchFinanceWorkspace(user.companyId);}catch{return new NextResponse(null,{status:503});}
  const t=await getTranslations('FinanceV2');
  const data=buildFinanceSummaryData({workspace,today,...range,company:company.name,locale:user.locale,labels:{
    title:t('module')+' · '+t('summary'),scope:t('movementDates'),forecastTitle:t('forecastHint'),movementsTitle:t('movements'),empty:t('emptyMovements'),
    realized:t('realized'),planned:t('planned'),outgoing:t('outgoing'),incoming:t('incoming'),chequePending:t('chequePending'),monday:t('monday'),tuesday:t('tuesday'),
  }});
  const pdf=await renderToBuffer(<FinanceSummaryDocument data={data}/>);
  return new NextResponse(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="finanzas-${range.from}-${range.to}.pdf"`,'Cache-Control':'private, no-store'}});
}
