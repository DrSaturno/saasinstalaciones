import type { Database } from "@/types/database";

export type FinanceTableEntry=Database['public']['Tables']['finance_entries']['Row'] & {
  partyName:string;orderNumber:string|null;paid_amount?:number;open_amount?:number;reserved_amount?:number;
  available_amount?:number;credit_amount?:number;supplierKind?:string|null;
};
export type FinanceTableDocument={id:string;entry_id:string;kind:string;file_name:string;url?:string};
export const financeMoney=(amount:number,currency:string,locale='es')=>new Intl.NumberFormat(locale.startsWith('pt')?'pt-BR':'es-AR',{style:'currency',currency}).format(amount);
export const financeDisplayDate=(date:string|null,locale='es')=>date?new Intl.DateTimeFormat(locale.startsWith('pt')?'pt-BR':'es-AR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`)):'—';
