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
          capacity_kwh: number | null
          created_at: string
        }
        Insert: {
          id?: string
          category: string
          brand?: string
          model: string
          specifications?: string | null
          capacity_kwh?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          category?: string
          brand?: string
          model?: string
          specifications?: string | null
          capacity_kwh?: number | null
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
      b2b_work_categories: {
        Row: {
          id: string
          code: string
          label: string
          description: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          label: string
          description?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          label?: string
          description?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      checklist_template_work_phases: {
        Row: {
          category: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      checklist_templates: {
        Row: {
          b2b_work_category_id: string | null
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean
          is_required: boolean
          min_photo_count: number
          name: string
          phase: string | null
          requires_photo: boolean
          sort_order: number
          template_work_phase_id: string | null
        }
        Insert: {
          b2b_work_category_id?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          min_photo_count?: number
          name: string
          phase?: string | null
          requires_photo?: boolean
          sort_order?: number
          template_work_phase_id?: string | null
        }
        Update: {
          b2b_work_category_id?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          min_photo_count?: number
          name?: string
          phase?: string | null
          requires_photo?: boolean
          sort_order?: number
          template_work_phase_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_b2b_work_category_id_fkey"
            columns: ["b2b_work_category_id"]
            isOneToOne: false
            referencedRelation: "b2b_work_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_template_work_phase_id_fkey"
            columns: ["template_work_phase_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_work_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          checklist_id: string | null
          created_at: string | null
          id: string
          installer_id: string | null
          section_name: string | null
          site_id: string | null
          site_checklist_item_id: string | null
          storage_path: string
        }
        Insert: {
          checklist_id?: string | null
          created_at?: string | null
          id?: string
          installer_id?: string | null
          section_name?: string | null
          site_id?: string | null
          site_checklist_item_id?: string | null
          storage_path: string
        }
        Update: {
          checklist_id?: string | null
          created_at?: string | null
          id?: string
          installer_id?: string | null
          section_name?: string | null
          site_id?: string | null
          site_checklist_item_id?: string | null
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
          {
            foreignKeyName: "photos_site_checklist_item_id_fkey"
            columns: ["site_checklist_item_id"]
            isOneToOne: false
            referencedRelation: "site_checklist_items"
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
          requires_photo: boolean
          min_photo_count: number
          work_phase_id: string | null
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
          requires_photo?: boolean
          min_photo_count?: number
          work_phase_id?: string | null
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
          requires_photo?: boolean
          min_photo_count?: number
          work_phase_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_checklist_items_site_checklist_id_fkey"
            columns: ["site_checklist_id"]
            isOneToOne: false
            referencedRelation: "site_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklist_items_work_phase_id_fkey"
            columns: ["work_phase_id"]
            isOneToOne: false
            referencedRelation: "site_work_phases"
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
          {
            foreignKeyName: "site_extra_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_audit_logs: {
        Row: {
          id: string
          site_id: string
          actor_id: string | null
          action: string
          entity_type: string
          old_data: Json | null
          new_data: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          actor_id?: string | null
          action: string
          entity_type: string
          old_data?: Json | null
          new_data?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          actor_id?: string | null
          action?: string
          entity_type?: string
          old_data?: Json | null
          new_data?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_audit_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_revisits: {
        Row: {
          id: string
          site_id: string
          category: string
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          category: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          category?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_revisits_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_revisits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
          kwh: number | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          scheduled_start: string | null
          status: string | null
          roof_angle: string | null
          roof_material: string | null
          roof_type: string | null
          inverter_brand: string | null
          stringing_details: any | null
          blueprint_categories: string[] | null
          system_type: string
          site_type: 'b2c' | 'b2b' | 'service'
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
          kwh?: number | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          roof_angle?: string | null
          roof_material?: string | null
          roof_type?: string | null
          inverter_brand?: string | null
          scheduled_start?: string | null
          status?: string | null
          stringing_details?: any | null
          blueprint_categories?: string[] | null
          system_type: string
          site_type?: 'b2c' | 'b2b' | 'service'
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
          kwh?: number | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          roof_angle?: string | null
          roof_material?: string | null
          roof_type?: string | null
          inverter_brand?: string | null
          scheduled_start?: string | null
          status?: string | null
          stringing_details?: any | null
          blueprint_categories?: string[] | null
          system_type?: string
          site_type?: 'b2c' | 'b2b' | 'service'
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      site_work_phases: {
        Row: {
          id: string
          site_id: string
          code: string
          label: string
          sort_order: number
          is_active: boolean
          b2b_work_category_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          code: string
          label: string
          sort_order?: number
          is_active?: boolean
          b2b_work_category_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          code?: string
          label?: string
          sort_order?: number
          is_active?: boolean
          b2b_work_category_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_work_phases_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
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
          work_phase_id: string | null
          needs_review: boolean
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          corrected_at: string | null
          corrected_by: string | null
          correction_reason: string | null
          original_start_time: string | null
          original_end_time: string | null
          original_duration_minutes: number | null
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
          work_phase_id?: string | null
          needs_review?: boolean
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          original_start_time?: string | null
          original_end_time?: string | null
          original_duration_minutes?: number | null
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
          work_phase_id?: string | null
          needs_review?: boolean
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          original_start_time?: string | null
          original_end_time?: string | null
          original_duration_minutes?: number | null
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
          {
            foreignKeyName: "time_entries_work_phase_id_fkey"
            columns: ["work_phase_id"]
            isOneToOne: false
            referencedRelation: "site_work_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          email: string
          employment_status: 'active' | 'inactive' | 'invited' | 'suspended' | 'archived'
          full_name: string | null
          hourly_rate: number | null
          id: string
          phone: string | null
          role: string | null
          team_id: string | null
          work_role: 'installer' | 'electrician' | 'site_manager' | 'project_manager'
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          email: string
          employment_status?: 'active' | 'inactive' | 'invited' | 'suspended' | 'archived'
          full_name?: string | null
          hourly_rate?: number | null
          id: string
          phone?: string | null
          role?: string | null
          team_id?: string | null
          work_role?: 'installer' | 'electrician' | 'site_manager' | 'project_manager'
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          email?: string
          employment_status?: 'active' | 'inactive' | 'invited' | 'suspended' | 'archived'
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          phone?: string | null
          role?: string | null
          team_id?: string | null
          work_role?: 'installer' | 'electrician' | 'site_manager' | 'project_manager'
        }
        Relationships: []
      }
      teams: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string | null
          id: string
          name: string
          status: 'active' | 'inactive' | 'archived'
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string | null
          id?: string
          name: string
          status?: 'active' | 'inactive' | 'archived'
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string | null
          id?: string
          name?: string
          status?: 'active' | 'inactive' | 'archived'
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
      site_labor_analytics_v: {
        Row: {
          anomaly_reasons: Json
          calendar_hours: number | null
          client_name: string
          completed_at: string | null
          h_per_kwp: number | null
          h_per_module: number | null
          h_per_optimizer: number | null
          has_bess: boolean
          installer_count: number
          inverter_count: number
          is_anomaly: boolean
          kwp: number | null
          module_count: number
          module_manufacturer: string | null
          module_model: string | null
          module_type: string | null
          module_wattage_w: number | null
          optimizer_count: number
          roof_slope: string | null
          roof_type: string | null
          site_code: string
          site_id: string
          system_type: string
          team_id: string | null
          team_name: string | null
          total_installer_hours: number
        }
        Relationships: []
      }
      site_checklist_phase_status_v: {
        Row: {
          site_id: string | null
          site_type: 'b2c' | 'b2b' | 'service' | null
          kwp: number | null
          work_phase_id: string | null
          work_phase_code: string | null
          work_phase_label: string | null
          work_phase_sort_order: number | null
          checklist_item_count: number | null
          completed_item_count: number | null
          missing_photo_item_count: number | null
          total_logged_hours: number | null
          logged_hours_per_kwp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "site_work_phases_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklist_items_work_phase_id_fkey"
            columns: ["work_phase_id"]
            isOneToOne: false
            referencedRelation: "site_work_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      site_work_phase_time_v: {
        Row: {
          site_id: string | null
          site_code: string | null
          client_name: string | null
          site_type: 'b2c' | 'b2b' | 'service' | null
          kwp: number | null
          work_phase_id: string | null
          work_phase_code: string | null
          work_phase_label: string | null
          work_phase_sort_order: number | null
          work_phase_is_active: boolean | null
          entry_count: number | null
          open_entry_count: number | null
          total_hours: number | null
          hours_per_kwp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "site_work_phases_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_compensation: {
        Row: {
          site_id: string
          fixed_fee: number
          currency: string
          notes: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          site_id: string
          fixed_fee: number
          currency?: string
          notes?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          site_id?: string
          fixed_fee?: number
          currency?: string
          notes?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_compensation_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          id: string
          year: number
          month: number
          status: string
          rate_card_id: string | null
          locked_by: string | null
          locked_at: string | null
          unlock_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          year: number
          month: number
          status?: string
          rate_card_id?: string | null
          locked_by?: string | null
          locked_at?: string | null
          unlock_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          year?: number
          month?: number
          status?: string
          rate_card_id?: string | null
          locked_by?: string | null
          locked_at?: string | null
          unlock_reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "payroll_rate_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_rate_cards: {
        Row: {
          id: string
          name: string
          valid_from: string | null
          valid_to: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          valid_from?: string | null
          valid_to?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          valid_from?: string | null
          valid_to?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      payroll_rate_rules: {
        Row: {
          id: string
          rate_card_id: string
          code: string
          label: string
          rule_type: string
          amount: number
          unit: string | null
          params: Json
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          rate_card_id: string
          code: string
          label: string
          rule_type: string
          amount: number
          unit?: string | null
          params?: Json
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          rate_card_id?: string
          code?: string
          label?: string
          rule_type?: string
          amount?: number
          unit?: string | null
          params?: Json
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_rate_rules_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "payroll_rate_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_site_snapshots: {
        Row: {
          id: string
          period_id: string
          site_id: string | null
          included: boolean
          participant_ids: Json
          is_manually_excluded: boolean
          participant_source: string
          participant_override_ids: Json | null
          manual_note: string | null
          warnings: Json
          recalculated_at: string | null
          base_amount: number
          addon_amount: number
          bonus_amount: number
          deduction_amount: number
          total_pool: number
          calculation_breakdown: Json
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          site_id?: string | null
          included?: boolean
          participant_ids?: Json
          is_manually_excluded?: boolean
          participant_source?: string
          participant_override_ids?: Json | null
          manual_note?: string | null
          warnings?: Json
          recalculated_at?: string | null
          base_amount?: number
          addon_amount?: number
          bonus_amount?: number
          deduction_amount?: number
          total_pool?: number
          calculation_breakdown?: Json
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          site_id?: string | null
          included?: boolean
          participant_ids?: Json
          is_manually_excluded?: boolean
          participant_source?: string
          participant_override_ids?: Json | null
          manual_note?: string | null
          warnings?: Json
          recalculated_at?: string | null
          base_amount?: number
          addon_amount?: number
          bonus_amount?: number
          deduction_amount?: number
          total_pool?: number
          calculation_breakdown?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_site_snapshots_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_site_snapshots_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      earnings_entries: {
        Row: {
          id: string
          period_id: string
          installer_id: string
          site_id: string | null
          site_snapshot_id: string | null
          entry_type: string
          amount: number
          description: string | null
          source: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          installer_id: string
          site_id?: string | null
          site_snapshot_id?: string | null
          entry_type: string
          amount: number
          description?: string | null
          source: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          installer_id?: string
          site_id?: string | null
          site_snapshot_id?: string | null
          entry_type?: string
          amount?: number
          description?: string | null
          source?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "earnings_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_entries_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_entries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_entries_site_snapshot_id_fkey"
            columns: ["site_snapshot_id"]
            isOneToOne: false
            referencedRelation: "payroll_site_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_site_rule_overrides: {
        Row: {
          id: string
          period_id: string
          site_id: string
          rate_rule_id: string
          mode: string
          quantity_override: number | null
          amount_override: number | null
          note: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          period_id: string
          site_id: string
          rate_rule_id: string
          mode?: string
          quantity_override?: number | null
          amount_override?: number | null
          note?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          site_id?: string
          rate_rule_id?: string
          mode?: string
          quantity_override?: number | null
          amount_override?: number | null
          note?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_site_rule_overrides_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_site_rule_overrides_rate_rule_id_fkey"
            columns: ["rate_rule_id"]
            isOneToOne: false
            referencedRelation: "payroll_rate_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_site_rate_card_overrides: {
        Row: {
          id: string
          period_id: string
          site_id: string
          rate_card_id: string
          note: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          period_id: string
          site_id: string
          rate_card_id: string
          note?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          site_id?: string
          rate_card_id?: string
          note?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_site_rate_card_overrides_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_site_rate_card_overrides_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "payroll_rate_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_site_rate_card_overrides_site_id_fkey"
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
      complete_site_work: { Args: { p_site_id: string; p_user_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_to_site: { Args: { site_id_param: string }; Returns: boolean }
      pause_work: { Args: { p_site_id: string }; Returns: undefined }
      start_work: { Args: { p_site_id: string; p_start_lat?: number; p_start_lng?: number; p_work_phase_id?: string }; Returns: undefined }
      recalculate_period: { Args: { p_period_id: string }; Returns: Json }
      lock_period: {
        Args: { p_period_id: string }
        Returns: {
          id: string
          year: number
          month: number
          status: string
          locked_by: string | null
          locked_at: string | null
          unlock_reason: string | null
          created_at: string
        }
      }
      recalculate_payroll_period: {
        Args: { p_year: number; p_month: number; p_rate_card_id: string }
        Returns: Json
      }
      lock_payroll_period: { Args: { p_period_id: string }; Returns: Json }
      set_payroll_site_included: {
        Args: { p_period_id: string; p_site_id: string; p_included: boolean; p_reason: string }
        Returns: Json
      }
      set_payroll_site_participants: {
        Args: { p_period_id: string; p_site_id: string; p_participant_ids: string[]; p_reason: string }
        Returns: Json
      }
      add_manual_payroll_entry: {
        Args: {
          p_period_id: string
          p_installer_id: string
          p_site_snapshot_id: string | null
          p_entry_type: string
          p_amount: number
          p_description: string
        }
        Returns: Json
      }
      reverse_manual_payroll_entry: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: Json
      }
      set_payroll_period_status: {
        Args: { p_period_id: string; p_status: string }
        Returns: Json
      }
      get_payroll_site_rule_state: {
        Args: { p_period_id: string; p_site_id: string; p_rate_card_id?: string }
        Returns: {
          rate_rule_id: string
          code: string
          label: string
          rule_type: string
          amount: number
          unit: string | null
          params: Json
          default_applicable: boolean
          detected_quantity: number | null
          mode: string
          quantity_override: number | null
          amount_override: number | null
          note: string | null
          effective_quantity: number | null
          effective_amount: number
          effective_applied: boolean
          reason: string
          source: string
        }[]
      }
      set_payroll_site_rule_override: {
        Args: {
          p_period_id: string
          p_site_id: string
          p_rate_rule_id: string
          p_mode: string
          p_quantity_override: number | null
          p_amount_override: number | null
          p_note: string | null
        }
        Returns: Json
      }
      admin_close_time_entry: {
        Args: { p_entry_id: string; p_ended_at: string; p_reason: string }
        Returns: Json
      }
      admin_correct_time_entry: {
        Args: {
          p_entry_id: string
          p_started_at: string
          p_ended_at: string
          p_reason: string
          p_mark_reviewed?: boolean
        }
        Returns: Json
      }
      mark_time_entry_reviewed: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: Json
      }
      get_payroll_site_effective_rate_card: {
        Args: { p_period_id: string; p_site_id: string }
        Returns: {
          effective_rate_card_id: string
          effective_rate_card_name: string
          source: string
        }[]
      }
      set_payroll_site_rate_card_override: {
        Args: {
          p_period_id: string
          p_site_id: string
          p_rate_card_id: string | null
          p_note: string | null
        }
        Returns: Json
      }
      get_labor_analytics_report: {
        Args: { p_filters?: Json }
        Returns: Json
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
