// Alias de dominio para columnas con CHECK cerrado.
//
// Postgres no expone los CHECK de texto como enums, asi que
// `supabase gen types` los emite como `string`. Este bloque lo inyecta
// scripts/narrow-database-types.mjs despues de cada regeneracion.
// Mantener sincronizado con los CHECK de supabase/migrations/.

export type UserRole =
  | "platform_admin"
  | "company_manager"
  | "installer";
export type MembershipRole = "installer" | "coordinator";
export type Locale = "es" | "pt";
export type CompanyStatus = "active" | "suspended";
export type Country = "AR" | "BR";
export type ProjectStatus = "draft" | "active" | "paused" | "done";
export type OrderStatus =
  | "pendiente"
  | "relevamiento"
  | "planificada"
  | "en_camino"
  | "en_sitio"
  | "en_proceso"
  | "en_revision"
  | "finalizada"
  | "cancelada";
export type OrderSource = "roster" | "broadcast";
export type OrderPriority = "baja" | "media" | "alta" | "urgente";
export type OrderCurrency = "ARS" | "BRL";
export type BillingMode = "project" | "per_installation";
/**
 * Estado de cobro de una orden. Deliberadamente separado de `OrderStatus`:
 * `finalizada` dice que el trabajo se terminó, no que la plata entró.
 */
export type PaymentStatus = "pending" | "paid";
export type OrderUpdateType =
  | "travel"
  | "checkin"
  | "progress"
  | "blocker"
  | "done"
  | "survey"
  | "system"
  | "message";
export type IncidentCategory =
  | "failed_visit"
  | "missing_materials"
  | "client_absent"
  | "technical_issue"
  | "revisit_required"
  | "complaint"
  | "rejected_work"
  | "incomplete_work"
  | "other";
/**
 * Condiciones objetivas que se declaran sobre una orden (DEC-16).
 *
 * Sólo las que se guardan. `exterior` y `flete` no están acá a propósito: ya
 * viven en `work_orders.indoor` y `requires_freight`, y se derivan al leer en
 * `lib/domain/work-conditions.ts`.
 */
export type ExplicitWorkCondition =
  | "altura"
  | "electrico"
  | "nocturno"
  | "gran_formato"
  | "acceso_restringido";
/**
 * Qué tan precisa es la agenda de una actividad. `unknown` es la respuesta
 * honesta para lo viejo: nunca se le inventa una franja a una orden que no la
 * tenía, ni para bloquearla ni para penalizarla (AC-11-C).
 */
export type SchedulePrecision = "unknown" | "day" | "exact";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "resolved";
export type InvitationStatus = "pending" | "accepted" | "expired";
export type RosterStatus = "invited" | "active" | "removed";
export type UnavailabilityStatus = "pending" | "approved" | "rejected";
export type AnnouncementSeverity = "info" | "warning" | "critical";
export type AnnouncementAudience = "all" | "zone" | "project";
export type BroadcastStatus = "open" | "closed";
export type ApplicationStatus = "applied" | "accepted" | "rejected";
export type SiteImportBatchStatus = "in_progress" | "completed" | "failed";
export type SiteImportRowOutcome = "imported" | "reused" | "skipped";
export type SiteStatus =
  | "sin_ordenes"
  | "pendiente"
  | "planificada"
  | "en_proceso"
  | "finalizada";

// supabase-js infiere los tipos de consulta a partir de esta forma exacta:
// cada tabla necesita `Relationships` y el schema necesita
// `Views`/`Functions`/`Enums`/`CompositeTypes`, o el typing colapsa a `never`.
