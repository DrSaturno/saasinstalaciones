"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, Layers2, Menu, RotateCcw } from "lucide-react";
import { FinanceNavigation } from "@/components/company/finance-navigation";
import { Dialog,DialogContent,DialogTitle } from "@/components/ui/dialog";

export function FinancePreviewShell({children,screen,onReset,onClickCapture}:{children:React.ReactNode;screen:string;onReset:()=>void;onClickCapture:React.MouseEventHandler<HTMLDivElement>}) {
  const t=useTranslations('FinanceV2'),common=useTranslations('Common');
  const [open,setOpen]=useState(false);
  const label=['summary','payments','collections','cheques','queries'].includes(screen)?screen:screen==='cash'?'cashHistory':screen==='expenses'?'fixedTemplates':screen==='invoices'?'manageInvoices':'queryCategories.suppliers';
  return <div className="finance-workspace finance-preview-layout" onClickCapture={onClickCapture}>
    <aside className="finance-preview-sidebar">
      <div className="flex h-[72px] items-center gap-3 border-b border-[#e5ecf1] px-5"><div className="grid size-9 place-items-center rounded-xl bg-primary text-white"><Layers2 className="size-5" aria-hidden="true"/></div><p className="text-[17px] font-bold tracking-tight">{common('brand')}</p></div>
      <FinanceNavigation basePath="/finance-preview"/>
      <div className="mx-4 mb-5 rounded-xl border border-[#e3ebf1] bg-[#f7fafc] p-3.5"><p className="flex items-center gap-2 text-xs font-semibold"><span className="size-1.5 rounded-full bg-emerald-500"/>{t('demoMode')}</p><p className="mt-2 text-xs leading-relaxed text-[#718391]">{t('demoHint')}</p></div>
    </aside>
    <div className="min-w-0"><header className="flex min-h-[72px] items-center justify-between gap-3 border-b border-[#e3eaf0] bg-white px-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3"><button type="button" className="finance-button finance-mobile-menu" aria-label={t('openFinanceMenu')} onClick={()=>setOpen(true)}><Menu className="size-4"/></button><p className="flex min-w-0 items-center gap-2 text-xs text-[#7b8c99]"><span className="hidden sm:inline">{t('module')}</span><ChevronRight className="hidden size-3.5 sm:block" aria-hidden="true"/><span className="truncate font-semibold text-[#284356]">{t(label as 'summary')}</span></p></div>
      <div className="flex shrink-0 items-center gap-4"><span title={t('developmentBanner')} className="hidden items-center gap-1.5 text-xs text-[#718391] sm:flex"><span className="size-1.5 rounded-full bg-amber-400"/>{t('demoMode')}</span><button className="finance-button min-h-9! px-3! text-xs!" onClick={onReset}><RotateCcw className="size-3.5" aria-hidden="true"/>{t('resetDemo')}</button></div>
    </header><div className="finance-preview-content">{children}</div></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="top-0 bottom-0 left-0 flex h-dvh max-w-[280px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-[280px]" aria-describedby={undefined}><DialogTitle className="border-b px-6 py-6">{common('brand')}</DialogTitle><FinanceNavigation basePath="/finance-preview" onNavigate={()=>setOpen(false)}/></DialogContent></Dialog>
  </div>;
}
