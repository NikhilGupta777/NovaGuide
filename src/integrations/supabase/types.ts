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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_logs: {
        Row: {
          action: string
          article_id: string | null
          created_at: string
          details: Json | null
          id: string
          status: string
        }
        Insert: {
          action: string
          article_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          status?: string
        }
        Update: {
          action?: string
          article_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_logs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          article_id: string | null
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          discovered_topics: Json | null
          error_message: string | null
          factual_score: number | null
          generated_outline: string | null
          id: string
          mode: string | null
          model_used: string | null
          quality_score: number | null
          research_notes: string | null
          research_sources: Json | null
          started_at: string | null
          status: string | null
          token_usage: Json | null
          topic: string | null
          total_steps: number | null
        }
        Insert: {
          article_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          discovered_topics?: Json | null
          error_message?: string | null
          factual_score?: number | null
          generated_outline?: string | null
          id?: string
          mode?: string | null
          model_used?: string | null
          quality_score?: number | null
          research_notes?: string | null
          research_sources?: Json | null
          started_at?: string | null
          status?: string | null
          token_usage?: Json | null
          topic?: string | null
          total_steps?: number | null
        }
        Update: {
          article_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          discovered_topics?: Json | null
          error_message?: string | null
          factual_score?: number | null
          generated_outline?: string | null
          id?: string
          mode?: string | null
          model_used?: string | null
          quality_score?: number | null
          research_notes?: string | null
          research_sources?: Json | null
          started_at?: string | null
          status?: string | null
          token_usage?: Json | null
          topic?: string | null
          total_steps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_feedback: {
        Row: {
          article_id: string
          created_at: string | null
          helpful: boolean
          id: string
        }
        Insert: {
          article_id: string
          created_at?: string | null
          helpful: boolean
          id?: string
        }
        Update: {
          article_id?: string
          created_at?: string | null
          helpful?: boolean
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          ai_generated: boolean | null
          author_id: string | null
          category_id: string | null
          content: string | null
          created_at: string | null
          excerpt: string | null
          featured: boolean | null
          featured_image: string | null
          id: string
          published_at: string | null
          read_time: number | null
          scheduled_at: string | null
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          slug: string
          sources: Json | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          ai_generated?: boolean | null
          author_id?: string | null
          category_id?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          featured?: boolean | null
          featured_image?: string | null
          id?: string
          published_at?: string | null
          read_time?: number | null
          scheduled_at?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sources?: Json | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          ai_generated?: boolean | null
          author_id?: string | null
          category_id?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          featured?: boolean | null
          featured_image?: string | null
          id?: string
          published_at?: string | null
          read_time?: number | null
          scheduled_at?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sources?: Json | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_generation_settings: {
        Row: {
          articles_per_run: number | null
          created_at: string | null
          enabled: boolean | null
          frequency: string | null
          id: string
          last_run_at: string | null
          next_run_at: string | null
          target_categories: Json | null
          updated_at: string | null
        }
        Insert: {
          articles_per_run?: number | null
          created_at?: string | null
          enabled?: boolean | null
          frequency?: string | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          target_categories?: Json | null
          updated_at?: string | null
        }
        Update: {
          articles_per_run?: number | null
          created_at?: string | null
          enabled?: boolean | null
          frequency?: string | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          target_categories?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          article_count: number | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          article_count?: number | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          article_count?: number | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          created_at: string | null
          email: string
          id: string
          message: string
          name: string
          read: boolean | null
          subject: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          message: string
          name: string
          read?: boolean | null
          subject: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
          read?: boolean | null
          subject?: string
        }
        Relationships: []
      }
      content_audit_findings: {
        Row: {
          article_id: string | null
          article_title: string | null
          auto_fixed: boolean | null
          created_at: string | null
          description: string
          fix_applied: string | null
          id: string
          issue_type: string
          related_article_id: string | null
          related_article_title: string | null
          run_id: string
          severity: string | null
          status: string | null
          suggestion: string | null
        }
        Insert: {
          article_id?: string | null
          article_title?: string | null
          auto_fixed?: boolean | null
          created_at?: string | null
          description: string
          fix_applied?: string | null
          id?: string
          issue_type: string
          related_article_id?: string | null
          related_article_title?: string | null
          run_id: string
          severity?: string | null
          status?: string | null
          suggestion?: string | null
        }
        Update: {
          article_id?: string | null
          article_title?: string | null
          auto_fixed?: boolean | null
          created_at?: string | null
          description?: string
          fix_applied?: string | null
          id?: string
          issue_type?: string
          related_article_id?: string | null
          related_article_title?: string | null
          run_id?: string
          severity?: string | null
          status?: string | null
          suggestion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_audit_findings_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_audit_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "content_audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_audit_runs: {
        Row: {
          articles_set_to_draft: number | null
          auto_fixes_applied: number | null
          completed_at: string | null
          created_at: string | null
          duplicates_found: number | null
          error_message: string | null
          fix_all_status: string | null
          id: string
          started_at: string | null
          status: string | null
          total_articles_scanned: number | null
          total_issues_found: number | null
        }
        Insert: {
          articles_set_to_draft?: number | null
          auto_fixes_applied?: number | null
          completed_at?: string | null
          created_at?: string | null
          duplicates_found?: number | null
          error_message?: string | null
          fix_all_status?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          total_articles_scanned?: number | null
          total_issues_found?: number | null
        }
        Update: {
          articles_set_to_draft?: number | null
          auto_fixes_applied?: number | null
          completed_at?: string | null
          created_at?: string | null
          duplicates_found?: number | null
          error_message?: string | null
          fix_all_status?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          total_articles_scanned?: number | null
          total_issues_found?: number | null
        }
        Relationships: []
      }
      discover_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          status: string
          topic_count: number
          topics: Json
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          status?: string
          topic_count?: number
          topics?: Json
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          status?: string
          topic_count?: number
          topics?: Json
        }
        Relationships: []
      }
      email_subscribers: {
        Row: {
          email: string
          id: string
          subscribed_at: string | null
        }
        Insert: {
          email: string
          id?: string
          subscribed_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          subscribed_at?: string | null
        }
        Relationships: []
      }
      nightly_builder_queue: {
        Row: {
          article_id: string | null
          batch_number: number | null
          category_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          priority: number | null
          run_date: string | null
          status: string | null
          topic: string
          updated_at: string | null
        }
        Insert: {
          article_id?: string | null
          batch_number?: number | null
          category_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          priority?: number | null
          run_date?: string | null
          status?: string | null
          topic: string
          updated_at?: string | null
        }
        Update: {
          article_id?: string | null
          batch_number?: number | null
          category_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          priority?: number | null
          run_date?: string | null
          status?: string | null
          topic?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nightly_builder_queue_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nightly_builder_queue_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      nightly_builder_runs: {
        Row: {
          articles_failed: number | null
          articles_generated: number | null
          articles_published: number | null
          batch_number: number | null
          categories_created: number | null
          completed_at: string | null
          created_at: string | null
          details: Json | null
          error_message: string | null
          id: string
          started_at: string | null
          status: string | null
          total_after_dedup: number | null
          total_categories_processed: number | null
          total_topics_found: number | null
          updated_at: string | null
        }
        Insert: {
          articles_failed?: number | null
          articles_generated?: number | null
          articles_published?: number | null
          batch_number?: number | null
          categories_created?: number | null
          completed_at?: string | null
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          total_after_dedup?: number | null
          total_categories_processed?: number | null
          total_topics_found?: number | null
          updated_at?: string | null
        }
        Update: {
          articles_failed?: number | null
          articles_generated?: number | null
          articles_published?: number | null
          batch_number?: number | null
          categories_created?: number | null
          completed_at?: string | null
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          total_after_dedup?: number | null
          total_categories_processed?: number | null
          total_topics_found?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      nightly_builder_settings: {
        Row: {
          allow_category_creation: boolean | null
          auto_publish_min_factual: number | null
          auto_publish_min_quality: number | null
          created_at: string | null
          enabled: boolean | null
          id: string
          last_run_at: string | null
          next_run_at: string | null
          stop_requested: boolean | null
          topics_per_category: number | null
          updated_at: string | null
        }
        Insert: {
          allow_category_creation?: boolean | null
          auto_publish_min_factual?: number | null
          auto_publish_min_quality?: number | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          stop_requested?: boolean | null
          topics_per_category?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_category_creation?: boolean | null
          auto_publish_min_factual?: number | null
          auto_publish_min_quality?: number | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          stop_requested?: boolean | null
          topics_per_category?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      get_recommended_articles: {
        Args: { _article_id: string; _limit?: number }
        Returns: {
          ai_generated: boolean | null
          author_id: string | null
          category_id: string | null
          content: string | null
          created_at: string | null
          excerpt: string | null
          featured: boolean | null
          featured_image: string | null
          id: string
          published_at: string | null
          read_time: number | null
          scheduled_at: string | null
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          slug: string
          sources: Json | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          view_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "articles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_nightly_counter: {
        Args: { _column: string; _run_id: string }
        Returns: undefined
      }
      increment_view_count: { Args: { _slug: string }; Returns: undefined }
      search_articles: {
        Args: { search_query: string }
        Returns: {
          ai_generated: boolean | null
          author_id: string | null
          category_id: string | null
          content: string | null
          created_at: string | null
          excerpt: string | null
          featured: boolean | null
          featured_image: string | null
          id: string
          published_at: string | null
          read_time: number | null
          scheduled_at: string | null
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          slug: string
          sources: Json | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          view_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "articles"
          isOneToOne: false
          isSetofReturn: true
        }
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
