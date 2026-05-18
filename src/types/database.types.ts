/* eslint-disable */
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
      checklist_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      checklist_templates: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          name: string
          phase: string | null
          requires_photo: boolean | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          name: string
          phase?: string | null
          requires_photo?: boolean | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          name?: string
          phase?: string | null
          requires_photo?: boolean | null
        }
        Relationships: []
      }
      photos: {
        Row: {
          checklist_id: string | null
          created_at: string | null
          id: string
          installer_id: string | null
          site_id: string | null
          storage_path: string
        }
        Insert: {
          checklist_id?: string | null
          created_at?: string | null
          id?: string
          installer_id?: string | null
          site_id?: string | null
          storage_path: string
        }
        Update: {
          checklist_id?: string | null
          created_at?: string | null
          id?: string
          installer_id?: string | null
          site_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "site_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_assignments: {
        Row: {
          created_at: string
          id: string
          installer_id: string
          is_lead: boolean | null
          site_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          installer_id: string
          is_lead?: boolean | null
          site_id: string
        }
        Update: {
          created_at?: string
          id?: string
          installer_id?: string
          is_lead?: boolean | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_assignments_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_checklists: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          phase: string
          requires_photo: boolean | null
          site_id: string | null
          task_name: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          phase: string
          requires_photo?: boolean | null
          site_id?: string | null
          task_name: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          phase?: string
          requires_photo?: boolean | null
          site_id?: string | null
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_checklists_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          address: string
          client_name: string
          client_phone: string | null
          code: string
          created_at: string
          estimated_hours: number | null
          id: string
          kwp: number | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          scheduled_start: string | null
          status: string | null
          system_type: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          address: string
          client_name: string
          client_phone?: string | null
          code: string
          created_at?: string
          estimated_hours?: number | null
          id?: string
          kwp?: number | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          scheduled_start?: string | null
          status?: string | null
          system_type: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          address?: string
          client_name?: string
          client_phone?: string | null
          code?: string
          created_at?: string
          estimated_hours?: number | null
          id?: string
          kwp?: number | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          scheduled_start?: string | null
          status?: string | null
          system_type?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          created_at: string
          duration_minutes: number | null
          end_time: string | null
          id: string
          installer_id: string
          site_id: string
          start_lat: number | null
          start_lng: number | null
          start_time: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          installer_id: string
          site_id: string
          start_lat?: number | null
          start_lng?: number | null
          start_time: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          installer_id?: string
          site_id?: string
          start_lat?: number | null
          start_lng?: number | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          hourly_rate: number | null
          id: string
          phone: string | null
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          hourly_rate?: number | null
          id: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      admin_activity_view: {
        Row: {
          client_name: string | null
          end_time: string | null
          id: string | null
          installer_id: string | null
          installer_name: string | null
          latest_action_time: string | null
          site_code: string | null
          site_id: string | null
          start_time: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_dashboard_stats: {
        Row: {
          active_sites: number | null
          completed_today: number | null
          installers_online: number | null
          weekly_minutes: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      complete_work: { Args: { p_site_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_to_site: { Args: { site_id_param: string }; Returns: boolean }
      pause_work: { Args: { p_site_id: string }; Returns: undefined }
      start_work: {
        Args: { p_site_id: string; p_start_lat?: number; p_start_lng?: number }
        Returns: {
          created_at: string
          duration_minutes: number | null
          end_time: string | null
          id: string
          installer_id: string
          site_id: string
          start_lat: number | null
          start_lng: number | null
          start_time: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
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
    Enums: {},
  },
} as const
