export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          input_tokens: number | null
          kind: string
          output_tokens: number | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          kind: string
          output_tokens?: number | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          kind?: string
          output_tokens?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_states: {
        Row: {
          card_id: string
          deck_id: string
          difficulty: number
          due_at: string
          lapses: number
          last_reviewed_at: string | null
          learning_steps: number
          phase: Database["public"]["Enums"]["card_phase"]
          reps: number
          seen_version: number
          stability: number
          user_id: string
        }
        Insert: {
          card_id: string
          deck_id: string
          difficulty?: number
          due_at?: string
          lapses?: number
          last_reviewed_at?: string | null
          learning_steps?: number
          phase?: Database["public"]["Enums"]["card_phase"]
          reps?: number
          seen_version?: number
          stability?: number
          user_id: string
        }
        Update: {
          card_id?: string
          deck_id?: string
          difficulty?: number
          due_at?: string
          lapses?: number
          last_reviewed_at?: string | null
          learning_steps?: number
          phase?: Database["public"]["Enums"]["card_phase"]
          reps?: number
          seen_version?: number
          stability?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_states_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_states_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          back_json: Json
          back_text: string
          complexity: number
          content_version: number
          created_at: string
          deck_id: string
          front_json: Json
          front_text: string
          id: string
          position: number
          source_card_id: string | null
          updated_at: string
        }
        Insert: {
          back_json: Json
          back_text?: string
          complexity?: number
          content_version?: number
          created_at?: string
          deck_id: string
          front_json: Json
          front_text?: string
          id?: string
          position?: number
          source_card_id?: string | null
          updated_at?: string
        }
        Update: {
          back_json?: Json
          back_text?: string
          complexity?: number
          content_version?: number
          created_at?: string
          deck_id?: string
          front_json?: Json
          front_text?: string
          id?: string
          position?: number
          source_card_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_source_card_id_fkey"
            columns: ["source_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      course_subscriptions: {
        Row: {
          course_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_subscriptions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string | null
          created_at: string
          degree_id: string | null
          deleted_at: string | null
          fork_count: number
          id: string
          institution_id: string | null
          language: string
          name: string
          owner_id: string
          slug: string
          source_course_id: string | null
          subscriber_count: number
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          code?: string | null
          created_at?: string
          degree_id?: string | null
          deleted_at?: string | null
          fork_count?: number
          id?: string
          institution_id?: string | null
          language?: string
          name: string
          owner_id: string
          slug: string
          source_course_id?: string | null
          subscriber_count?: number
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          code?: string | null
          created_at?: string
          degree_id?: string | null
          deleted_at?: string | null
          fork_count?: number
          id?: string
          institution_id?: string | null
          language?: string
          name?: string
          owner_id?: string
          slug?: string
          source_course_id?: string | null
          subscriber_count?: number
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "courses_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_source_course_id_fkey"
            columns: ["source_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_subscriptions: {
        Row: {
          created_at: string
          deck_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_subscriptions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          course_id: string | null
          created_at: string
          desired_retention: number | null
          fork_count: number
          id: string
          new_cards_per_day: number
          note_id: string | null
          owner_id: string
          slug: string
          source_deck_id: string | null
          subscriber_count: number
          title: string
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          desired_retention?: number | null
          fork_count?: number
          id?: string
          new_cards_per_day?: number
          note_id?: string | null
          owner_id: string
          slug: string
          source_deck_id?: string | null
          subscriber_count?: number
          title: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          course_id?: string | null
          created_at?: string
          desired_retention?: number | null
          fork_count?: number
          id?: string
          new_cards_per_day?: number
          note_id?: string | null
          owner_id?: string
          slug?: string
          source_deck_id?: string | null
          subscriber_count?: number
          title?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "decks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_source_deck_id_fkey"
            columns: ["source_deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      degrees: {
        Row: {
          id: string
          institution_id: string
          name: string
          slug: string
        }
        Insert: {
          id?: string
          institution_id: string
          name: string
          slug: string
        }
        Update: {
          id?: string
          institution_id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "degrees_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      fsrs_parameters: {
        Row: {
          updated_at: string
          user_id: string
          weights: number[]
        }
        Insert: {
          updated_at?: string
          user_id: string
          weights: number[]
        }
        Update: {
          updated_at?: string
          user_id?: string
          weights?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "fsrs_parameters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_requests: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          resolved_institution_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          resolved_institution_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          resolved_institution_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_requests_resolved_institution_id_fkey"
            columns: ["resolved_institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          country: string
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          country: string
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          content_json: Json
          content_text: string
          course_id: string | null
          created_at: string
          id: string
          language: string
          owner_id: string
          published_at: string | null
          slug: string
          source_note_id: string | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          content_json?: Json
          content_text?: string
          course_id?: string | null
          created_at?: string
          id?: string
          language?: string
          owner_id: string
          published_at?: string | null
          slug: string
          source_note_id?: string | null
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          content_json?: Json
          content_text?: string
          course_id?: string | null
          created_at?: string
          id?: string
          language?: string
          owner_id?: string
          published_at?: string | null
          slug?: string
          source_note_id?: string | null
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "notes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_source_note_id_fkey"
            columns: ["source_note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          degree_id: string | null
          desired_retention: number
          display_name: string
          handle: string
          id: string
          institution_id: string | null
          is_pro: boolean
          keyboard_shortcuts_enabled: boolean
          locale: string
          slug: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          degree_id?: string | null
          desired_retention?: number
          display_name: string
          handle: string
          id: string
          institution_id?: string | null
          is_pro?: boolean
          keyboard_shortcuts_enabled?: boolean
          locale?: string
          slug: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          degree_id?: string | null
          desired_retention?: number
          display_name?: string
          handle?: string
          id?: string
          institution_id?: string | null
          is_pro?: boolean
          keyboard_shortcuts_enabled?: boolean
          locale?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_logs: {
        Row: {
          card_id: string
          edited_during_review: boolean
          elapsed_days: number
          elapsed_ms: number | null
          id: number
          phase: Database["public"]["Enums"]["card_phase"]
          rating: Database["public"]["Enums"]["review_rating"]
          review_difficulty: number
          review_stability: number
          reviewed_at: string
          scheduled_days: number
          user_id: string
        }
        Insert: {
          card_id: string
          edited_during_review?: boolean
          elapsed_days: number
          elapsed_ms?: number | null
          id?: number
          phase: Database["public"]["Enums"]["card_phase"]
          rating: Database["public"]["Enums"]["review_rating"]
          review_difficulty: number
          review_stability: number
          reviewed_at?: string
          scheduled_days: number
          user_id: string
        }
        Update: {
          card_id?: string
          edited_during_review?: boolean
          elapsed_days?: number
          elapsed_ms?: number | null
          id?: number
          phase?: Database["public"]["Enums"]["card_phase"]
          rating?: Database["public"]["Enums"]["review_rating"]
          review_difficulty?: number
          review_stability?: number
          reviewed_at?: string
          scheduled_days?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_logs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      streaks: {
        Row: {
          current_streak: number
          last_active_date: string | null
          longest_streak: number
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_active_date?: string | null
          longest_streak?: number
          user_id: string
        }
        Update: {
          current_streak?: number
          last_active_date?: string | null
          longest_streak?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_api_keys: {
        Row: {
          ciphertext: string
          created_at: string
          iv: string
          last_four: string
          provider: Database["public"]["Enums"]["ai_provider"]
          user_id: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          iv: string
          last_four: string
          provider: Database["public"]["Enums"]["ai_provider"]
          user_id: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          iv?: string
          last_four?: string
          provider?: Database["public"]["Enums"]["ai_provider"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_card_change: {
        Args: { p_card_id: string; p_reset: boolean }
        Returns: undefined
      }
      apply_review: {
        Args: {
          p_card_id: string
          p_difficulty: number
          p_due_at: string
          p_edited_during_review: boolean
          p_elapsed_days: number
          p_elapsed_ms: number
          p_lapses: number
          p_learning_steps: number
          p_phase: Database["public"]["Enums"]["card_phase"]
          p_phase_before: Database["public"]["Enums"]["card_phase"]
          p_rating: Database["public"]["Enums"]["review_rating"]
          p_review_difficulty: number
          p_review_stability: number
          p_scheduled_days: number
          p_stability: number
        }
        Returns: undefined
      }
      claim_profile_slug: { Args: { p_base: string }; Returns: string }
      create_profile: {
        Args: {
          p_avatar_url: string
          p_degree_id: string
          p_display_name: string
          p_institution_id: string
          p_locale: string
        }
        Returns: {
          avatar_url: string | null
          created_at: string
          degree_id: string | null
          desired_retention: number
          display_name: string
          handle: string
          id: string
          institution_id: string | null
          is_pro: boolean
          keyboard_shortcuts_enabled: boolean
          locale: string
          slug: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fork_course: {
        Args: { p_course_id: string }
        Returns: Database["public"]["CompositeTypes"]["fork_result"]
        SetofOptions: {
          from: "*"
          to: "fork_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fork_deck: {
        Args: { p_deck_id: string }
        Returns: Database["public"]["CompositeTypes"]["fork_result"]
        SetofOptions: {
          from: "*"
          to: "fork_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      profile_slug_base: { Args: { p_base: string }; Returns: string }
      slugify: { Args: { p_input: string }; Returns: string }
      subscribe_to_course: { Args: { p_course_id: string }; Returns: undefined }
      subscribe_to_deck: { Args: { p_deck_id: string }; Returns: undefined }
    }
    Enums: {
      ai_provider: "openai" | "google" | "anthropic"
      card_phase: "new" | "learning" | "review" | "relearning"
      review_rating: "again" | "hard" | "good" | "easy"
      visibility: "public" | "unlisted" | "private"
    }
    CompositeTypes: {
      fork_result: {
        course_id: string | null
        deck_id: string | null
        states_carried: number | null
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_provider: ["openai", "google", "anthropic"],
      card_phase: ["new", "learning", "review", "relearning"],
      review_rating: ["again", "hard", "good", "easy"],
      visibility: ["public", "unlisted", "private"],
    },
  },
} as const

