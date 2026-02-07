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
          created_at: string
          current_step: number
          discovered_topics: Json | null
          error_message: string | null
          factual_score: number | null
          generated_outline: string | null
          id: string
          mode: string
          model_used: string | null
          research_notes: string | null
          research_sources: Json | null
          started_at: string
          status: string
          token_usage: Json | null
          topic: string
          total_steps: number
        }
        Insert: {
          article_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: number
          discovered_topics?: Json | null
          error_message?: string | null
          factual_score?: number | null
          generated_outline?: string | null
          id?: string
          mode?: string
          model_used?: string | null
          research_notes?: string | null
          research_sources?: Json | null
          started_at?: string
          status?: string
          token_usage?: Json | null
          topic: string
          total_steps?: number
        }
        Update: {
          article_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: number
          discovered_topics?: Json | null
          error_message?: string | null
          factual_score?: number | null
          generated_outline?: string | null
          id?: string
          mode?: string
          model_used?: string | null
          research_notes?: string | null
          research_sources?: Json | null
          started_at?: string
          status?: string
          token_usage?: Json | null
          topic?: string
          total_steps?: number
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
      articles: {
        Row: {
          ai_generated: boolean
          author_id: string | null
          category_id: string | null
          content: string | null
          created_at: string
          excerpt: string | null
          featured: boolean
          featured_image: string | null
          id: string
          published_at: string | null
          read_time: number
          scheduled_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sources: Json | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          author_id?: string | null
          category_id?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          featured?: boolean
          featured_image?: string | null
          id?: string
          published_at?: string | null
          read_time?: number
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sources?: Json | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          author_id?: string | null
          category_id?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          featured?: boolean
          featured_image?: string | null
          id?: string
          published_at?: string | null
          read_time?: number
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sources?: Json | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
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
          articles_per_run: number
          created_at: string
          enabled: boolean
          frequency: string
          id: string
          last_run_at: string | null
          next_run_at: string | null
          target_categories: Json | null
          updated_at: string
        }
        Insert: {
          articles_per_run?: number
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          target_categories?: Json | null
          updated_at?: string
        }
        Update: {
          articles_per_run?: number
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          target_categories?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
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
