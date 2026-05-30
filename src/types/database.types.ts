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
      company_settings: {
        Row: {
          id: string
          company_name: string | null
          company_code: string | null
          vat_code: string | null
          iban: string | null
          address: string | null
          phone: string | null
          email: string | null
          logo_url: string | null
          primary_color: string | null
          warehouse_lat: number | null
          warehouse_lng: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_name?: string | null
          company_code?: string | null
          vat_code?: string | null
          iban?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          logo_url?: string | null
          primary_color?: string | null
          warehouse_lat?: number | null
          warehouse_lng?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_name?: string | null
          company_code?: string | null
          vat_code?: string | null
          iban?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          logo_url?: string | null
          primary_color?: string | null
          warehouse_lat?: number | null
          warehouse_lng?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_file_annotations: {
        Row: {
          id: string
          site_id: string
          file_name: string
          annotations: Json
          page_number: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          site_id: string
          file_name: string
          annotations?: Json
          page_number?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          file_name?: string
          annotations?: Json
          page_number?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      equipment_categories: {
        Row: {
          id: string
          created_at: string
          name: string
          bg_color: string
          text_color: string
          border_color: string
        }
        Insert: {
          id?: string
          created_at?: string
          name: string
          bg_color: string
          text_color: string
          border_color: string
        }
        Update: {
          id?: string
          created_at?: string
          name?: string
          bg_color?: string
          text_color?: string
          border_color?: string
        }
        Relationships: []
      }
      equipment_catalog: {

        Row: {
          id: string
          category: string
          brand: string
          model: string
          specifications: string | null
          created_at: string
        }
        Insert: {
          id?: string
          category: string
          brand?: string
          model: string
          specifications?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          category?: string
          brand?: string
          model?: string
          specifications?: string | null
          created_at?: string
        }
        Relationships: []
      }
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
          section_name: string | null
          site_id: string | null
          storage_path: string
        }
        Insert: {
          checklist_id?: string | null
          created_at?: string | null
          id?: string
          installer_id?: string | null
          section_name?: string | null
          site_id?: string | null
          storage_path: string
        }
        Update: {
          checklist_id?: string | null
          created_at?: string | null
          id?: string
          installer_id?: string | null
          section_name?: string | null
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
          id: string
          site_id: string | null
          template_id: string | null
          status: 'pending' | 'in_progress' | 'completed'
          created_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          site_id?: string | null
          template_id?: string | null
          status?: 'pending' | 'in_progress' | 'completed'
          created_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          site_id?: string | null
          template_id?: string | null
          status?: 'pending' | 'in_progress' | 'completed'
          created_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_checklists_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      site_checklist_items: {
        Row: {
          id: string
          site_checklist_id: string
          question_text: string
          category: string | null
          phase: string | null
          is_required: boolean
          status: 'pending' | 'pass' | 'fail' | 'n_a'
          photo_url: string | null
          comment: string | null
          updated_at: string | null
          is_extra: boolean
          created_by: string | null
        }
        Insert: {
          id?: string
          site_checklist_id: string
          question_text: string
          category?: string | null
          phase?: string | null
          is_required?: boolean
          status?: 'pending' | 'pass' | 'fail' | 'n_a'
          photo_url?: string | null
          comment?: string | null
          updated_at?: string | null
          is_extra?: boolean
          created_by?: string | null
        }
        Update: {
          id?: string
          site_checklist_id?: string
          question_text?: string
          category?: string | null
          phase?: string | null
          is_required?: boolean
          status?: 'pending' | 'pass' | 'fail' | 'n_a'
          photo_url?: string | null
          comment?: string | null
          updated_at?: string | null
          is_extra?: boolean
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_checklist_items_site_checklist_id_fkey"
            columns: ["site_checklist_id"]
            isOneToOne: false
            referencedRelation: "site_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      site_extra_materials: {
        Row: {
          id: string
          site_id: string
          checklist_item_id: string | null
          name: string
          quantity: number
          unit: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          checklist_item_id?: string | null
          name: string
          quantity?: number
          unit?: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          checklist_item_id?: string | null
          name?: string
          quantity?: number
          unit?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_extra_materials_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_extra_materials_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "site_checklist_items"
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
          client_email: string | null
          contact_person: string | null
          code: string
          created_at: string
          estimated_hours: number | null
          equipment_details: import('../types/equipment.types').EquipmentItem[] | Record<string, string> | null
          id: string
          kwp: number | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          scheduled_start: string | null
          status: string | null
          roof_angle: string | null
          roof_material: string | null
          roof_type: string | null
          stringing_details: any | null
          blueprint_categories: string[] | null
          system_type: string
          team_id: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          address: string
          client_name: string
          client_phone?: string | null
          client_email?: string | null
          contact_person?: string | null
          code: string
          created_at?: string
          equipment_details?: Record<string, string> | null
          estimated_hours?: number | null
          id?: string
          kwp?: number | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          roof_angle?: string | null
          roof_material?: string | null
          roof_type?: string | null
          scheduled_start?: string | null
          status?: string | null
          stringing_details?: any | null
          blueprint_categories?: string[] | null
          system_type: string
          team_id?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          address?: string
          client_name?: string
          client_phone?: string | null
          client_email?: string | null
          contact_person?: string | null
          code?: string
          created_at?: string
          equipment_details?: Record<string, string> | null
          estimated_hours?: number | null
          id?: string
          kwp?: number | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          roof_angle?: string | null
          roof_material?: string | null
          roof_type?: string | null
          scheduled_start?: string | null
          status?: string | null
          stringing_details?: any | null
          blueprint_categories?: string[] | null
          system_type?: string
          team_id?: string | null
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
          team_id: string | null
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
          team_id?: string | null
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
          team_id?: string | null
        }
        Relationships: []
      }
      teams: {
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
          site_status: string | null
          site_actual_end: string | null
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
      site_checklist_status: 'pending' | 'in_progress' | 'completed'
      site_checklist_item_status: 'pending' | 'pass' | 'fail' | 'n_a'
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
      site_checklist_status: ['pending', 'in_progress', 'completed'],
      site_checklist_item_status: ['pending', 'pass', 'fail', 'n_a'],
    },
  },
} as const
