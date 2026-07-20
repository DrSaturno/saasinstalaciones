// Generado manualmente a partir de supabase/migrations/20260720000001_initial_schema.sql
// Regenerar (o revisar a mano) tras cada migración nueva.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "platform_admin" | "company_manager" | "installer";
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
export type OrderUpdateType = "checkin" | "progress" | "blocker" | "done" | "system";
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
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          email: string;
          token?: string;
          status?: InvitationStatus;
          created_at?: string;
          expires_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invitations"]["Insert"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          client_name: string;
          description: string;
          status: ProjectStatus;
          starts_at: string | null;
          ends_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          client_name?: string;
          description?: string;
          status?: ProjectStatus;
          starts_at?: string | null;
          ends_at?: string | null;
          created_at?: string;
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
          created_at: string;
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
          created_at?: string;
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
          assigned_installer_id: string | null;
          source: OrderSource;
          created_by: string | null;
          created_at: string;
          updated_at: string;
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
          assigned_installer_id?: string | null;
          source?: OrderSource;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_orders"]["Insert"]>;
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
    };
    Views: Record<string, never>;
    Functions: {
      accept_invitation: {
        Args: { p_token: string };
        Returns: void;
      };
      invitation_preview: {
        Args: { p_token: string };
        Returns: { company_name: string; email: string; valid: boolean }[];
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
