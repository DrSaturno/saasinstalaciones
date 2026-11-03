#!/usr/bin/env node
/**
 * Paso de post-generación para `types/database.ts`.
 *
 * Postgres no expone los CHECK de texto como enums, así que
 * `supabase gen types` emite `status: string` para columnas que en realidad
 * sólo aceptan un conjunto cerrado de valores. Sin estrecharlas, el compilador
 * deja pasar `status: "finalizadaa"` y los `Record<OrderStatus, ...>` de la UI
 * se rompen en runtime en vez de en el build.
 *
 * Este script vuelve a aplicar ese estrechamiento sobre el archivo generado.
 * Es idempotente: correrlo dos veces no cambia nada.
 *
 * Uso (después de CADA regeneración de tipos):
 *   supabase gen types typescript --linked > types/database.ts
 *   node scripts/narrow-database-types.mjs
 *
 * Al agregar una columna con CHECK cerrado, sumar acá su alias y declararlo en
 * el bloque de alias de `types/database.ts`.
 */

import fs from "node:fs";
import path from "node:path";

const TARGET = path.join(process.cwd(), "types", "database.ts");

/** tabla → columna → alias declarado en types/database.ts */
const NARROWING = {
  companies: { country: "Country", status: "CompanyStatus" },
  profiles: { role: "UserRole", locale: "Locale" },
  company_installers: { role: "MembershipRole", status: "RosterStatus" },
  company_membership_roles: { role: "MembershipRole" },
  invitations: { status: "InvitationStatus", role: "InvitationRole" },
  projects: {
    status: "ProjectStatus",
    country: "Country",
    billing_mode: "BillingMode",
    currency: "OrderCurrency",
  },
  sites: { status: "SiteStatus" },
  site_import_batches: { status: "SiteImportBatchStatus" },
  site_import_rows: { outcome: "SiteImportRowOutcome" },
  work_orders: {
    status: "OrderStatus",
    priority: "OrderPriority",
    currency: "OrderCurrency",
    source: "OrderSource",
    payment_status: "PaymentStatus",
  },
  order_payment_events: { status: "PaymentStatus" },
  work_order_conditions: { condition: "ExplicitWorkCondition" },
  work_activities: { schedule_precision: "SchedulePrecision" },
  work_assignments: { schedule_precision: "SchedulePrecision" },
  order_incidents: {
    category: "IncidentCategory",
    severity: "IncidentSeverity",
    status: "IncidentStatus",
  },
  order_updates: { type: "OrderUpdateType" },
  broadcasts: { status: "BroadcastStatus", currency: "OrderCurrency" },
  broadcast_applications: { status: "ApplicationStatus" },
  announcements: {
    severity: "AnnouncementSeverity",
    audience_type: "AnnouncementAudience",
  },
  installer_unavailability: { status: "UnavailabilityStatus" },
  work_order_team_members: { payment_status: "PaymentStatus" },
};

/**
 * Columnas NOT NULL sin default que llena un trigger BEFORE INSERT. El
 * generador las marca obligatorias en `Insert` porque mira el default de la
 * columna, no los triggers; quien inserta no debe (ni puede) proveerlas.
 *
 * `work_orders.order_number` lo asigna `work_orders_assign_number` tomando el
 * correlativo de `order_sequences`. Que el cliente lo mande sería justamente
 * el bug que ese trigger existe para evitar.
 */
const TRIGGER_FILLED = {
  work_orders: ["order_number"],
};


/**
 * Las vistas de Finanzas salen con todas las columnas `| null` porque Postgres
 * no propaga NOT NULL a través de joins ni expresiones. Estas son las que, por
 * construcción de la vista, nunca son nulas (base NOT NULL o coalesce/greatest).
 */
