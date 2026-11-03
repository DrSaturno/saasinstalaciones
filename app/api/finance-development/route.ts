import { NextResponse } from "next/server";
import { isFinanceDevelopmentRequest } from "@/lib/development/finance-request";
export async function GET(request:Request){
  if(!isFinanceDevelopmentRequest(request))return new NextResponse(null,{status:404});
  const {financeDevelopmentState}=await import('@/lib/development/finance-store');
  return NextResponse.json(await financeDevelopmentState(),{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  if(!isFinanceDevelopmentRequest(request))return new NextResponse(null,{status:404});
  try{
    const {operation,args}=await request.json() as {operation:string;args:unknown[]};
    if(!Array.isArray(args))return new NextResponse(null,{status:400});
    const store=await import('@/lib/development/finance-store');
    if(operation==='reset'){await store.resetFinanceDevelopment();return NextResponse.json({error:null,...await store.financeDevelopmentState()});}
    return NextResponse.json({error:null,...await store.mutateFinanceDevelopment(operation,args)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'development_error'},{status:400});}
}
