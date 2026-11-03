import { notFound,redirect } from "next/navigation";
import { FinanceDevelopmentClient } from "@/components/company/finance-development-client";
export default async function FinancePreviewPage({params,searchParams}:{params:Promise<{screen?:string[]}>;searchParams:Promise<{entry?:string;zone?:string}>}) {
  if(process.env.NODE_ENV!=='development')notFound();
  const [path,query]=await Promise.all([params,searchParams]);
  if(path.screen?.[0]==='orders'&&path.screen[1])redirect(`/finance-preview/queries?${new URLSearchParams({order:path.screen[1]})}`);
  let screen=path.screen?.[0]??'summary';if(screen==='orders')screen='queries';if(screen==='operations')screen='payments';
  if(!['summary','cash','payments','collections','cheques','queries','expenses','invoices','suppliers'].includes(screen))notFound();
  return <FinanceDevelopmentClient screen={screen} entry={query.entry} zone={query.zone} order={path.screen?.[0]==='orders'?path.screen?.[1]:undefined}/>;
}
