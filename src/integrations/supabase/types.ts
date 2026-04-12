export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          accepts_commitment: string | null
          additional_notes: string | null
          ai_score: number | null
          brand_vibe: string | null
          business_name: string
          business_type: string
          city: string | null
          city_state: string | null
          country: string | null
          created_at: string
          decision_maker_status: string | null
          decline_reason: string | null
          email: string
          has_logo: string | null
          has_website: string
          id: string
          industry: string | null
          inspiration_urls: string | null
          is_decision_maker: boolean
          lead_temperature: string | null
          logo_file_url: string | null
          logo_url: string | null
          monthly_clients: string
          monthly_revenue: string | null
          name: string
          notes: string | null
          phone: string | null
          plan_interest: string | null
          restricted_niches: string | null
          state_province: string | null
          status: string | null
          update_frequency: string | null
          website_goal: string | null
          years_in_business: string
        }
        Insert: {
          accepts_commitment?: string | null
          additional_notes?: string | null
          ai_score?: number | null
          brand_vibe?: string | null
          business_name: string
          business_type: string
          city?: string | null
          city_state?: string | null
          country?: string | null
          created_at?: string
          decision_maker_status?: string | null
          decline_reason?: string | null
          email: string
          has_logo?: string | null
          has_website: string
          id?: string
          industry?: string | null
          inspiration_urls?: string | null
          is_decision_maker?: boolean
          lead_temperature?: string | null
          logo_file_url?: string | null
          logo_url?: string | null
          monthly_clients: string
          monthly_revenue?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          plan_interest?: string | null
          restricted_niches?: string | null
          state_province?: string | null
          status?: string | null
          update_frequency?: string | null
          website_goal?: string | null
          years_in_business: string
        }
        Update: {
          accepts_commitment?: string | null
          additional_notes?: string | null
          ai_score?: number | null
          brand_vibe?: string | null
          business_name?: string
          business_type?: string
          city?: string | null
          city_state?: string | null
          country?: string | null
          created_at?: string
          decision_maker_status?: string | null
          decline_reason?: string | null
          email?: string
          has_logo?: string | null
          has_website?: string
          id?: string
          industry?: string | null
          inspiration_urls?: string | null
          is_decision_maker?: boolean
          lead_temperature?: string | null
          logo_file_url?: string | null
          logo_url?: string | null
          monthly_clients?: string
          monthly_revenue?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          plan_interest?: string | null
          restricted_niches?: string | null
          state_province?: string | null
          status?: string | null
          update_frequency?: string | null
          website_goal?: string | null
          years_in_business?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_table: string | null
          user_email: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_table?: string | null
          user_email?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_table?: string | null
          user_email?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      change_requests: {
        Row: {
          admin_notes: string | null
          ai_processed: boolean | null
          assigned_to: string | null
          attachment_url: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          id: string
          request_text: string
          status: string | null
        }
        Insert: {
          admin_notes?: string | null
          ai_processed?: boolean | null
          assigned_to?: string | null
          attachment_url?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          request_text: string
          status?: string | null
        }
        Update: {
          admin_notes?: string | null
          ai_processed?: boolean | null
          assigned_to?: string | null
          attachment_url?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          request_text?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          application_id: string | null
          business_name: string
          business_type: string
          created_at: string
          id: string
          join_date: string | null
          last_active: string | null
          next_billing_date: string | null
          plan: string
          site_status: string | null
          site_url: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updates_limit: number | null
          updates_used_this_month: number | null
          user_id: string | null
        }
        Insert: {
          application_id?: string | null
          business_name: string
          business_type: string
          created_at?: string
          id?: string
          join_date?: string | null
          last_active?: string | null
          next_billing_date?: string | null
          plan?: string
          site_status?: string | null
          site_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updates_limit?: number | null
          updates_used_this_month?: number | null
          user_id?: string | null
        }
        Update: {
          application_id?: string | null
          business_name?: string
          business_type?: string
          created_at?: string
          id?: string
          join_date?: string | null
          last_active?: string | null
          next_billing_date?: string | null
          plan?: string
          site_status?: string | null
          site_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updates_limit?: number | null
          updates_used_this_month?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      emails_log: {
        Row: {
          application_id: string | null
          client_id: string | null
          created_at: string
          email_type: string
          id: string
          recipient_email: string
          status: string | null
        }
        Insert: {
          application_id?: string | null
          client_id?: string | null
          created_at?: string
          email_type: string
          id?: string
          recipient_email: string
          status?: string | null
        }
        Update: {
          application_id?: string | null
          client_id?: string | null
          created_at?: string
          email_type?: string
          id?: string
          recipient_email?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          brand_vibe: string | null
          business_type: string | null
          client_id: string
          created_at: string
          deploy_url: string | null
          id: string
          intake_data: Json | null
          last_updated: string | null
          logo_url: string | null
          primary_color: string | null
          staging_url: string | null
          template_used: string | null
        }
        Insert: {
          brand_vibe?: string | null
          business_type?: string | null
          client_id: string
          created_at?: string
          deploy_url?: string | null
          id?: string
          intake_data?: Json | null
          last_updated?: string | null
          logo_url?: string | null
          primary_color?: string | null
          staging_url?: string | null
          template_used?: string | null
        }
        Update: {
          brand_vibe?: string | null
          business_type?: string | null
          client_id?: string
          created_at?: string
          deploy_url?: string | null
          id?: string
          intake_data?: Json | null
          last_updated?: string | null
          logo_url?: string | null
          primary_color?: string | null
          staging_url?: string | null
          template_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          can_handle_change_requests: boolean
          can_review_applications: boolean
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          can_handle_change_requests?: boolean
          can_review_applications?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          can_handle_change_requests?: boolean
          can_review_applications?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
