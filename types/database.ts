// Generado manualmente a partir de supabase/migrations/20260720000001_initial_schema.sql
// Regenerar (o revisar a mano) tras cada migración nueva.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole =
  | "platform_admin"
  | "company_manager"
  | "coordinator"
  | "installer";
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
export type OrderUpdateType = "checkin" | "progress" | "blocker" | "done" | "system";
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
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "resolved";
export type InvitationStatus = "pending" | "accepted" | "expired";
export type RosterStatus = "invited" | "active" | "removed";
export type BroadcastStatus = "open" | "closed";
export type ApplicationStatus = "applied" | "accepted" | "rejected";
export type SiteStatus =
  | "sin_ordenes"
  | "pendiente"
  | "planificada"
  | "en_proceso"
  | "finalizada";

// supabase-js infiere los tipos de consulta a partir de esta forma exacta:
// cada tabla necesita `Relationships` y el schema necesita
// `Views`/`Functions`/`Enums`/`CompositeTypes`, o el typing colapsa a `never`.
export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          country: Country;
          status: CompanyStatus;
          logo_url: string | null;
          order_prefix: string;
          order_seq: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          country: Country;
          status?: CompanyStatus;
          logo_url?: string | null;
          order_prefix?: string;
          order_seq?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["companies"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          company_id: string | null;
          full_name: string;
          phone: string | null;
          locale: Locale;
          created_at: string;
        };
        Insert: {
          id: string;
          role: UserRole;
          company_id?: string | null;
          full_name?: string;
          phone?: string | null;
          locale?: Locale;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      installers: {
        Row: {
          id: string;
          zones: string[];
          skills: string[];
          rating_avg: number;
          rating_count: number;
          available: boolean;
        };
        Insert: {
          id: string;
          zones?: string[];
          skills?: string[];
          rating_avg?: number;
          rating_count?: number;
          available?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["installers"]["Insert"]>;
        Relationships: [];
      };
      company_installers: {
        Row: {
          company_id: string;
          installer_id: string;
          status: RosterStatus;
          invited_at: string;
          joined_at: string | null;
        };
        Insert: {
          company_id: string;
          installer_id: string;
          status?: RosterStatus;
          invited_at?: string;
          joined_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["company_installers"]["Insert"]>;
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          company_id: string;
          email: string;
          token: string;
          status: InvitationStatus;
          role: "installer" | "coordinator";
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          email: string;
          token?: string;
          status?: InvitationStatus;
          role?: "installer" | "coordinator";
          created_at?: string;
          expires_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invitations"]["Insert"]>;
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          tax_id: string;
          contact_name: string;
          email: string;
          phone: string;
          address: string;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          tax_id?: string;
          contact_name?: string;
          email?: string;
          phone?: string;
          address?: string;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          client_name: string;
          client_id: string | null;
          coordinator_id: string | null;
          description: string;
          status: ProjectStatus;
          starts_at: string | null;
          ends_at: string | null;
          country: Country;
          zones: string[];
          planned_installations: number;
          billing_mode: BillingMode;
          contract_amount: number | null;
          currency: OrderCurrency;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          client_name?: string;
          client_id?: string | null;
          coordinator_id?: string | null;
          description?: string;
          status?: ProjectStatus;
          starts_at?: string | null;
          ends_at?: string | null;
          country?: Country;
          zones?: string[];
          planned_installations?: number;
          billing_mode?: BillingMode;
          contract_amount?: number | null;
          currency?: OrderCurrency;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
      };
      sites: {
        Row: {
          id: string;
          project_id: string;
          company_id: string;
          name: string;
          address: string;
          city: string;
          state: string;
          zone: string;
          lat: number | null;
          lng: number | null;
          status: SiteStatus;
          external_ref: string | null;
          archived_at: string | null;
          contact_name: string;
          contact_phone: string;
          contact_email: string;
          opening_hours: string;
          access_notes: string;
          parking_notes: string;
          technical_notes: string;
          risk_notes: string;
          permanent_notes: string;
          is_placeholder: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          company_id: string;
          name: string;
          address?: string;
          city?: string;
          state?: string;
          zone?: string;
          lat?: number | null;
          lng?: number | null;
          status?: SiteStatus;
          external_ref?: string | null;
          archived_at?: string | null;
          contact_name?: string;
          contact_phone?: string;
          contact_email?: string;
          opening_hours?: string;
          access_notes?: string;
          parking_notes?: string;
          technical_notes?: string;
          risk_notes?: string;
          permanent_notes?: string;
          is_placeholder?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sites"]["Insert"]>;
        Relationships: [];
      };
      work_orders: {
        Row: {
          id: string;
          order_number: string;
          site_id: string;
          project_id: string;
          company_id: string;
          title: string;
          description: string;
          status: OrderStatus;
          scheduled_date: string | null;
          scheduled_end_date: string | null;
          priority: OrderPriority;
          indoor: boolean;
          requires_freight: boolean;
          freight_details: string;
          logistics_notes: string;
          amount: number | null;
          currency: OrderCurrency;
          assigned_installer_id: string | null;
          assigned_at: string | null;
          original_scheduled_date: string | null;
          reschedule_count: number;
          visit_count: number;
          source: OrderSource;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          finalized_at: string | null;
        };
        Insert: {
          id?: string;
          order_number?: string;
          site_id: string;
          project_id: string;
          company_id: string;
          title: string;
          description?: string;
          status?: OrderStatus;
          scheduled_date?: string | null;
          scheduled_end_date?: string | null;
          priority?: OrderPriority;
          indoor?: boolean;
          requires_freight?: boolean;
          freight_details?: string;
          logistics_notes?: string;
          amount?: number | null;
          currency?: OrderCurrency;
          assigned_installer_id?: string | null;
          assigned_at?: string | null;
          original_scheduled_date?: string | null;
          reschedule_count?: number;
          visit_count?: number;
          source?: OrderSource;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          finalized_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["work_orders"]["Insert"]>;
        Relationships: [];
      };
      order_incidents: {
        Row: {
          id: string;
          order_id: string;
          company_id: string;
          category: IncidentCategory;
          severity: IncidentSeverity;
          description: string;
          requires_revisit: boolean;
          status: IncidentStatus;
          created_by: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          company_id: string;
          category: IncidentCategory;
          severity?: IncidentSeverity;
          description?: string;
          requires_revisit?: boolean;
          status?: IncidentStatus;
          created_by?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_incidents"]["Insert"]>;
        Relationships: [];
      };
      order_attachments: {
        Row: {
          id: string;
          order_id: string;
          company_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          company_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["order_attachments"]["Insert"]
        >;
        Relationships: [];
      };
      site_attachments: {
        Row: {
          id: string;
          site_id: string;
          company_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          company_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["site_attachments"]["Insert"]>;
        Relationships: [];
      };
      order_updates: {
        Row: {
          id: string;
          order_id: string;
          company_id: string;
          installer_id: string | null;
          type: OrderUpdateType;
          note: string;
          photos: Json;
          client_created_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          order_id: string;
          company_id: string;
          installer_id?: string | null;
          type: OrderUpdateType;
          note?: string;
          photos?: Json;
          client_created_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_updates"]["Insert"]>;
        Relationships: [];
      };
      broadcasts: {
        Row: {
          id: string;
          company_id: string;
          project_id: string | null;
          zone: string;
          title: string;
          description: string;
          slots: number;
          status: BroadcastStatus;
          scheduled_date: string | null;
          scheduled_end_date: string | null;
          requirements: string;
          logistics_notes: string;
          pay_visible: boolean;
          pay_amount: number | null;
          currency: OrderCurrency;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          project_id?: string | null;
          zone: string;
          title: string;
          description?: string;
          slots?: number;
          status?: BroadcastStatus;
          scheduled_date?: string | null;
          scheduled_end_date?: string | null;
          requirements?: string;
          logistics_notes?: string;
          pay_visible?: boolean;
          pay_amount?: number | null;
          currency?: OrderCurrency;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["broadcasts"]["Insert"]>;
        Relationships: [];
      };
      broadcast_applications: {
        Row: {
          broadcast_id: string;
          installer_id: string;
          status: ApplicationStatus;
          message: string | null;
          created_at: string;
        };
        Insert: {
          broadcast_id: string;
          installer_id: string;
          status?: ApplicationStatus;
          message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["broadcast_applications"]["Insert"]>;
        Relationships: [];
      };
      chat_threads: {
        Row: {
          id: string;
          company_id: string;
          installer_id: string;
          created_at: string;
          last_message_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          installer_id: string;
          created_at?: string;
          last_message_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_threads"]["Insert"]>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          company_id: string;
          sender_id: string;
          body: string;
          attachments: Json;
          reply_to_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          thread_id: string;
          company_id: string;
          sender_id: string;
          body?: string;
          attachments?: Json;
          reply_to_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_messages"]["Insert"]>;
        Relationships: [];
      };
      chat_message_reads: {
        Row: {
          message_id: string;
          company_id: string;
          user_id: string;
          read_at: string;
        };
        Insert: {
          message_id: string;
          company_id: string;
          user_id: string;
          read_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["chat_message_reads"]["Insert"]
        >;
        Relationships: [];
      };
      ratings: {
        Row: {
          id: string;
          order_id: string;
          company_id: string;
          installer_id: string;
          stars: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          company_id: string;
          installer_id: string;
          stars: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ratings"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          data: Json;
          read_at: string | null;
          push_sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body?: string;
          data?: Json;
          read_at?: string | null;
          push_sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          user_id: string;
          endpoint: string;
          keys: Json;
          created_at: string;
        };
        Insert: {
          user_id: string;
          endpoint: string;
          keys: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Insert"]>;
        Relationships: [];
      };
      order_sequences: {
        Row: {
          company_id: string;
          zone_code: string;
          current_value: number;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          zone_code: string;
          current_value: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_sequences"]["Insert"]>;
        Relationships: [];
      };
      installer_weekly_availability: {
        Row: {
          id: string;
          company_id: string;
          installer_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          timezone: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          installer_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          timezone?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["installer_weekly_availability"]["Insert"]>;
        Relationships: [];
      };
      installer_unavailability: {
        Row: {
          id: string;
          company_id: string;
          installer_id: string;
          starts_at: string;
          ends_at: string;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          installer_id: string;
          starts_at: string;
          ends_at: string;
          reason: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["installer_unavailability"]["Insert"]>;
        Relationships: [];
      };
      calendar_connections: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          google_email: string;
          calendar_id: string;
          encrypted_access_token: string;
          encrypted_refresh_token: string;
          token_expires_at: string | null;
          connected_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          google_email?: string;
          calendar_id?: string;
          encrypted_access_token: string;
          encrypted_refresh_token: string;
          token_expires_at?: string | null;
          connected_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["calendar_connections"]["Insert"]>;
        Relationships: [];
      };
      calendar_order_events: {
        Row: {
          id: string;
          company_id: string;
          connection_id: string;
          order_id: string;
          google_event_id: string;
          last_synced_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          connection_id: string;
          order_id: string;
          google_event_id: string;
          last_synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["calendar_order_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_invitation: {
        Args: { p_token: string };
        Returns: void;
      };
      invitation_preview: {
        Args: { p_token: string };
        Returns: {
          company_name: string;
          email: string;
          valid: boolean;
          invite_role: "installer" | "coordinator";
          company_id: string;
        }[];
      };
      can_operate_project: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
      accept_broadcast_application: {
        Args: {
          p_broadcast_id: string;
          p_installer_id: string;
          p_order_ids?: string[];
        };
        Returns: void;
      };
      reject_broadcast_application: {
        Args: { p_broadcast_id: string; p_installer_id: string };
        Returns: void;
      };
      close_broadcast: {
        Args: { p_broadcast_id: string };
        Returns: void;
      };
      installer_can_read_broadcast: {
        Args: { p_broadcast_id: string };
        Returns: boolean;
      };
      replace_installer_weekly_availability: {
        Args: { p_company_id: string; p_entries: Json };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
