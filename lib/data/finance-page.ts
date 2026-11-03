import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countryTimezone } from "@/lib/domain/availability";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";
import { fetchFinanceWorkspace } from "@/lib/data/finance-workspace";

export async function loadFinancePage() {
  const user=await getCurrentUser();
  if(!user?.companyId||!user.canManageFinance) redirect('/dashboard');
  const db=await createClient();
  const {data:company,error}=await db.from('companies').select('country').eq('id',user.companyId).single();
  if(error||!company) return null;
  try {return {data:await fetchFinanceWorkspace(user.companyId),today:financeBusinessDate(new Date(),countryTimezone(company.country))};}
  catch {return null;}
}
