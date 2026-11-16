"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ChartNoAxesCombined, CheckCheck, CircleHelp, FileSearch, Landmark } from "lucide-react";
import "@/components/company/finance-workspace.css";

export function FinanceNavigation({basePath='/finance',collapsed=false,onNavigate,showOperations=false}:{basePath?:string;collapsed?:boolean;onNavigate?:()=>void;showOperations?:boolean}) {
  const t = useTranslations("FinanceV2");
  const pathname = usePathname();
  const screen=pathname.replace(basePath,'')||'/';
  return <div className="flex-1 overflow-y-auto py-4">
    {showOperations&&<Link href="/dashboard" onClick={onNavigate} title={t('backOperations')} className={`mx-3 mb-5 flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:bg-muted ${collapsed?'lg:justify-center lg:px-0':''}`}><ArrowLeft className="size-4 shrink-0" aria-hidden="true"/><span className={collapsed?'lg:hidden':''}>{t('backOperations')}</span></Link>}
    <p className={`px-6 pb-2 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground ${collapsed?'lg:sr-only':''}`}>{t('module')}</p>
    <nav aria-label={t("module")} className="finance-nav">
    {([['','summary',ChartNoAxesCombined],['/approvals','approvals',CheckCheck],['/payments','payments',ArrowUpRight],['/collections','collections',ArrowDownLeft],['/cheques','cheques',Landmark],['/queries','queries',FileSearch],['/help','help',CircleHelp]] as const).map(([href,label,Icon]) =>{
      const target=basePath+href;
      const active=href?screen===href||screen.startsWith(href+'/')||(href==='/queries'&&screen.startsWith('/orders'))||(href==='/payments'&&['/expenses','/suppliers'].includes(screen))||(href==='/collections'&&screen==='/invoices'):screen==='/'||screen==='/cash'||screen==='/operations';
      return <Link key={href} href={target} onClick={onNavigate} title={t(label)} aria-current={active ? "page" : undefined} className={collapsed?'lg:justify-center lg:px-0':''}>
        <Icon className="size-[18px] shrink-0" strokeWidth={1.7} aria-hidden="true"/><span className={collapsed?'lg:hidden':''}>{t(label)}</span></Link>;
    })}
    </nav>
  </div>;
}
