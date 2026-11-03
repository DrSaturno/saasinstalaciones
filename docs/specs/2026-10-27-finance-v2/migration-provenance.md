# Migraciones de Finanzas

Las bases financieras locales no se habían aplicado. Se renumeraron para no colisionar con `20260925000000_work_order_team` y `20260925000001_project_expenses` del trabajo operativo existente.

- `20260925000000_finance_operations.sql` → `20261027084636_finance_operations_foundation.sql`
- `20260925000001_finance_cash_and_expenses.sql` → `20261027084638_finance_cash_foundation.sql`
- `20261027072435_finance_module_v2.sql` → `20261027084640_finance_module_v2_release.sql`
- `20261027075125_finance_operations_integration.sql` → `20261027084642_finance_operations_integration_release.sql`

La migración de subcuentas conserva su versión y contenido del trabajo original. No se modificó ninguna base real.
