export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activities: {
        Row: {
          block_type: string;
          budget_category: string;
          created_at: string;
          currency: string;
          data_reliability: string;
          day_id: string;
          description: string;
          duration_minutes: number;
          end_time: string | null;
          estimate: number | null;
          id: string;
          interest_tags: string[];
          latitude: number | null;
          location_label: string | null;
          longitude: number | null;
          name: string;
          notes: string;
          price_checked_at: string | null;
          price_per_person: number | null;
          price_source: string | null;
          price_status: string;
          sort_order: number;
          source: string;
          start_time: string | null;
          travel_minutes: number | null;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          block_type?: string;
          budget_category?: string;
          created_at?: string;
          currency: string;
          data_reliability?: string;
          day_id: string;
          description?: string;
          duration_minutes: number;
          end_time?: string | null;
          estimate?: number | null;
          id?: string;
          interest_tags?: string[];
          latitude?: number | null;
          location_label?: string | null;
          longitude?: number | null;
          name: string;
          notes?: string;
          price_checked_at?: string | null;
          price_per_person?: number | null;
          price_source?: string | null;
          price_status?: string;
          sort_order: number;
          source?: string;
          start_time?: string | null;
          travel_minutes?: number | null;
          trip_id: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          block_type?: string;
          budget_category?: string;
          created_at?: string;
          currency?: string;
          data_reliability?: string;
          day_id?: string;
          description?: string;
          duration_minutes?: number;
          end_time?: string | null;
          estimate?: number | null;
          id?: string;
          interest_tags?: string[];
          latitude?: number | null;
          location_label?: string | null;
          longitude?: number | null;
          name?: string;
          notes?: string;
          price_checked_at?: string | null;
          price_per_person?: number | null;
          price_source?: string | null;
          price_status?: string;
          sort_order?: number;
          source?: string;
          start_time?: string | null;
          travel_minutes?: number | null;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_day_id_fkey";
            columns: ["day_id"];
            isOneToOne: false;
            referencedRelation: "trip_days";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      destinations: {
        Row: {
          best_season: string;
          budget_estimate: number | null;
          categories: string[];
          country: string;
          description: string;
          image_url: string | null;
          latitude: number | null;
          longitude: number | null;
          name: string;
          recommended_duration: string;
          region: string;
          slug: string;
          source_label: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          best_season?: string;
          budget_estimate?: number | null;
          categories?: string[];
          country: string;
          description?: string;
          image_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          recommended_duration?: string;
          region?: string;
          slug: string;
          source_label?: string;
          updated_at?: string;
        };
        Update: {
          best_season?: string;
          budget_estimate?: number | null;
          categories?: string[];
          country?: string;
          description?: string;
          image_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          recommended_duration?: string;
          region?: string;
          slug?: string;
          source_label?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          activity_id: string | null;
          amount: number;
          category: string;
          created_at: string;
          currency: string;
          description: string;
          id: string;
          incurred_on: string;
          notes: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id?: string | null;
          amount: number;
          category: string;
          created_at?: string;
          currency: string;
          description: string;
          id?: string;
          incurred_on?: string;
          notes?: string;
          trip_id: string;
          user_id?: string;
        };
        Update: {
          activity_id?: string | null;
          amount?: number;
          category?: string;
          created_at?: string;
          currency?: string;
          description?: string;
          id?: string;
          incurred_on?: string;
          notes?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          destination_slug: string;
          id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          destination_slug: string;
          id?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          destination_slug?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_destination_slug_fkey";
            columns: ["destination_slug"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["slug"];
          },
        ];
      };
      places: {
        Row: {
          address: string;
          category: string;
          currency: string;
          description: string;
          destination_slug: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          name: string;
          source: string;
          ticket_estimate: number | null;
          updated_at: string;
          visit_minutes: number | null;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          category?: string;
          currency?: string;
          description?: string;
          destination_slug: string;
          id: string;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          source?: string;
          ticket_estimate?: number | null;
          updated_at?: string;
          visit_minutes?: number | null;
        };
        Update: {
          address?: string;
          category?: string;
          currency?: string;
          description?: string;
          destination_slug?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          source?: string;
          ticket_estimate?: number | null;
          updated_at?: string;
          visit_minutes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "places_destination_slug_fkey";
            columns: ["destination_slug"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["slug"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          currency: string;
          display_name: string;
          id: string;
          language: string;
          preferences: NonNullable<Json>;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          currency?: string;
          display_name?: string;
          id: string;
          language?: string;
          preferences?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          display_name?: string;
          id?: string;
          language?: string;
          preferences?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [];
      };
      trip_days: {
        Row: {
          created_at: string;
          date: string | null;
          day_number: number;
          id: string;
          summary: string;
          theme: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          date?: string | null;
          day_number: number;
          id?: string;
          summary?: string;
          theme: string;
          trip_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          date?: string | null;
          day_number?: number;
          id?: string;
          summary?: string;
          theme?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_days_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_group_items: {
        Row: {
          ends_on: string | null;
          group_id: string;
          sort_order: number;
          starts_on: string | null;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          ends_on?: string | null;
          group_id: string;
          sort_order: number;
          starts_on?: string | null;
          trip_id: string;
          user_id?: string;
        };
        Update: {
          ends_on?: string | null;
          group_id?: string;
          sort_order?: number;
          starts_on?: string | null;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_group_items_group_id_user_id_fkey";
            columns: ["group_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "trip_groups";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "trip_group_items_trip_id_user_id_fkey";
            columns: ["trip_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      trip_groups: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      trips: {
        Row: {
          budget: number;
          created_at: string;
          currency: string;
          destination: string;
          end_date: string | null;
          id: string;
          interests: string[];
          name: string;
          origin: string;
          start_date: string | null;
          status: string;
          travel_type: string;
          travelers: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          budget: number;
          created_at?: string;
          currency: string;
          destination: string;
          end_date?: string | null;
          id?: string;
          interests?: string[];
          name: string;
          origin?: string;
          start_date?: string | null;
          status?: string;
          travel_type?: string;
          travelers?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          budget?: number;
          created_at?: string;
          currency?: string;
          destination?: string;
          end_date?: string | null;
          id?: string;
          interests?: string[];
          name?: string;
          origin?: string;
          start_date?: string | null;
          status?: string;
          travel_type?: string;
          travelers?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_trip_group: {
        Args: {
          p_ends_on: string[];
          p_name: string;
          p_starts_on: string[];
          p_trip_ids: string[];
        };
        Returns: string;
      };
      create_trip_with_itinerary: {
        Args: { trip_payload: Json };
        Returns: string;
      };
      reorder_trip_day_activities: {
        Args: { p_activity_ids: string[]; p_day_id: string; p_trip_id: string };
        Returns: boolean;
      };
      replace_trip_day: {
        Args: { p_day: Json; p_day_number: number; p_trip_id: string };
        Returns: boolean;
      };
      update_trip_details: {
        Args: { p_changes: Json; p_trip_id: string };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
