begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select has_table('public',name,'tabla financiera: '||name)
from unnest(array['finance_suppliers','finance_payment_rules','finance_entries','finance_documents','finance_entry_events','finance_expense_templates','finance_transactions','finance_invoices','finance_invoice_allocations','finance_cheques','finance_cheque_allocations','finance_cheque_events','finance_payment_batches','order_financial_costs','company_staff_permissions']) name;
select ok((select relrowsecurity from pg_class where oid=('public.'||name)::regclass),'RLS: '||name)
from unnest(array['finance_suppliers','finance_payment_rules','finance_entries','finance_documents','finance_entry_events','finance_expense_templates','finance_transactions','finance_invoices','finance_invoice_allocations','finance_cheques','finance_cheque_allocations','finance_cheque_events','finance_payment_batches','order_financial_costs','company_staff_permissions']) name;
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid=('public.'||name)::regclass),'vista respeta RLS: '||name)
from unnest(array['finance_entry_balances','finance_cash_movements','finance_invoice_differences']) name;
select ok(not has_table_privilege('anon','public.'||name,'SELECT'),'anon no lee: '||name)
from unnest(array['finance_entries','finance_transactions','finance_documents','finance_invoices','finance_cheques','finance_entry_balances','finance_cash_movements']) name;
select ok(not has_table_privilege('authenticated','public.finance_transactions','INSERT'),'caja sólo mediante RPC atómica');
select ok(not has_table_privilege('authenticated','public.finance_invoices','INSERT'),'facturas sólo mediante RPC atómica');
select ok(not has_table_privilege('authenticated','public.finance_cheques','UPDATE'),'estados de cheque sólo mediante RPC');
select ok(not has_function_privilege('authenticated','public.finance_order_source_amount(uuid,uuid)','EXECUTE'),'lector privado no es RPC pública');
select ok(not has_function_privilege('anon','public.finance_register_cheque(uuid,jsonb)','EXECUTE'),'anon no registra cheques');
select has_column('public','finance_invoice_allocations','source_amount_at_registration','facturas conservan referencia de importe');
select has_column('public','finance_transactions','batch_id','transferencias compartidas');
select * from finish();
rollback;
