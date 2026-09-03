export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          audience_ref: string
          audience_type: AnnouncementAudience
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          recipients: number
          severity: AnnouncementSeverity
          title: string
        }
        Insert: {
          audience_ref?: string
          audience_type?: AnnouncementAudience
          body: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipients?: number
          severity?: AnnouncementSeverity
          title: string
        }
        Update: {
          audience_ref?: string
          audience_type?: AnnouncementAudience
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipients?: number
          severity?: AnnouncementSeverity
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_command_receipts: {
        Row: {
          activity_id: string
          activity_version: number
          actor_id: string
          assignment_id: string | null
          available: boolean
          company_id: string
          correlation_id: string
          created_at: string
          operation_id: string
          override_allowed: boolean
          reason_code: string
          request_payload: Json
        }
        Insert: {
          activity_id: string
          activity_version: number
          actor_id: string
          assignment_id?: string | null
          available: boolean
          company_id: string
          correlation_id: string
          created_at?: string
          operation_id: string
          override_allowed?: boolean
          reason_code: string
          request_payload: Json
        }
        Update: {
          activity_id?: string
          activity_version?: number
          actor_id?: string
          assignment_id?: string | null
          available?: boolean
          company_id?: string
          correlation_id?: string
          created_at?: string
          operation_id?: string
          override_allowed?: boolean
          reason_code?: string
          request_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "assignment_command_receipts_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_command_receipts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "work_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_command_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_receipts_activity_company_fk"
            columns: ["activity_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_activities"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      assignment_override_audit: {
        Row: {
          activity_id: string
          actor_id: string
          assignment_id: string
          company_id: string
          conflict_code: string
          correlation_id: string
          created_at: string
          id: string
          installer_id: string
          reason: string
        }
        Insert: {
          activity_id: string
          actor_id: string
          assignment_id: string
          company_id: string
          conflict_code: string
          correlation_id: string
          created_at?: string
          id?: string
          installer_id: string
          reason: string
        }
        Update: {
          activity_id?: string
          actor_id?: string
          assignment_id?: string
          company_id?: string
          conflict_code?: string
          correlation_id?: string
          created_at?: string
          id?: string
          installer_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_override_activity_company_fk"
            columns: ["activity_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_activities"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "assignment_override_assignment_company_fk"
            columns: ["assignment_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_assignments"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "assignment_override_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_override_audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_override_audit_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_applications: {
        Row: {
          broadcast_id: string
          created_at: string
          installer_id: string
          message: string | null
          quoted_amount: number | null
          status: ApplicationStatus
        }
        Insert: {
          broadcast_id: string
          created_at?: string
          installer_id: string
          message?: string | null
          quoted_amount?: number | null
          status?: ApplicationStatus
        }
        Update: {
          broadcast_id?: string
          created_at?: string
          installer_id?: string
          message?: string | null
          quoted_amount?: number | null
          status?: ApplicationStatus
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_applications_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_applications_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          client_id: string | null
          company_id: string
          created_at: string
          currency: OrderCurrency
          description: string
          id: string
          lat: number | null
          lng: number | null
          logistics_notes: string
          pay_amount: number | null
          pay_visible: boolean
          project_id: string | null
          requirements: string
          scheduled_date: string | null
          scheduled_end_date: string | null
          slots: number
          status: BroadcastStatus
          title: string
          zone: string
        }
        Insert: {
          client_id?: string | null
          company_id: string
          created_at?: string
          currency?: OrderCurrency
          description?: string
          id?: string
          lat?: number | null
          lng?: number | null
          logistics_notes?: string
          pay_amount?: number | null
          pay_visible?: boolean
          project_id?: string | null
          requirements?: string
          scheduled_date?: string | null
          scheduled_end_date?: string | null
          slots?: number
          status?: BroadcastStatus
          title: string
          zone: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          currency?: OrderCurrency
          description?: string
          id?: string
          lat?: number | null
          lng?: number | null
          logistics_notes?: string
          pay_amount?: number | null
          pay_visible?: boolean
          project_id?: string | null
          requirements?: string
          scheduled_date?: string | null
          scheduled_end_date?: string | null
          slots?: number
          status?: BroadcastStatus
          title?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_client_company_fk"
            columns: ["client_id", "company_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "broadcasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          calendar_id: string
          company_id: string
          connected_at: string
          encrypted_access_token: string
          encrypted_refresh_token: string
          google_email: string
          id: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_id?: string
          company_id: string
          connected_at?: string
          encrypted_access_token: string
          encrypted_refresh_token: string
          google_email?: string
          id?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          company_id?: string
          connected_at?: string
          encrypted_access_token?: string
          encrypted_refresh_token?: string
          google_email?: string
          id?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_order_events: {
        Row: {
          company_id: string
          connection_id: string
          google_event_id: string
          id: string
          last_synced_at: string
          order_id: string
        }
        Insert: {
          company_id: string
          connection_id: string
          google_event_id: string
          id?: string
          last_synced_at?: string
          order_id: string
        }
        Update: {
          company_id?: string
          connection_id?: string
          google_event_id?: string
          id?: string
          last_synced_at?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_order_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_order_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "calendar_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_order_events_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id", "company_id"]
          },
          {
            foreignKeyName: "calendar_order_events_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      chat_message_reads: {
        Row: {
          company_id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json
          body: string
          company_id: string
          created_at: string
          id: string
          reply_to_id: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          attachments?: Json
          body?: string
          company_id: string
          created_at?: string
          id: string
          reply_to_id?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          reply_to_id?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          company_id: string
          created_at: string
          id: string
          installer_id: string
          last_message_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          installer_id: string
          last_message_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          installer_id?: string
          last_message_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string
          company_id: string
          contact_name: string
          created_at: string
          email: string
          id: string
          instagram: string
          name: string
          notes: string
          phone: string
          tax_id: string
          tiktok: string
          updated_at: string
          website: string
          youtube: string
        }
        Insert: {
          address?: string
          company_id: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          instagram?: string
          name: string
          notes?: string
          phone?: string
          tax_id?: string
          tiktok?: string
          updated_at?: string
          website?: string
          youtube?: string
        }
        Update: {
          address?: string
          company_id?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          instagram?: string
          name?: string
          notes?: string
          phone?: string
          tax_id?: string
          tiktok?: string
          updated_at?: string
          website?: string
          youtube?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          country: Country
          created_at: string
          id: string
          logo_url: string | null
          name: string
          order_prefix: string
          order_seq: number
          status: CompanyStatus
        }
        Insert: {
          country: Country
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          order_prefix?: string
          order_seq?: number
          status?: CompanyStatus
        }
        Update: {
          country?: Country
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          order_prefix?: string
          order_seq?: number
          status?: CompanyStatus
        }
        Relationships: []
      }
      company_feature_flags: {
        Row: {
          company_id: string
          configured_by: string | null
          enabled: boolean
          flag_key: string
          updated_at: string
        }
        Insert: {
          company_id: string
          configured_by?: string | null
          enabled: boolean
          flag_key: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          configured_by?: string | null
          enabled?: boolean
          flag_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_feature_flags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_feature_flags_configured_by_fkey"
            columns: ["configured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_feature_flags_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      company_installers: {
        Row: {
          company_id: string
          default_installer_rate: number | null
          installer_id: string
          invited_at: string
          joined_at: string | null
          role: MembershipRole
          status: RosterStatus
        }
        Insert: {
          company_id: string
          default_installer_rate?: number | null
          installer_id: string
          invited_at?: string
          joined_at?: string | null
          role?: MembershipRole
          status?: RosterStatus
        }
        Update: {
          company_id?: string
          default_installer_rate?: number | null
          installer_id?: string
          invited_at?: string
          joined_at?: string | null
          role?: MembershipRole
          status?: RosterStatus
        }
        Relationships: [
          {
            foreignKeyName: "company_installers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_installers_user_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_membership_roles: {
        Row: {
          company_id: string
          granted_at: string
          granted_by: string | null
          role: MembershipRole
          user_id: string
        }
        Insert: {
          company_id: string
          granted_at?: string
          granted_by?: string | null
          role: MembershipRole
          user_id: string
        }
        Update: {
          company_id?: string
          granted_at?: string
          granted_by?: string | null
          role?: MembershipRole
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_membership_roles_company_id_user_id_fkey"
            columns: ["company_id", "user_id"]
            isOneToOne: false
            referencedRelation: "company_installers"
            referencedColumns: ["company_id", "installer_id"]
          },
          {
            foreignKeyName: "company_membership_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_events: {
        Row: {
          actor_id: string | null
          company_id: string
          enabled: boolean
          flag_key: string
          id: number
          occurred_at: string
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          enabled: boolean
          flag_key: string
          id?: never
          occurred_at?: string
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          enabled?: boolean
          flag_key?: string
          id?: never
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flag_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flag_events_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          default_enabled: boolean
          description: string
          key: string
        }
        Insert: {
          created_at?: string
          default_enabled?: boolean
          description: string
          key: string
        }
        Update: {
          created_at?: string
          default_enabled?: boolean
          description?: string
          key?: string
        }
        Relationships: []
      }
      installer_global_unavailability: {
        Row: {
          company_id: string
          created_at: string
          ends_at: string
          id: string
          installer_id: string
          reason: string
          source_legacy_unavailability_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          ends_at: string
          id?: string
          installer_id: string
          reason: string
          source_legacy_unavailability_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          installer_id?: string
          reason?: string
          source_legacy_unavailability_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installer_global_unavailabili_source_legacy_unavailability_fkey"
            columns: ["source_legacy_unavailability_id"]
            isOneToOne: true
            referencedRelation: "installer_unavailability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_global_unavailability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_global_unavailability_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      installer_global_weekly_availability: {
        Row: {
          company_id: string
          created_at: string
          ends_at: string
          id: string
          installer_id: string
          starts_at: string
          timezone: string
          updated_at: string
          weekday: number
        }
        Insert: {
          company_id: string
          created_at?: string
          ends_at: string
          id?: string
          installer_id: string
          starts_at: string
          timezone?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          company_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          installer_id?: string
          starts_at?: string
          timezone?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "installer_global_weekly_availability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_global_weekly_availability_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      installer_performance_events: {
        Row: {
          company_id: string
          context: Json
          id: string
          installer_id: string
          kind: string
          occurred_at: string
          order_id: string | null
          revert_reason: string
          reverted_at: string | null
          reverted_by: string | null
          source_id: string | null
          source_table: string | null
        }
        Insert: {
          company_id: string
          context?: Json
          id?: string
          installer_id: string
          kind: string
          occurred_at?: string
          order_id?: string | null
          revert_reason?: string
          reverted_at?: string | null
          reverted_by?: string | null
          source_id?: string | null
          source_table?: string | null
        }
        Update: {
          company_id?: string
          context?: Json
          id?: string
          installer_id?: string
          kind?: string
          occurred_at?: string
          order_id?: string | null
          revert_reason?: string
          reverted_at?: string | null
          reverted_by?: string | null
          source_id?: string | null
          source_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installer_performance_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_performance_events_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_performance_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "installer_performance_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_performance_events_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      installer_reliability_events: {
        Row: {
          company_id: string
          id: string
          installer_id: string
          kind: string
          occurred_at: string
          order_id: string | null
          revert_reason: string
          reverted_at: string | null
          reverted_by: string | null
          source_id: string | null
          source_table: string | null
        }
        Insert: {
          company_id: string
          id?: string
          installer_id: string
          kind: string
          occurred_at?: string
          order_id?: string | null
          revert_reason?: string
          reverted_at?: string | null
          reverted_by?: string | null
          source_id?: string | null
          source_table?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          installer_id?: string
          kind?: string
          occurred_at?: string
          order_id?: string | null
          revert_reason?: string
          reverted_at?: string | null
          reverted_by?: string | null
          source_id?: string | null
          source_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installer_reliability_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_reliability_events_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_reliability_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "installer_reliability_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_reliability_events_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      installer_unavailability: {
        Row: {
          company_id: string
          created_at: string
          ends_at: string
          id: string
          installer_id: string
          reason: string
          review_note: string
          reviewed_at: string | null
          reviewed_by: string | null
          starts_at: string
          status: UnavailabilityStatus
        }
        Insert: {
          company_id: string
          created_at?: string
          ends_at: string
          id?: string
          installer_id: string
          reason: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at: string
          status?: UnavailabilityStatus
        }
        Update: {
          company_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          installer_id?: string
          reason?: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at?: string
          status?: UnavailabilityStatus
        }
        Relationships: [
          {
            foreignKeyName: "installer_unavailability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_unavailability_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_unavailability_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      installer_weekly_availability: {
        Row: {
          company_id: string
          created_at: string
          ends_at: string
          id: string
          installer_id: string
          starts_at: string
          timezone: string
          weekday: number
        }
        Insert: {
          company_id: string
          created_at?: string
          ends_at: string
          id?: string
          installer_id: string
          starts_at: string
          timezone?: string
          weekday: number
        }
        Update: {
          company_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          installer_id?: string
          starts_at?: string
          timezone?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "installer_weekly_availability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_weekly_availability_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      installers: {
        Row: {
          available: boolean
          base_address: string | null
          base_city: string | null
          base_lat: number | null
          base_lng: number | null
          id: string
          rating_avg: number
          rating_count: number
          service_radius_km: number | null
          skills: string[]
          zones: string[]
        }
        Insert: {
          available?: boolean
          base_address?: string | null
          base_city?: string | null
          base_lat?: number | null
          base_lng?: number | null
          id: string
          rating_avg?: number
          rating_count?: number
          service_radius_km?: number | null
          skills?: string[]
          zones?: string[]
        }
        Update: {
          available?: boolean
          base_address?: string | null
          base_city?: string | null
          base_lat?: number | null
          base_lng?: number | null
          id?: string
          rating_avg?: number
          rating_count?: number
          service_radius_km?: number | null
          skills?: string[]
          zones?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "installers_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          role: MembershipRole
          status: InvitationStatus
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          role?: MembershipRole
          status?: InvitationStatus
          token?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          role?: MembershipRole
          status?: InvitationStatus
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      location_attachments: {
        Row: {
          archived_at: string | null
          category: string
          client_id: string
          company_id: string
          created_at: string
          description: string
          file_name: string
          id: string
          location_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          archived_at?: string | null
          category?: string
          client_id: string
          company_id: string
          created_at?: string
          description?: string
          file_name: string
          id?: string
          location_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          archived_at?: string | null
          category?: string
          client_id?: string
          company_id?: string
          created_at?: string
          description?: string
          file_name?: string
          id?: string
          location_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_attachments_location_tenant_client_fk"
            columns: ["location_id", "company_id", "client_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "company_id", "client_id"]
          },
          {
            foreignKeyName: "location_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      location_backfill_issues: {
        Row: {
          client_id: string | null
          company_id: string
          created_at: string
          details: Json
          id: string
          issue_code: string
          normalized_external_ref: string | null
          project_id: string | null
          resolution_note: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_location_id: string | null
          source_site_id: string | null
          source_site_ids: string[]
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id: string
          created_at?: string
          details?: Json
          id?: string
          issue_code: string
          normalized_external_ref?: string | null
          project_id?: string | null
          resolution_note?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_location_id?: string | null
          source_site_id?: string | null
          source_site_ids?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          details?: Json
          id?: string
          issue_code?: string
          normalized_external_ref?: string | null
          project_id?: string | null
          resolution_note?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_location_id?: string | null
          source_site_id?: string | null
          source_site_ids?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_backfill_issues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_backfill_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_backfill_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_backfill_issues_resolution_fk"
            columns: ["resolved_location_id", "company_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "location_backfill_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_backfill_issues_source_site_id_fkey"
            columns: ["source_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      location_change_events: {
        Row: {
          actor_context: string
          actor_id: string | null
          after_data: Json
          before_data: Json
          changed_fields: string[]
          client_created_at: string | null
          client_id: string
          company_id: string
          created_at: string
          event_type: string
          id: string
          location_id: string
          note: string
          status: string
        }
        Insert: {
          actor_context: string
          actor_id?: string | null
          after_data?: Json
          before_data?: Json
          changed_fields?: string[]
          client_created_at?: string | null
          client_id: string
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          location_id: string
          note?: string
          status?: string
        }
        Update: {
          actor_context?: string
          actor_id?: string | null
          after_data?: Json
          before_data?: Json
          changed_fields?: string[]
          client_created_at?: string | null
          client_id?: string
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          location_id?: string
          note?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_change_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_change_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_change_events_location_tenant_client_fk"
            columns: ["location_id", "company_id", "client_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "company_id", "client_id"]
          },
        ]
      }
      location_requirements: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          created_by: string | null
          document_attachment_id: string | null
          expires_on: string | null
          id: string
          kind: string
          location_id: string
          metadata: Json
          notes: string
          requirement_type: string
          responsible_user_id: string | null
          status: string
          updated_at: string
          valid_from: string | null
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          document_attachment_id?: string | null
          expires_on?: string | null
          id?: string
          kind: string
          location_id: string
          metadata?: Json
          notes?: string
          requirement_type: string
          responsible_user_id?: string | null
          status?: string
          updated_at?: string
          valid_from?: string | null
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_attachment_id?: string | null
          expires_on?: string | null
          id?: string
          kind?: string
          location_id?: string
          metadata?: Json
          notes?: string
          requirement_type?: string
          responsible_user_id?: string | null
          status?: string
          updated_at?: string
          valid_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_requirements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_requirements_document_scope_fk"
            columns: [
              "document_attachment_id",
              "location_id",
              "company_id",
              "client_id",
            ]
            isOneToOne: false
            referencedRelation: "location_attachments"
            referencedColumns: ["id", "location_id", "company_id", "client_id"]
          },
          {
            foreignKeyName: "location_requirements_location_tenant_client_fk"
            columns: ["location_id", "company_id", "client_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "company_id", "client_id"]
          },
          {
            foreignKeyName: "location_requirements_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          access_notes: string
          address: string
          archived_at: string | null
          city: string
          client_id: string
          company_id: string
          contact_email: string
          contact_name: string
          contact_phone: string
          country: string
          created_at: string
          created_by: string | null
          external_ref: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          normalized_external_ref: string | null
          opening_hours: string
          parking_notes: string
          permanent_notes: string
          risk_notes: string
          source: string
          state: string
          technical_notes: string
          updated_at: string
          updated_by: string | null
          zone: string
        }
        Insert: {
          access_notes?: string
          address?: string
          archived_at?: string | null
          city?: string
          client_id: string
          company_id: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          country?: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          normalized_external_ref?: string | null
          opening_hours?: string
          parking_notes?: string
          permanent_notes?: string
          risk_notes?: string
          source?: string
          state?: string
          technical_notes?: string
          updated_at?: string
          updated_by?: string | null
          zone?: string
        }
        Update: {
          access_notes?: string
          address?: string
          archived_at?: string | null
          city?: string
          client_id?: string
          company_id?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          country?: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          normalized_external_ref?: string | null
          opening_hours?: string
          parking_notes?: string
          permanent_notes?: string
          risk_notes?: string
          source?: string
          state?: string
          technical_notes?: string
          updated_at?: string
          updated_by?: string | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_client_company_fk"
            columns: ["client_id", "company_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      non_working_days: {
        Row: {
          company_id: string | null
          country: string
          created_at: string
          day: string
          id: string
          name: string
        }
        Insert: {
          company_id?: string | null
          country: string
          created_at?: string
          day: string
          id?: string
          name?: string
        }
        Update: {
          company_id?: string | null
          country?: string
          created_at?: string
          day?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "non_working_days_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          company_id: string
          correlation_id: string
          created_at: string
          delivered_at: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          max_attempts: number
          next_attempt_at: string
          notification_id: string | null
          outbox_id: string
          provider_message_id: string | null
          recipient_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: string
          company_id: string
          correlation_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          max_attempts?: number
          next_attempt_at?: string
          notification_id?: string | null
          outbox_id: string
          provider_message_id?: string | null
          recipient_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: string
          company_id?: string
          correlation_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          max_attempts?: number
          next_attempt_at?: string
          notification_id?: string | null
          outbox_id?: string
          provider_message_id?: string | null
          recipient_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "notification_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          available_at: string
          company_id: string
          correlation_id: string
          created_at: string
          dedupe_key: string
          delivered_at: string | null
          event_type: string
          id: string
          last_error_code: string | null
          locked_at: string | null
          max_attempts: number
          payload: Json
          project_id: string | null
          recipient_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempts?: number
          available_at?: string
          company_id: string
          correlation_id: string
          created_at?: string
          dedupe_key: string
          delivered_at?: string | null
          event_type: string
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          project_id?: string | null
          recipient_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          available_at?: string
          company_id?: string
          correlation_id?: string
          created_at?: string
          dedupe_key?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          project_id?: string | null
          recipient_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          correlation_id: string | null
          created_at: string
          data: Json
          dedupe_key: string | null
          delivered_at: string | null
          id: string
          push_sent_at: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          correlation_id?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          delivered_at?: string | null
          id?: string
          push_sent_at?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          correlation_id?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          delivered_at?: string | null
          id?: string
          push_sent_at?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_attachments: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          order_id: string
          search_vector: unknown
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          order_id: string
          search_vector?: unknown
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          order_id?: string
          search_vector?: unknown
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_attachments_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id", "company_id"]
          },
          {
            foreignKeyName: "order_attachments_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "order_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_cancellation_requests: {
        Row: {
          calendar_country: string
          company_id: string
          id: string
          installer_id: string
          justified: boolean | null
          order_id: string
          reason_code: string
          reason_note: string
          requested_at: string
          review_note: string
          reviewed_at: string | null
          reviewed_by: string | null
          scheduled_date_at_request: string | null
          status: string
          within_notice: boolean
        }
        Insert: {
          calendar_country: string
          company_id: string
          id?: string
          installer_id: string
          justified?: boolean | null
          order_id: string
          reason_code: string
          reason_note?: string
          requested_at?: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_date_at_request?: string | null
          status?: string
          within_notice: boolean
        }
        Update: {
          calendar_country?: string
          company_id?: string
          id?: string
          installer_id?: string
          justified?: boolean | null
          order_id?: string
          reason_code?: string
          reason_note?: string
          requested_at?: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_date_at_request?: string | null
          status?: string
          within_notice?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "order_cancellation_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cancellation_requests_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cancellation_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_cancellation_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cancellation_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_incidents: {
        Row: {
          category: IncidentCategory
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          occurred_at: string | null
          order_id: string
          requires_revisit: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: IncidentSeverity
          status: IncidentStatus
          updated_at: string
        }
        Insert: {
          category: IncidentCategory
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          occurred_at?: string | null
          order_id: string
          requires_revisit?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: IncidentSeverity
          status?: IncidentStatus
          updated_at?: string
        }
        Update: {
          category?: IncidentCategory
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          occurred_at?: string | null
          order_id?: string
          requires_revisit?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: IncidentSeverity
          status?: IncidentStatus
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_incidents_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id", "company_id"]
          },
          {
            foreignKeyName: "order_incidents_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "order_incidents_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payment_events: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          id: string
          note: string
          order_id: string
          status: PaymentStatus
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          note?: string
          order_id: string
          status: PaymentStatus
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          note?: string
          order_id?: string
          status?: PaymentStatus
        }
        Relationships: [
          {
            foreignKeyName: "order_payment_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_events_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id", "company_id"]
          },
          {
            foreignKeyName: "order_payment_events_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      order_reschedules: {
        Row: {
          calendar_country: string
          calendar_timezone: string
          company_id: string
          created_at: string
          id: string
          installer_id: string | null
          new_date: string
          new_end_date: string | null
          notified_at: string | null
          order_id: string
          previous_date: string | null
          previous_end_date: string | null
          reason: string
          reminder_sent_at: string | null
          rescheduled_by: string | null
          responded_at: string | null
          response: string | null
          response_window_days: number
          superseded_at: string | null
        }
        Insert: {
          calendar_country: string
          calendar_timezone?: string
          company_id: string
          created_at?: string
          id?: string
          installer_id?: string | null
          new_date: string
          new_end_date?: string | null
          notified_at?: string | null
          order_id: string
          previous_date?: string | null
          previous_end_date?: string | null
          reason?: string
          reminder_sent_at?: string | null
          rescheduled_by?: string | null
          responded_at?: string | null
          response?: string | null
          response_window_days?: number
          superseded_at?: string | null
        }
        Update: {
          calendar_country?: string
          calendar_timezone?: string
          company_id?: string
          created_at?: string
          id?: string
          installer_id?: string | null
          new_date?: string
          new_end_date?: string | null
          notified_at?: string | null
          order_id?: string
          previous_date?: string | null
          previous_end_date?: string | null
          reason?: string
          reminder_sent_at?: string | null
          rescheduled_by?: string | null
          responded_at?: string | null
          response?: string | null
          response_window_days?: number
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_reschedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_reschedules_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_reschedules_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_reschedules_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_reschedules_rescheduled_by_fkey"
            columns: ["rescheduled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_sequences: {
        Row: {
          company_id: string
          current_value: number
          updated_at: string
          zone_code: string
        }
        Insert: {
          company_id: string
          current_value: number
          updated_at?: string
          zone_code: string
        }
        Update: {
          company_id?: string
          current_value?: number
          updated_at?: string
          zone_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_updates: {
        Row: {
          client_created_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          installer_id: string | null
          links: string[]
          note: string
          order_id: string
          photos: Json
          search_vector: unknown
          type: OrderUpdateType
        }
        Insert: {
          client_created_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id: string
          installer_id?: string | null
          links?: string[]
          note?: string
          order_id: string
          photos?: Json
          search_vector?: unknown
          type: OrderUpdateType
        }
        Update: {
          client_created_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          installer_id?: string | null
          links?: string[]
          note?: string
          order_id?: string
          photos?: Json
          search_vector?: unknown
          type?: OrderUpdateType
        }
        Relationships: [
          {
            foreignKeyName: "order_updates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_updates_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_updates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_updates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          company_id: string | null
          created_at: string
          full_name: string
          id: string
          locale: Locale
          phone: string | null
          role: UserRole
        }
        Insert: {
          avatar_path?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string
          id: string
          locale?: Locale
          phone?: string | null
          role: UserRole
        }
        Update: {
          avatar_path?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          locale?: Locale
          phone?: string | null
          role?: UserRole
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_locations: {
        Row: {
          client_id: string
          company_id: string
          contract_data: Json
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          operational_snapshot: Json
          project_id: string
          scope: string
          status: string
          unit_quantity: number
          updated_at: string
        }
        Insert: {
          client_id: string
          company_id: string
          contract_data?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          operational_snapshot?: Json
          project_id: string
          scope?: string
          status?: string
          unit_quantity?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          company_id?: string
          contract_data?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          operational_snapshot?: Json
          project_id?: string
          scope?: string
          status?: string
          unit_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_locations_location_tenant_client_fk"
            columns: ["location_id", "company_id", "client_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "company_id", "client_id"]
          },
          {
            foreignKeyName: "project_locations_project_tenant_client_fk"
            columns: ["project_id", "company_id", "client_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id", "client_id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          billing_mode: BillingMode
          client_id: string | null
          client_name: string
          company_id: string
          contract_amount: number | null
          coordinator_id: string | null
          country: Country
          created_at: string
          currency: OrderCurrency
          description: string
          ends_at: string | null
          id: string
          name: string
          planned_installations: number
          starts_at: string | null
          status: ProjectStatus
          updated_at: string
          zones: string[]
        }
        Insert: {
          archived_at?: string | null
          billing_mode?: BillingMode
          client_id?: string | null
          client_name?: string
          company_id: string
          contract_amount?: number | null
          coordinator_id?: string | null
          country?: Country
          created_at?: string
          currency?: OrderCurrency
          description?: string
          ends_at?: string | null
          id?: string
          name: string
          planned_installations?: number
          starts_at?: string | null
          status?: ProjectStatus
          updated_at?: string
          zones?: string[]
        }
        Update: {
          archived_at?: string | null
          billing_mode?: BillingMode
          client_id?: string | null
          client_name?: string
          company_id?: string
          contract_amount?: number | null
          coordinator_id?: string | null
          country?: Country
          created_at?: string
          currency?: OrderCurrency
          description?: string
          ends_at?: string | null
          id?: string
          name?: string
          planned_installations?: number
          starts_at?: string | null
          status?: ProjectStatus
          updated_at?: string
          zones?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_coordinator_id_fkey"
            columns: ["coordinator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          keys: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          keys: Json
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          keys?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          comment: string | null
          company_id: string
          created_at: string
          id: string
          installer_id: string
          order_id: string
          stars: number
        }
        Insert: {
          comment?: string | null
          company_id: string
          created_at?: string
          id?: string
          installer_id: string
          order_id: string
          stars: number
        }
        Update: {
          comment?: string | null
          company_id?: string
          created_at?: string
          id?: string
          installer_id?: string
          order_id?: string
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      site_attachments: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          site_id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          site_id: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          site_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_attachments_site_company_fk"
            columns: ["site_id", "company_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "site_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_import_batches: {
        Row: {
          checksum: string
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          found: number
          id: string
          imported: number
          project_id: string
          reused: number
          skipped: number
          status: SiteImportBatchStatus
        }
        Insert: {
          checksum: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          found?: number
          id: string
          imported?: number
          project_id: string
          reused?: number
          skipped?: number
          status?: SiteImportBatchStatus
        }
        Update: {
          checksum?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          found?: number
          id?: string
          imported?: number
          project_id?: string
          reused?: number
          skipped?: number
          status?: SiteImportBatchStatus
        }
        Relationships: [
          {
            foreignKeyName: "site_import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_import_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      site_import_rows: {
        Row: {
          batch_id: string
          company_id: string
          created_at: string
          external_ref: string | null
          location_id: string | null
          name: string
          outcome: SiteImportRowOutcome
          reason: string | null
          row_number: number
        }
        Insert: {
          batch_id: string
          company_id: string
          created_at?: string
          external_ref?: string | null
          location_id?: string | null
          name?: string
          outcome: SiteImportRowOutcome
          reason?: string | null
          row_number: number
        }
        Update: {
          batch_id?: string
          company_id?: string
          created_at?: string
          external_ref?: string | null
          location_id?: string | null
          name?: string
          outcome?: SiteImportRowOutcome
          reason?: string | null
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "site_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_import_rows_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          access_notes: string
          address: string
          archived_at: string | null
          city: string
          company_id: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          external_ref: string | null
          id: string
          is_placeholder: boolean
          lat: number | null
          lng: number | null
          location_id: string | null
          name: string
          opening_hours: string
          parking_notes: string
          permanent_notes: string
          project_id: string
          risk_notes: string
          state: string
          status: SiteStatus
          technical_notes: string
          updated_at: string
          zone: string
        }
        Insert: {
          access_notes?: string
          address?: string
          archived_at?: string | null
          city?: string
          company_id: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          external_ref?: string | null
          id?: string
          is_placeholder?: boolean
          lat?: number | null
          lng?: number | null
          location_id?: string | null
          name: string
          opening_hours?: string
          parking_notes?: string
          permanent_notes?: string
          project_id: string
          risk_notes?: string
          state?: string
          status?: SiteStatus
          technical_notes?: string
          updated_at?: string
          zone?: string
        }
        Update: {
          access_notes?: string
          address?: string
          archived_at?: string | null
          city?: string
          company_id?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          external_ref?: string | null
          id?: string
          is_placeholder?: boolean
          lat?: number | null
          lng?: number | null
          location_id?: string | null
          name?: string
          opening_hours?: string
          parking_notes?: string
          permanent_notes?: string
          project_id?: string
          risk_notes?: string
          state?: string
          status?: SiteStatus
          technical_notes?: string
          updated_at?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_location_fk"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_submission_decisions: {
        Row: {
          company_id: string
          correlation_id: string
          created_at: string
          decision: string
          id: string
          operation_id: string
          reason: string
          reviewer_id: string
          submission_id: string
          used_manager_fallback: boolean
        }
        Insert: {
          company_id: string
          correlation_id: string
          created_at?: string
          decision: string
          id?: string
          operation_id: string
          reason?: string
          reviewer_id: string
          submission_id: string
          used_manager_fallback?: boolean
        }
        Update: {
          company_id?: string
          correlation_id?: string
          created_at?: string
          decision?: string
          id?: string
          operation_id?: string
          reason?: string
          reviewer_id?: string
          submission_id?: string
          used_manager_fallback?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "survey_decisions_submission_company_fk"
            columns: ["submission_id", "company_id"]
            isOneToOne: false
            referencedRelation: "survey_submissions"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "survey_submission_decisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_submission_decisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_submissions: {
        Row: {
          activity_id: string
          approved_at: string | null
          approved_by: string | null
          author_id: string | null
          checklist_responses: Json
          company_id: string
          content_hash: string | null
          created_at: string
          evidence: Json
          form_data: Json
          id: string
          measurements: Json
          notes: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_order_update_id: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          activity_id: string
          approved_at?: string | null
          approved_by?: string | null
          author_id?: string | null
          checklist_responses?: Json
          company_id: string
          content_hash?: string | null
          created_at?: string
          evidence?: Json
          form_data?: Json
          id?: string
          measurements?: Json
          notes?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_order_update_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          activity_id?: string
          approved_at?: string | null
          approved_by?: string | null
          author_id?: string | null
          checklist_responses?: Json
          company_id?: string
          content_hash?: string | null
          created_at?: string
          evidence?: Json
          form_data?: Json
          id?: string
          measurements?: Json
          notes?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_order_update_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "survey_submissions_activity_company_fk"
            columns: ["activity_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_activities"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "survey_submissions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_submissions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_submissions_source_order_update_id_fkey"
            columns: ["source_order_update_id"]
            isOneToOne: true
            referencedRelation: "order_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_templates: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          definition: Json
          id: string
          is_active: boolean
          name: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          definition?: Json
          id?: string
          is_active?: boolean
          name?: string
          version: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          definition?: Json
          id?: string
          is_active?: boolean
          name?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "survey_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_activities: {
        Row: {
          activity_type: string
          checklist_definition: Json
          company_id: string
          created_at: string
          created_by: string | null
          estimated_duration_minutes: number | null
          id: string
          legacy_scheduled_date: string | null
          legacy_scheduled_end_date: string | null
          lifecycle: string
          position: number
          prerequisite_activity_id: string | null
          prerequisite_waived_at: string | null
          prerequisite_waived_reason: string | null
          schedule_precision: string
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          template_version: number
          timezone: string
          updated_at: string
          version: number
          work_order_id: string
        }
        Insert: {
          activity_type: string
          checklist_definition?: Json
          company_id: string
          created_at?: string
          created_by?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          legacy_scheduled_date?: string | null
          legacy_scheduled_end_date?: string | null
          lifecycle?: string
          position?: number
          prerequisite_activity_id?: string | null
          prerequisite_waived_at?: string | null
          prerequisite_waived_reason?: string | null
          schedule_precision?: string
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          template_version?: number
          timezone?: string
          updated_at?: string
          version?: number
          work_order_id: string
        }
        Update: {
          activity_type?: string
          checklist_definition?: Json
          company_id?: string
          created_at?: string
          created_by?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          legacy_scheduled_date?: string | null
          legacy_scheduled_end_date?: string | null
          lifecycle?: string
          position?: number
          prerequisite_activity_id?: string | null
          prerequisite_waived_at?: string | null
          prerequisite_waived_reason?: string | null
          schedule_precision?: string
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          template_version?: number
          timezone?: string
          updated_at?: string
          version?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_activities_order_company_fk"
            columns: ["work_order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id", "company_id"]
          },
          {
            foreignKeyName: "work_activities_order_company_fk"
            columns: ["work_order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "work_activities_prerequisite_company_fk"
            columns: ["prerequisite_activity_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_activities"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      work_assignments: {
        Row: {
          accepted_at: string | null
          activity_id: string
          company_id: string
          compensation_snapshot: Json
          correlation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          installer_id: string
          legacy_scheduled_date: string | null
          legacy_scheduled_end_date: string | null
          replaces_assignment_id: string | null
          schedule_precision: string
          schedule_range: unknown
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          status: string
          terms_snapshot: Json
          timezone: string
          updated_at: string
          valid_from: string
          valid_until: string | null
          version: number
        }
        Insert: {
          accepted_at?: string | null
          activity_id: string
          company_id: string
          compensation_snapshot?: Json
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          installer_id: string
          legacy_scheduled_date?: string | null
          legacy_scheduled_end_date?: string | null
          replaces_assignment_id?: string | null
          schedule_precision?: string
          schedule_range?: unknown
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          status?: string
          terms_snapshot?: Json
          timezone?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          version: number
        }
        Update: {
          accepted_at?: string | null
          activity_id?: string
          company_id?: string
          compensation_snapshot?: Json
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          installer_id?: string
          legacy_scheduled_date?: string | null
          legacy_scheduled_end_date?: string | null
          replaces_assignment_id?: string | null
          schedule_precision?: string
          schedule_range?: unknown
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          status?: string
          terms_snapshot?: Json
          timezone?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_assignments_activity_company_fk"
            columns: ["activity_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_activities"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "work_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_assignments_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_assignments_replaces_assignment_id_fkey"
            columns: ["replaces_assignment_id"]
            isOneToOne: false
            referencedRelation: "work_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_conditions: {
        Row: {
          company_id: string
          condition: ExplicitWorkCondition
          created_at: string
          created_by: string | null
          order_id: string
        }
        Insert: {
          company_id: string
          condition: ExplicitWorkCondition
          created_at?: string
          created_by?: string | null
          order_id: string
        }
        Update: {
          company_id?: string
          condition?: ExplicitWorkCondition
          created_at?: string
          created_by?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_conditions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_conditions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_conditions_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "installer_earnings"
            referencedColumns: ["order_id", "company_id"]
          },
          {
            foreignKeyName: "work_order_conditions_order_company_fk"
            columns: ["order_id", "company_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      work_orders: {
        Row: {
          amount: number | null
          assigned_at: string | null
          assigned_installer_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: OrderCurrency
          description: string
          finalized_at: string | null
          freight_details: string
          id: string
          indoor: boolean
          installer_accepted_at: string | null
          installer_amount: number | null
          logistics_notes: string
          order_number: string
          original_scheduled_date: string | null
          payment_status: PaymentStatus
          payment_status_changed_at: string | null
          payment_status_changed_by: string | null
          priority: OrderPriority
          project_id: string
          requires_freight: boolean
          reschedule_count: number
          scheduled_date: string | null
          scheduled_end_date: string | null
          site_id: string
          source: OrderSource
          status: OrderStatus
          title: string
          updated_at: string
          visit_count: number
        }
        Insert: {
          amount?: number | null
          assigned_at?: string | null
          assigned_installer_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: OrderCurrency
          description?: string
          finalized_at?: string | null
          freight_details?: string
          id?: string
          indoor?: boolean
          installer_accepted_at?: string | null
          installer_amount?: number | null
          logistics_notes?: string
          order_number?: string
          original_scheduled_date?: string | null
          payment_status?: PaymentStatus
          payment_status_changed_at?: string | null
          payment_status_changed_by?: string | null
          priority?: OrderPriority
          project_id: string
          requires_freight?: boolean
          reschedule_count?: number
          scheduled_date?: string | null
          scheduled_end_date?: string | null
          site_id: string
          source?: OrderSource
          status?: OrderStatus
          title: string
          updated_at?: string
          visit_count?: number
        }
        Update: {
          amount?: number | null
          assigned_at?: string | null
          assigned_installer_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: OrderCurrency
          description?: string
          finalized_at?: string | null
          freight_details?: string
          id?: string
          indoor?: boolean
          installer_accepted_at?: string | null
          installer_amount?: number | null
          logistics_notes?: string
          order_number?: string
          original_scheduled_date?: string | null
          payment_status?: PaymentStatus
          payment_status_changed_at?: string | null
          payment_status_changed_by?: string | null
          priority?: OrderPriority
          project_id?: string
          requires_freight?: boolean
          reschedule_count?: number
          scheduled_date?: string | null
          scheduled_end_date?: string | null
          site_id?: string
          source?: OrderSource
          status?: OrderStatus
          title?: string
          updated_at?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_assigned_installer_id_fkey"
            columns: ["assigned_installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_payment_status_changed_by_fkey"
            columns: ["payment_status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      installer_earnings: {
        Row: {
          amount: number | null
          assigned_installer_id: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          finalized_at: string | null
          order_id: string | null
          order_number: string | null
          payment_status: string | null
          payment_status_changed_at: string | null
          project_id: string | null
          scheduled_date: string | null
          site_id: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          amount?: number | null
          assigned_installer_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          finalized_at?: string | null
          order_id?: string | null
          order_number?: string | null
          payment_status?: string | null
          payment_status_changed_at?: string | null
          project_id?: string | null
          scheduled_date?: string | null
          site_id?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          amount?: number | null
          assigned_installer_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          finalized_at?: string | null
          order_id?: string | null
          order_number?: string | null
          payment_status?: string | null
          payment_status_changed_at?: string | null
          project_id?: string | null
          scheduled_date?: string | null
          site_id?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_assigned_installer_id_fkey"
            columns: ["assigned_installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      location_backfill_report: {
        Row: {
          company_id: string | null
          conflicting_source_data: number | null
          linked_sites: number | null
          missing_client: number | null
          missing_external_ref: number | null
          pending_issues: number | null
          pending_sites: number | null
          total_sites: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_broadcast_application: {
        Args: {
          p_broadcast_id: string
          p_installer_id: string
          p_order_ids?: string[]
        }
        Returns: undefined
      }
      accept_invitation: { Args: { p_token: string }; Returns: undefined }
      announcement_recipient_emails: {
        Args: { p_announcement_id: string }
        Returns: {
          email: string
        }[]
      }
      assign_activity: {
        Args: { p_activity_id: string; p_installer_id: string }
        Returns: string
      }
      auth_can_operate_work_activity: {
        Args: { p_activity_id: string }
        Returns: boolean
      }
      auth_can_operate_work_order: {
        Args: { p_company_id: string; p_work_order_id: string }
        Returns: boolean
      }
      auth_can_read_work_activity: {
        Args: { p_activity_id: string }
        Returns: boolean
      }
      auth_companies: { Args: { p_role?: string }; Returns: string[] }
      auth_company: { Args: never; Returns: string }
      auth_coordinates_anywhere: { Args: never; Returns: boolean }
      auth_has_company_role: {
        Args: { p_company_id: string; p_role: string }
        Returns: boolean
      }
      auth_is_activity_assignee: {
        Args: { p_activity_id: string }
        Returns: boolean
      }
      auth_is_company_manager: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      auth_role: { Args: never; Returns: string }
      broadcast_matches_installer: {
        Args: { p_broadcast_id: string }
        Returns: boolean
      }
      business_days_between: {
        Args: {
          p_company_id?: string
          p_country: string
          p_from: string
          p_to: string
        }
        Returns: number
      }
      can_operate_project: { Args: { p_project_id: string }; Returns: boolean }
      can_read_location: { Args: { p_location_id: string }; Returns: boolean }
      close_broadcast: { Args: { p_broadcast_id: string }; Returns: undefined }
      company_is_active: { Args: { p_company_id: string }; Returns: boolean }
      company_path_is_active: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      create_order_activities: {
        Args: {
          p_include_execution?: boolean
          p_include_survey?: boolean
          p_order_id: string
        }
        Returns: Json
      }
      decide_survey_submission: {
        Args: {
          p_decision: string
          p_operation_id: string
          p_reason?: string
          p_submission_id: string
        }
        Returns: string
      }
      demote_coordinator_to_installer: {
        Args: { p_coordinator_id: string }
        Returns: undefined
      }
      distance_km: {
        Args: { p_lat1: number; p_lat2: number; p_lng1: number; p_lng2: number }
        Returns: number
      }
      emit_performance_event: {
        Args: {
          p_company_id: string
          p_context: Json
          p_installer_id: string
          p_kind: string
          p_occurred_at?: string
          p_order_id: string
          p_source_id: string
          p_source_table: string
        }
        Returns: undefined
      }
      emit_reliability_event: {
        Args: {
          p_company_id: string
          p_installer_id: string
          p_kind: string
          p_occurred_at?: string
          p_order_id: string
          p_source_id: string
          p_source_table: string
        }
        Returns: undefined
      }
      emit_reschedule_reminders: { Args: never; Returns: number }
      emit_reschedule_timeouts: { Args: never; Returns: number }
      feature_enabled: {
        Args: { p_company_id?: string; p_flag_key: string }
        Returns: boolean
      }
      formalize_project_from_broadcast: {
        Args: {
          p_broadcast_id: string
          p_coordinator_id: string
          p_installer_id: string
          p_project_name: string
        }
        Returns: string
      }
      grant_company_member_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      installer_can_read_broadcast: {
        Args: { p_broadcast_id: string }
        Returns: boolean
      }
      invitation_preview: {
        Args: { p_token: string }
        Returns: {
          company_id: string
          company_name: string
          email: string
          invite_role: string
          valid: boolean
        }[]
      }
      next_regional_order_number: {
        Args: { p_company_id: string; p_site_id: string }
        Returns: string
      }
      normalize_location_external_ref: {
        Args: { p_value: string }
        Returns: string
      }
      order_condition_snapshot: { Args: { p_order_id: string }; Returns: Json }
      persist_in_app_notification: {
        Args: {
          p_aggregate_id: string
          p_aggregate_type: string
          p_body: string
          p_company_id: string
          p_correlation_id: string
          p_data: Json
          p_dedupe_key: string
          p_event_type: string
          p_project_id: string
          p_recipient_user_id: string
          p_title: string
        }
        Returns: string
      }
      promote_installer_to_coordinator: {
        Args: { p_installer_id: string }
        Returns: undefined
      }
      publish_announcement: {
        Args: {
          p_audience_ref?: string
          p_audience_type?: string
          p_body: string
          p_severity?: string
          p_title: string
        }
        Returns: {
          announcement_id: string
          recipients: number
        }[]
      }
      record_notification_delivery_attempt: {
        Args: {
          p_delivery_id: string
          p_error_code?: string
          p_provider_message_id?: string
          p_succeeded: boolean
        }
        Returns: string
      }
      reject_broadcast_application: {
        Args: { p_broadcast_id: string; p_installer_id: string }
        Returns: undefined
      }
      replace_installer_weekly_availability: {
        Args: { p_company_id: string; p_entries: Json }
        Returns: undefined
      }
      request_order_cancellation: {
        Args: {
          p_order_id: string
          p_reason_code: string
          p_reason_note?: string
        }
        Returns: string
      }
      reschedule_order_with_notice: {
        Args: {
          p_order_id: string
          p_reason?: string
          p_scheduled_date: string
          p_scheduled_end_date?: string
        }
        Returns: string
      }
      respond_to_reschedule: {
        Args: { p_reschedule_id: string; p_response: string }
        Returns: undefined
      }
      revert_performance_event: {
        Args: { p_event_id: string; p_reason: string }
        Returns: undefined
      }
      revert_reliability_event: {
        Args: { p_event_id: string; p_reason: string }
        Returns: undefined
      }
      review_order_cancellation: {
        Args: {
          p_decision: string
          p_justified: boolean
          p_note?: string
          p_request_id: string
        }
        Returns: undefined
      }
      revoke_company_member_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      run_reliability_jobs: { Args: never; Returns: Json }
      search_order_evidence: {
        Args: { p_kinds?: string[]; p_order_id: string; p_query?: string }
        Returns: {
          author_id: string
          body: string
          created_at: string
          id: string
          kind: string
          links: string[]
          photos: Json
          storage_path: string
          subtype: string
        }[]
      }
      set_order_payment_status: {
        Args: { p_note?: string; p_order_id: string; p_status: string }
        Returns: undefined
      }
      submit_survey_submission: {
        Args: {
          p_activity_id: string
          p_checklist?: Json
          p_evidence?: Json
          p_form_data?: Json
          p_measurements?: Json
          p_notes?: string
        }
        Returns: string
      }
      survey_decision_authority: {
        Args: { p_activity_id: string }
        Returns: string
      }
      tokenizable_words: { Args: { "": string }; Returns: string }
      waive_activity_prerequisite: {
        Args: { p_activity_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
