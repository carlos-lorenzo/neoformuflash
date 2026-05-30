export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          llm_provider: string;
          use_builtin_llm: boolean;
          api_key_ciphertext: string | null;
          api_key_last4: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          llm_provider?: string;
          use_builtin_llm?: boolean;
          api_key_ciphertext?: string | null;
          api_key_last4?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          llm_provider?: string;
          use_builtin_llm?: boolean;
          api_key_ciphertext?: string | null;
          api_key_last4?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_customers: {
        Row: {
          user_id: string;
          stripe_customer_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          stripe_customer_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          stripe_customer_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_subscription_id: string;
          status: Database["public"]["Enums"]["subscription_status_enum"];
          price_id: string | null;
          product_id: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          trial_end: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_subscription_id: string;
          status: Database["public"]["Enums"]["subscription_status_enum"];
          price_id?: string | null;
          product_id?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          trial_end?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_subscription_id?: string;
          status?: Database["public"]["Enums"]["subscription_status_enum"];
          price_id?: string | null;
          product_id?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          trial_end?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      institutions: {
        Row: {
          id: string;
          owner_id: string;
          slug: string;
          name: string;
          description: string | null;
          visibility: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          slug: string;
          name: string;
          description?: string | null;
          visibility?: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          visibility?: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          institution_id: string;
          owner_id: string;
          slug: string;
          name: string;
          description: string | null;
          visibility: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          institution_id: string;
          owner_id: string;
          slug: string;
          name: string;
          description?: string | null;
          visibility?: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          institution_id?: string;
          owner_id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          visibility?: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      topics: {
        Row: {
          id: string;
          course_id: string;
          owner_id: string;
          slug: string;
          name: string;
          description: string | null;
          visibility: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          owner_id: string;
          slug: string;
          name: string;
          description?: string | null;
          visibility?: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          owner_id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          visibility?: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      resources: {
        Row: {
          id: string;
          topic_id: string;
          owner_id: string;
          resource_type: Database["public"]["Enums"]["resource_type_enum"];
          title: string;
          slug: string;
          visibility: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic_id: string;
          owner_id: string;
          resource_type: Database["public"]["Enums"]["resource_type_enum"];
          title: string;
          slug: string;
          visibility?: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          topic_id?: string;
          owner_id?: string;
          resource_type?: Database["public"]["Enums"]["resource_type_enum"];
          title?: string;
          slug?: string;
          visibility?: Database["public"]["Enums"]["visibility_enum"];
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          markdown: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          markdown: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          markdown?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      note_chunks: {
        Row: {
          id: string;
          note_id: string;
          chunk_index: number;
          content: string;
          embedding: number[] | null;
          embedding_model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          note_id: string;
          chunk_index: number;
          content: string;
          embedding?: number[] | null;
          embedding_model?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          note_id?: string;
          chunk_index?: number;
          content?: string;
          embedding?: number[] | null;
          embedding_model?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      decks: {
        Row: {
          id: string;
          description: string | null;
        };
        Insert: {
          id: string;
          description?: string | null;
        };
        Update: {
          id?: string;
          description?: string | null;
        };
        Relationships: [];
      };
      flashcards: {
        Row: {
          id: string;
          deck_id: string;
          front: string;
          back: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          deck_id: string;
          front: string;
          back: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          deck_id?: string;
          front?: string;
          back?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fsrs_state: {
        Row: {
          id: string;
          card_id: string;
          user_id: string;
          due_at: string;
          interval_days: number;
          stability: number;
          difficulty: number;
          retrievability: number;
          last_reviewed_at: string | null;
          reps: number;
          lapses: number;
          state: string | null;
        };
        Insert: {
          id?: string;
          card_id: string;
          user_id: string;
          due_at?: string;
          interval_days?: number;
          stability?: number;
          difficulty?: number;
          retrievability?: number;
          last_reviewed_at?: string | null;
          reps?: number;
          lapses?: number;
          state?: string | null;
        };
        Update: {
          id?: string;
          card_id?: string;
          user_id?: string;
          due_at?: string;
          interval_days?: number;
          stability?: number;
          difficulty?: number;
          retrievability?: number;
          last_reviewed_at?: string | null;
          reps?: number;
          lapses?: number;
          state?: string | null;
        };
        Relationships: [];
      };
      exams: {
        Row: {
          id: string;
          format: Database["public"]["Enums"]["exam_format_enum"];
          instructions: string | null;
          time_limit_minutes: number | null;
        };
        Insert: {
          id: string;
          format?: Database["public"]["Enums"]["exam_format_enum"];
          instructions?: string | null;
          time_limit_minutes?: number | null;
        };
        Update: {
          id?: string;
          format?: Database["public"]["Enums"]["exam_format_enum"];
          instructions?: string | null;
          time_limit_minutes?: number | null;
        };
        Relationships: [];
      };
      exam_items: {
        Row: {
          id: string;
          exam_id: string;
          item_type: Database["public"]["Enums"]["exam_item_type_enum"];
          prompt: string;
          options: Json | null;
          correct_answer: string | null;
          points: number;
          position: number;
        };
        Insert: {
          id?: string;
          exam_id: string;
          item_type: Database["public"]["Enums"]["exam_item_type_enum"];
          prompt: string;
          options?: Json | null;
          correct_answer?: string | null;
          points?: number;
          position?: number;
        };
        Update: {
          id?: string;
          exam_id?: string;
          item_type?: Database["public"]["Enums"]["exam_item_type_enum"];
          prompt?: string;
          options?: Json | null;
          correct_answer?: string | null;
          points?: number;
          position?: number;
        };
        Relationships: [];
      };
      collaborators: {
        Row: {
          id: string;
          entity_type: Database["public"]["Enums"]["entity_type_enum"];
          entity_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["collaborator_role_enum"];
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: Database["public"]["Enums"]["entity_type_enum"];
          entity_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["collaborator_role_enum"];
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: Database["public"]["Enums"]["entity_type_enum"];
          entity_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["collaborator_role_enum"];
          created_at?: string;
        };
        Relationships: [];
      };
      review_queue_cache: {
        Row: {
          id: string;
          user_id: string;
          card_id: string;
          due_date: string;
          due_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          card_id: string;
          due_date: string;
          due_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          card_id?: string;
          due_date?: string;
          due_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      visibility_enum: "public" | "private" | "collaborators";
      resource_type_enum: "note" | "deck" | "exam";
      collaborator_role_enum: "viewer" | "editor";
      exam_format_enum: "mcq" | "longform" | "mixed";
      exam_item_type_enum: "mcq" | "longform";
      entity_type_enum: "institution" | "course" | "topic" | "resource";
      subscription_status_enum:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