const VIEW_NON_NULL = {
  finance_cash_movements: ["amount", "category", "company_id", "currency", "description", "direction", "entry_id", "id", "method", "reference", "settled_on"],
  finance_entry_balances: ["amount", "available_amount", "category", "company_id", "created_at", "credit_amount", "currency", "description", "direction", "id", "installment", "open_amount", "paid_amount", "reserved_amount", "source", "status", "updated_at"],
  finance_invoice_differences: ["company_id", "current_amount", "entry_id", "invoice_amount", "invoice_id"],
};

const ALIASES = path.join(process.cwd(), "scripts", "database-domain-aliases.ts");

let source = fs.readFileSync(TARGET, "utf8");

// 1. Reinyectar los alias de dominio, que la regeneración borra.
if (!source.includes("export type UserRole")) {
  const at = source.indexOf("export type Database");
  if (at < 0) {
    console.error("No se encontró `export type Database` en types/database.ts");
    process.exit(1);
  }
  const block = fs.readFileSync(ALIASES, "utf8").trimEnd();
  source = `${source.slice(0, at)}${block}\n\n${source.slice(at)}`;
  console.log("Alias de dominio reinyectados");
}

const lines = source.split("\n");

let table = null;
let section = null;
let applied = 0;
const seen = new Set();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  const openTable = line.match(/^ {6}(\w+): \{$/);
  if (openTable) {
    table = openTable[1];
    section = null;
    continue;
  }
  // Fin del bloque de la tabla: vuelve a la indentación de nivel tabla.
  if (/^ {6}\}/.test(line)) {
    table = null;
    section = null;
    continue;
  }

  const openSection = line.match(/^ {8}(Row|Insert|Update): \{$/);
  if (openSection) {
    section = openSection[1];
    continue;
  }
  // Relationships y demás bloques hermanos no llevan columnas.
  if (/^ {8}\w+:/.test(line) && !openSection) section = null;

  if (!table || !section) continue;

  // Vistas de Finanzas: quitar `| null` de las columnas que nunca lo son.
  if (section === "Row" && VIEW_NON_NULL[table]) {
    const view = line.match(/^ {10}(\w+): (.+) \| null$/);
    if (view && VIEW_NON_NULL[table].includes(view[1])) {
      lines[i] = `          ${view[1]}: ${view[2]}`;
      applied += 1;
      continue;
    }
  }

  // Sólo columnas cuyo tipo generado sea exactamente `string`.
  const column = line.match(/^ {10}(\w+)(\??): (\w+)( \| null)?$/);
  if (!column) continue;
  const [, name, optional, type, nullable] = column;

  const alias = NARROWING[table]?.[name];
  if (alias && type === "string") {
    lines[i] = `          ${name}${optional}: ${alias}${nullable ?? ""}`;
    applied += 1;
    seen.add(`${table}.${name}`);
    continue;
  }

  // El `?` va sólo en Insert/Update: en Row la columna sigue estando siempre.
  if (
    section !== "Row" &&
    optional === "" &&
    TRIGGER_FILLED[table]?.includes(name)
  ) {
    lines[i] = `          ${name}?: ${type}${nullable ?? ""}`;
    applied += 1;
    seen.add(`${table}.${name}`);
  }
}

const expected = [
  ...Object.entries(NARROWING).flatMap(([t, cols]) =>
    Object.keys(cols).map((c) => `${t}.${c}`),
  ),
  ...Object.entries(TRIGGER_FILLED).flatMap(([t, cols]) =>
    cols.map((c) => `${t}.${c}`),
  ),
];
const missing = expected.filter((key) => !seen.has(key));

fs.writeFileSync(TARGET, lines.join("\n"), "utf8");

console.log(`Columnas estrechadas: ${applied} (${seen.size} distintas)`);
if (missing.length > 0) {
  // No se aborta: puede ser una regeneración ya estrechada. Pero se avisa,
  // porque también puede ser una columna renombrada o eliminada en el schema.
  console.warn(
    `Sin coincidencia (¿ya estrechadas, renombradas o eliminadas?): ${missing.join(", ")}`,
  );
}
