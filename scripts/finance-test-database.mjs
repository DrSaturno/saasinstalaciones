import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function createFinanceTestDatabase({advanced=false}={}) {
  const db = new PGlite();
  const files = [
    "test/fixtures/finance-base.sql",
    "supabase/migrations/20260924000002_company_staff_accounts.sql",
    "supabase/migrations/20261027084636_finance_operations_foundation.sql",
    "supabase/migrations/20261027084638_finance_cash_foundation.sql",
    "supabase/migrations/20261027084640_finance_module_v2_release.sql",
    "supabase/migrations/20261027084642_finance_operations_integration_release.sql",
  ];
  if(advanced)files.splice(2,0,'test/fixtures/finance-advanced-base.sql');
  for (const file of files) {
    const sql = await readFile(join(process.cwd(),file), "utf8");
    try { await db.exec(sql); }
    catch (error) { await db.close(); throw new Error(`${file}: ${error.message}; position=${error.position}; internal=${error.internalQuery ?? ""}`); }
  }
  return db;
}
