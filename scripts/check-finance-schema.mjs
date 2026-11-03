import { createFinanceTestDatabase } from "./finance-test-database.mjs";
try {
  const db = await createFinanceTestDatabase();
  console.log("Finance migrations compile in isolated PostgreSQL (PGlite).");
  await db.close();
} catch (error) { console.error(error.message); process.exitCode = 1; }
