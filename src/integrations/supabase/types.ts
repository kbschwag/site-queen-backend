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
      analytics_daily_summary: {
        Row: {
          client_id: string
          cta_clicks: number
          date: string
          form_submissions: number
          id: string
          page_views: number
          phone_clicks: number
          unique_sessions: number
        }
        Insert: {
          client_id: string
          cta_clicks?: number
          date: string
          form_submissions?: number
          id?: string
          page_views?: number
          phone_clicks?: number
          unique_sessions?: number
        }
        Update: {
          client_id?: string
          cta_clicks?: number
          date?: string
          form_submissions?: number
          id?: string
          page_views?: number
          phone_clicks?: number
          unique_sessions?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_daily_summary_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          client_id: string
          country: string | null
          created_at: string
          device_type: string | null
          event_type: string
          id: string
          metadata: Json | null
          page_path: string | null
          page_title: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          client_id: string
          country?: string | null
          created_at?: string
          device_type?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          client_id?: string
          country?: string | null
          created_at?: string
          device_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          accepts_commitment: string | null
          additional_notes: string | null
          ai_score: number | null
          approval_note: string | null
          approved_by: string | null
          brand_vibe: string | null
          business_name: string
          business_type: string
          city: string | null
          city_state: string | null
          country: string | null
          created_at: string
          decision_maker_status: string | null
          decline_note: string | null
          decline_reason: string | null
          declined_by: string | null
          deleted_at: string | null
          deleted_by: string | null
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
          approval_note?: string | null
          approved_by?: string | null
          brand_vibe?: string | null
          business_name: string
          business_type: string
          city?: string | null
          city_state?: string | null
          country?: string | null
          created_at?: string
          decision_maker_status?: string | null
          decline_note?: string | null
          decline_reason?: string | null
          declined_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          approval_note?: string | null
          approved_by?: string | null
          brand_vibe?: string | null
          business_name?: string
          business_type?: string
          city?: string | null
          city_state?: string | null
          country?: string | null
          created_at?: string
          decision_maker_status?: string | null
          decline_note?: string | null
          decline_reason?: string | null
          declined_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          assessed_by_operator: boolean | null
          assigned_to: string | null
          attachment_url: string | null
          change_type: string | null
          client_id: string
          client_info_attachments: string[] | null
          client_info_response: string | null
          completed_at: string | null
          created_at: string
          credit_purchase_id: string | null
          credits_cost: number | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_pre_launch: boolean | null
          needs_info_note: string | null
          operator_notes: string | null
          priority: string | null
          request_text: string
          status: string | null
        }
        Insert: {
          admin_notes?: string | null
          ai_processed?: boolean | null
          assessed_by_operator?: boolean | null
          assigned_to?: string | null
          attachment_url?: string | null
          change_type?: string | null
          client_id: string
          client_info_attachments?: string[] | null
          client_info_response?: string | null
          completed_at?: string | null
          created_at?: string
          credit_purchase_id?: string | null
          credits_cost?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_pre_launch?: boolean | null
          needs_info_note?: string | null
          operator_notes?: string | null
          priority?: string | null
          request_text: string
          status?: string | null
        }
        Update: {
          admin_notes?: string | null
          ai_processed?: boolean | null
          assessed_by_operator?: boolean | null
          assigned_to?: string | null
          attachment_url?: string | null
          change_type?: string | null
          client_id?: string
          client_info_attachments?: string[] | null
          client_info_response?: string | null
          completed_at?: string | null
          created_at?: string
          credit_purchase_id?: string | null
          credits_cost?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_pre_launch?: boolean | null
          needs_info_note?: string | null
          operator_notes?: string | null
          priority?: string | null
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
      change_types: {
        Row: {
          active: boolean | null
          category: string
          credits_cost: number
          description: string | null
          examples: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          category: string
          credits_cost: number
          description?: string | null
          examples?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          category?: string
          credits_cost?: number
          description?: string | null
          examples?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          application_id: string | null
          business_name: string
          business_type: string
          created_at: string
          credits_balance: number | null
          credits_last_reset: string | null
          credits_monthly_allowance: number | null
          credits_rollover_cap: number | null
          deleted_at: string | null
          deleted_by: string | null
          deploy_count: number | null
          deployment_path_confirmed: boolean | null
          domain_checklist: Json | null
          domain_name: string | null
          domain_status: string | null
          email_hosting_notes: string | null
          hostinger_folder_path: string | null
          id: string
          intake_completed: boolean
          join_date: string | null
          last_active: string | null
          next_billing_date: string | null
          payment_failed_at: string | null
          payment_failed_count: number | null
          payment_status: string | null
          phone_number: string | null
          plan: string
          site_status: string | null
          site_url: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          suspension_date: string | null
          updates_limit: number | null
          updates_used_this_month: number | null
          user_id: string | null
        }
        Insert: {
          application_id?: string | null
          business_name: string
          business_type: string
          created_at?: string
          credits_balance?: number | null
          credits_last_reset?: string | null
          credits_monthly_allowance?: number | null
          credits_rollover_cap?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          deploy_count?: number | null
          deployment_path_confirmed?: boolean | null
          domain_checklist?: Json | null
          domain_name?: string | null
          domain_status?: string | null
          email_hosting_notes?: string | null
          hostinger_folder_path?: string | null
          id?: string
          intake_completed?: boolean
          join_date?: string | null
          last_active?: string | null
          next_billing_date?: string | null
          payment_failed_at?: string | null
          payment_failed_count?: number | null
          payment_status?: string | null
          phone_number?: string | null
          plan?: string
          site_status?: string | null
          site_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          suspension_date?: string | null
          updates_limit?: number | null
          updates_used_this_month?: number | null
          user_id?: string | null
        }
        Update: {
          application_id?: string | null
          business_name?: string
          business_type?: string
          created_at?: string
          credits_balance?: number | null
          credits_last_reset?: string | null
          credits_monthly_allowance?: number | null
          credits_rollover_cap?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          deploy_count?: number | null
          deployment_path_confirmed?: boolean | null
          domain_checklist?: Json | null
          domain_name?: string | null
          domain_status?: string | null
          email_hosting_notes?: string | null
          hostinger_folder_path?: string | null
          id?: string
          intake_completed?: boolean
          join_date?: string | null
          last_active?: string | null
          next_billing_date?: string | null
          payment_failed_at?: string | null
          payment_failed_count?: number | null
          payment_status?: string | null
          phone_number?: string | null
          plan?: string
          site_status?: string | null
          site_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          suspension_date?: string | null
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
      credit_packages: {
        Row: {
          active: boolean | null
          credits: number
          id: string
          name: string
          price_cents: number
          stripe_price_id: string | null
        }
        Insert: {
          active?: boolean | null
          credits: number
          id?: string
          name: string
          price_cents: number
          stripe_price_id?: string | null
        }
        Update: {
          active?: boolean | null
          credits?: number
          id?: string
          name?: string
          price_cents?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      credits_transactions: {
        Row: {
          change_request_id: string | null
          client_id: string | null
          created_at: string | null
          credits_amount: number
          credits_balance_after: number
          description: string | null
          id: string
          stripe_payment_intent_id: string | null
          transaction_type: string
        }
        Insert: {
          change_request_id?: string | null
          client_id?: string | null
          created_at?: string | null
          credits_amount: number
          credits_balance_after: number
          description?: string | null
          id?: string
          stripe_payment_intent_id?: string | null
          transaction_type: string
        }
        Update: {
          change_request_id?: string | null
          client_id?: string | null
          created_at?: string | null
          credits_amount?: number
          credits_balance_after?: number
          description?: string | null
          id?: string
          stripe_payment_intent_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_transactions_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      generation_logs: {
        Row: {
          client_id: string
          created_at: string
          error_message: string | null
          id: string
          status: string
          template_id: string | null
          tokens_used: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          template_id?: string | null
          tokens_used?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          template_id?: string | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          client_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          message: string
          read: boolean
          staging_url: string | null
          target_role: string
          type: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          message: string
          read?: boolean
          staging_url?: string | null
          target_role?: string
          type: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          message?: string
          read?: boolean
          staging_url?: string | null
          target_role?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount_cents: number | null
          client_id: string | null
          created_at: string | null
          currency: string | null
          event_type: string
          failure_reason: string | null
          id: string
          resolved: boolean | null
          resolved_at: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          warning_1_sent_at: string | null
          warning_2_sent_at: string | null
          warning_3_sent_at: string | null
        }
        Insert: {
          amount_cents?: number | null
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          event_type: string
          failure_reason?: string | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          warning_1_sent_at?: string | null
          warning_2_sent_at?: string | null
          warning_3_sent_at?: string | null
        }
        Update: {
          amount_cents?: number | null
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          event_type?: string
          failure_reason?: string | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          warning_1_sent_at?: string | null
          warning_2_sent_at?: string | null
          warning_3_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_client_id_fkey"
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
      scheduled_emails: {
        Row: {
          cancelled: boolean | null
          client_id: string | null
          created_at: string | null
          email_type: string
          id: string
          payload: Json | null
          recipient_email: string
          send_at: string
          sent: boolean | null
          sent_at: string | null
        }
        Insert: {
          cancelled?: boolean | null
          client_id?: string | null
          created_at?: string | null
          email_type: string
          id?: string
          payload?: Json | null
          recipient_email: string
          send_at: string
          sent?: boolean | null
          sent_at?: string | null
        }
        Update: {
          cancelled?: boolean | null
          client_id?: string | null
          created_at?: string | null
          email_type?: string
          id?: string
          payload?: Json | null
          recipient_email?: string
          send_at?: string
          sent?: boolean | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          brand_vibe: string | null
          business_type: string | null
          client_id: string
          created_at: string
          deploy_count: number | null
          deploy_url: string | null
          generated_at: string | null
          generation_error: string | null
          generation_status: string | null
          id: string
          intake_data: Json | null
          last_deployed_at: string | null
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
          deploy_count?: number | null
          deploy_url?: string | null
          generated_at?: string | null
          generation_error?: string | null
          generation_status?: string | null
          id?: string
          intake_data?: Json | null
          last_deployed_at?: string | null
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
          deploy_count?: number | null
          deploy_url?: string | null
          generated_at?: string | null
          generation_error?: string | null
          generation_status?: string | null
          id?: string
          intake_data?: Json | null
          last_deployed_at?: string | null
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
      increment_analytics_summary: {
        Args: { p_client_id: string; p_date: string; p_event_type: string }
        Returns: undefined
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
