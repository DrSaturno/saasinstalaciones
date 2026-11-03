import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OrderFinancialCostsEditor } from "@/components/company/order-financial-costs-editor";
export async function OrderFinancialCosts({orderId}:{orderId:string}) {
  const user=await getCurrentUser();if(user?.role!=='company_manager'||!user.companyId)return null;
  const db=await createClient();
  const [costs,roster]=await Promise.all([
    db.from('order_financial_costs').select('*').eq('company_id',user.companyId).eq('order_id',orderId).order('created_at'),
    db.from('company_installers').select('installer_id').eq('company_id',user.companyId).eq('status','active'),
  ]);
  if(costs.error||roster.error)return null;
  const ids=roster.data.map((r)=>r.installer_id);
  const {data:people,error}=ids.length?await db.from('profiles').select('id,full_name').in('id',ids):{data:[],error:null};
  if(error)return null;
  return <OrderFinancialCostsEditor orderId={orderId} costs={costs.data} people={people??[]}/>;
}
