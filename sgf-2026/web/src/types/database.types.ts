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
      activity_log: {
        Row: {
          action: string
          actor_cpf: string | null
          actor_department_id: string | null
          actor_department_name: string | null
          actor_id: string | null
          actor_incomplete: boolean
          actor_name: string | null
          actor_role: string | null
          changes: Json | null
          created_at: string
          entity_cpf: string | null
          entity_department_id: string | null
          entity_department_name: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          sensitivity: string
          snapshot: Json | null
          source: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_cpf?: string | null
          actor_department_id?: string | null
          actor_department_name?: string | null
          actor_id?: string | null
          actor_incomplete?: boolean
          actor_name?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string
          entity_cpf?: string | null
          entity_department_id?: string | null
          entity_department_name?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          sensitivity?: string
          snapshot?: Json | null
          source?: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_cpf?: string | null
          actor_department_id?: string | null
          actor_department_name?: string | null
          actor_id?: string | null
          actor_incomplete?: boolean
          actor_name?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string
          entity_cpf?: string | null
          entity_department_id?: string | null
          entity_department_name?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          sensitivity?: string
          snapshot?: Json | null
          source?: string
          tenant_id?: string
        }
        Relationships: []
      }
      activity_log_retention: {
        Row: {
          event_count: number | null
          purge_date: string
          purged_at: string | null
          purged_count: number | null
          tenant_id: string
          warned_30_at: string | null
          warned_7_at: string | null
          warned_90_at: string | null
          year: number
        }
        Insert: {
          event_count?: number | null
          purge_date: string
          purged_at?: string | null
          purged_count?: number | null
          tenant_id: string
          warned_30_at?: string | null
          warned_7_at?: string | null
          warned_90_at?: string | null
          year: number
        }
        Update: {
          event_count?: number | null
          purge_date?: string
          purged_at?: string | null
          purged_count?: number | null
          tenant_id?: string
          warned_30_at?: string | null
          warned_7_at?: string | null
          warned_90_at?: string | null
          year?: number
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          cost_usd: number | null
          created_at: string
          feature: string
          id: number
          model: string | null
          tenant_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          feature: string
          id?: number
          model?: string | null
          tenant_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          feature?: string
          id?: number
          model?: string | null
          tenant_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          count: number
          key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          created_at: string
          name: string
          value: string
        }
        Insert: {
          created_at?: string
          name: string
          value: string
        }
        Update: {
          created_at?: string
          name?: string
          value?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          cnh_alert_days: number
          contract_alert_days: number
          fuel_price_mode: string
          id: boolean
          org_address: string | null
          org_city: string | null
          org_cnpj: string | null
          org_logo_url: string | null
          org_mayor: string | null
          org_name: string | null
          org_state: string | null
          require_fuel_validation: boolean
          tank_overflow_alert: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cnh_alert_days?: number
          contract_alert_days?: number
          fuel_price_mode?: string
          id?: boolean
          org_address?: string | null
          org_city?: string | null
          org_cnpj?: string | null
          org_logo_url?: string | null
          org_mayor?: string | null
          org_name?: string | null
          org_state?: string | null
          require_fuel_validation?: boolean
          tank_overflow_alert?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          cnh_alert_days?: number
          contract_alert_days?: number
          fuel_price_mode?: string
          id?: boolean
          org_address?: string | null
          org_city?: string | null
          org_cnpj?: string | null
          org_logo_url?: string | null
          org_mayor?: string | null
          org_name?: string | null
          org_state?: string | null
          require_fuel_validation?: boolean
          tank_overflow_alert?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          monthly_price: number
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_price?: number
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_price?: number
          name?: string
        }
        Relationships: []
      }
      budget_allocations: {
        Row: {
          appropriation: string
          contract_id: string
          department_id: string
          funding_source: string
          spending_limit: number
        }
        Insert: {
          appropriation: string
          contract_id: string
          department_id: string
          funding_source: string
          spending_limit: number
        }
        Update: {
          appropriation?: string
          contract_id?: string
          department_id?: string
          funding_source?: string
          spending_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_allocations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "budget_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_allocations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_contracts: {
        Row: {
          category: string
          created_at: string
          ends_on: string
          fiscal_year: number
          id: string
          reference: string
          reporting: Json
          starts_on: string
          tenant_id: string
          total_limit: number
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          ends_on: string
          fiscal_year: number
          id?: string
          reference: string
          reporting?: Json
          starts_on: string
          tenant_id: string
          total_limit: number
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          ends_on?: string
          fiscal_year?: number
          id?: string
          reference?: string
          reporting?: Json
          starts_on?: string
          tenant_id?: string
          total_limit?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_entries: {
        Row: {
          contract_id: string
          department_id: string
          disputed: number
          partner_id: string
          realized: number
          reserved: number
          reserved_unit_price: number | null
          source_id: string
          source_status: string
          source_type: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          contract_id: string
          department_id: string
          disputed?: number
          partner_id: string
          realized?: number
          reserved?: number
          reserved_unit_price?: number | null
          source_id: string
          source_status: string
          source_type: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          contract_id?: string
          department_id?: string
          disputed?: number
          partner_id?: string
          realized?: number
          reserved?: number
          reserved_unit_price?: number | null
          source_id?: string
          source_status?: string
          source_type?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_entries_contract_id_department_id_fkey"
            columns: ["contract_id", "department_id"]
            isOneToOne: false
            referencedRelation: "budget_allocations"
            referencedColumns: ["contract_id", "department_id"]
          },
          {
            foreignKeyName: "budget_entries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "budget_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_events: {
        Row: {
          actor_id: string | null
          after_value: Json
          before_value: Json | null
          contract_id: string
          department_id: string | null
          event_type: string
          id: number
          occurred_at: string
          reason: string
        }
        Insert: {
          actor_id?: string | null
          after_value: Json
          before_value?: Json | null
          contract_id: string
          department_id?: string | null
          event_type: string
          id?: never
          occurred_at?: string
          reason: string
        }
        Update: {
          actor_id?: string | null
          after_value?: Json
          before_value?: Json | null
          contract_id?: string
          department_id?: string | null
          event_type?: string
          id?: never
          occurred_at?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "budget_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_partners: {
        Row: {
          contract_id: string
          partner_id: string
        }
        Insert: {
          contract_id: string
          partner_id: string
        }
        Update: {
          contract_id?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_partners_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "budget_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          checklist_id: string
          id: string
          item_key: string
          label: string
          state: Database["public"]["Enums"]["checklist_state"]
          tenant_id: string
        }
        Insert: {
          checklist_id: string
          id?: string
          item_key: string
          label: string
          state?: Database["public"]["Enums"]["checklist_state"]
          tenant_id?: string
        }
        Update: {
          checklist_id?: string
          id?: string
          item_key?: string
          label?: string
          state?: Database["public"]["Enums"]["checklist_state"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          quick_confirm: boolean
          tenant_id: string
          trip_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          quick_confirm?: boolean
          tenant_id?: string
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          quick_confirm?: boolean
          tenant_id?: string
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklists_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          tenant_id?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_alarms: {
        Row: {
          acknowledged: boolean
          alarm_code: string | null
          alarm_type: string
          created_at: string
          device_alarm_id: string
          gps_time: string | null
          id: string
          imei: string
          lat: number | null
          lng: number | null
          raw: Json | null
          speed: number | null
          tenant_id: string
          tracker_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          acknowledged?: boolean
          alarm_code?: string | null
          alarm_type: string
          created_at?: string
          device_alarm_id: string
          gps_time?: string | null
          id?: string
          imei: string
          lat?: number | null
          lng?: number | null
          raw?: Json | null
          speed?: number | null
          tenant_id: string
          tracker_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          acknowledged?: boolean
          alarm_code?: string | null
          alarm_type?: string
          created_at?: string
          device_alarm_id?: string
          gps_time?: string | null
          id?: string
          imei?: string
          lat?: number | null
          lng?: number | null
          raw?: Json | null
          speed?: number | null
          tenant_id?: string
          tracker_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_alarms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_alarms_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_alarms_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_commands: {
        Row: {
          command: string
          command_id: string | null
          created_at: string
          id: string
          imei: string
          issued_by: string | null
          responded_at: string | null
          response: string | null
          status: string
          tenant_id: string
          tracker_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          command: string
          command_id?: string | null
          created_at?: string
          id?: string
          imei: string
          issued_by?: string | null
          responded_at?: string | null
          response?: string | null
          status?: string
          tenant_id: string
          tracker_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          command?: string
          command_id?: string | null
          created_at?: string
          id?: string
          imei?: string
          issued_by?: string | null
          responded_at?: string | null
          response?: string | null
          status?: string
          tenant_id?: string
          tracker_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_commands_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_commands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_commands_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_commands_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_status: {
        Row: {
          course: number | null
          fix_source: string | null
          gps_time: string | null
          idle_notified_at: string | null
          idle_since: string | null
          ignition: boolean | null
          imei: string
          lat: number | null
          lng: number | null
          online: boolean | null
          speed: number | null
          tenant_id: string
          tracker_id: string
          updated_at: string
          vehicle_id: string | null
          voltage: number | null
        }
        Insert: {
          course?: number | null
          fix_source?: string | null
          gps_time?: string | null
          idle_notified_at?: string | null
          idle_since?: string | null
          ignition?: boolean | null
          imei: string
          lat?: number | null
          lng?: number | null
          online?: boolean | null
          speed?: number | null
          tenant_id: string
          tracker_id: string
          updated_at?: string
          vehicle_id?: string | null
          voltage?: number | null
        }
        Update: {
          course?: number | null
          fix_source?: string | null
          gps_time?: string | null
          idle_notified_at?: string | null
          idle_since?: string | null
          ignition?: boolean | null
          imei?: string
          lat?: number | null
          lng?: number | null
          online?: boolean | null
          speed?: number | null
          tenant_id?: string
          tracker_id?: string
          updated_at?: string
          vehicle_id?: string | null
          voltage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "device_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_status_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: true
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_status_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_registration_invites: {
        Row: {
          ai_use_count: number
          created_at: string
          created_by: string
          department_id: string | null
          expires_at: string
          id: string
          max_uses: number
          status: string
          tenant_id: string
          token_hash: string
          updated_at: string
          use_count: number
        }
        Insert: {
          ai_use_count?: number
          created_at?: string
          created_by: string
          department_id?: string | null
          expires_at: string
          id?: string
          max_uses?: number
          status?: string
          tenant_id: string
          token_hash: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          ai_use_count?: number
          created_at?: string
          created_by?: string
          department_id?: string | null
          expires_at?: string
          id?: string
          max_uses?: number
          status?: string
          tenant_id?: string
          token_hash?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_registration_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_registration_invites_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_registration_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_registration_requests: {
        Row: {
          ai_confidence: number | null
          auth_user_id: string
          birth_date: string | null
          cnh_back_path: string | null
          cnh_category: string
          cnh_expiry: string
          cnh_front_path: string | null
          cnh_number: string
          cpf: string
          created_at: string
          department_id: string | null
          document_entry_mode: string
          email: string
          full_name: string
          id: string
          invite_id: string
          manager_note: string | null
          phone: string | null
          privacy_accepted_at: string | null
          registration_number: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          tenant_id: string
          terms_accepted_at: string | null
          terms_version: string | null
          tracking_token_hash: string
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          auth_user_id: string
          birth_date?: string | null
          cnh_back_path?: string | null
          cnh_category: string
          cnh_expiry: string
          cnh_front_path?: string | null
          cnh_number: string
          cpf: string
          created_at?: string
          department_id?: string | null
          document_entry_mode?: string
          email: string
          full_name: string
          id?: string
          invite_id: string
          manager_note?: string | null
          phone?: string | null
          privacy_accepted_at?: string | null
          registration_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          tenant_id: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          tracking_token_hash: string
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          auth_user_id?: string
          birth_date?: string | null
          cnh_back_path?: string | null
          cnh_category?: string
          cnh_expiry?: string
          cnh_front_path?: string | null
          cnh_number?: string
          cpf?: string
          created_at?: string
          department_id?: string | null
          document_entry_mode?: string
          email?: string
          full_name?: string
          id?: string
          invite_id?: string
          manager_note?: string | null
          phone?: string | null
          privacy_accepted_at?: string | null
          registration_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          tenant_id?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          tracking_token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_registration_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_registration_requests_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "driver_registration_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_registration_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_registration_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_stations: {
        Row: {
          address: string | null
          city: string | null
          cnpj: string | null
          code: string | null
          contract_alert_days: number
          contract_alert_percent: number
          contract_end: string | null
          contract_number: string | null
          contract_start: string | null
          contract_value: number | null
          created_at: string
          documents: Json
          fuel_prices: Json
          fuel_types: string[] | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          code?: string | null
          contract_alert_days?: number
          contract_alert_percent?: number
          contract_end?: string | null
          contract_number?: string | null
          contract_start?: string | null
          contract_value?: number | null
          created_at?: string
          documents?: Json
          fuel_prices?: Json
          fuel_types?: string[] | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          code?: string | null
          contract_alert_days?: number
          contract_alert_percent?: number
          contract_end?: string | null
          contract_number?: string | null
          contract_start?: string | null
          contract_value?: number | null
          created_at?: string
          documents?: Json
          fuel_prices?: Json
          fuel_types?: string[] | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_stations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fuelings: {
        Row: {
          anomaly_type: string | null
          authorization_note: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          driver_id: string | null
          expires_at: string | null
          filled_at: string | null
          filled_by: string | null
          fuel_type: string | null
          full_tank: boolean
          has_anomaly: boolean | null
          id: string
          km_per_liter: number | null
          liters: number
          max_liters: number | null
          odometer: number | null
          photo_dashboard_url: string | null
          photo_pump_url: string | null
          photo_receipt_url: string | null
          photo_requisition_url: string | null
          photo_url: string | null
          price_per_liter: number | null
          pump_receipt_number: string | null
          station: string | null
          station_id: string | null
          tenant_id: string
          total_cost: number | null
          trip_id: string | null
          validated_at: string | null
          validated_by: string | null
          vehicle_id: string | null
          workflow_status: Database["public"]["Enums"]["fueling_workflow_status"]
        }
        Insert: {
          anomaly_type?: string | null
          authorization_note?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          driver_id?: string | null
          expires_at?: string | null
          filled_at?: string | null
          filled_by?: string | null
          fuel_type?: string | null
          full_tank?: boolean
          has_anomaly?: boolean | null
          id?: string
          km_per_liter?: number | null
          liters: number
          max_liters?: number | null
          odometer?: number | null
          photo_dashboard_url?: string | null
          photo_pump_url?: string | null
          photo_receipt_url?: string | null
          photo_requisition_url?: string | null
          photo_url?: string | null
          price_per_liter?: number | null
          pump_receipt_number?: string | null
          station?: string | null
          station_id?: string | null
          tenant_id?: string
          total_cost?: number | null
          trip_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id?: string | null
          workflow_status?: Database["public"]["Enums"]["fueling_workflow_status"]
        }
        Update: {
          anomaly_type?: string | null
          authorization_note?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          driver_id?: string | null
          expires_at?: string | null
          filled_at?: string | null
          filled_by?: string | null
          fuel_type?: string | null
          full_tank?: boolean
          has_anomaly?: boolean | null
          id?: string
          km_per_liter?: number | null
          liters?: number
          max_liters?: number | null
          odometer?: number | null
          photo_dashboard_url?: string | null
          photo_pump_url?: string | null
          photo_receipt_url?: string | null
          photo_requisition_url?: string | null
          photo_url?: string | null
          price_per_liter?: number | null
          pump_receipt_number?: string | null
          station?: string | null
          station_id?: string | null
          tenant_id?: string
          total_cost?: number | null
          trip_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id?: string | null
          workflow_status?: Database["public"]["Enums"]["fueling_workflow_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fuelings_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_filled_by_fkey"
            columns: ["filled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      infractions: {
        Row: {
          ait: string | null
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          code: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          indicated_driver_id: string | null
          indicated_trip_id: string | null
          location: string | null
          notes: string | null
          occurred_at: string
          plate: string | null
          points: number | null
          raw: Json | null
          source: string
          status: string
          suggested_driver_id: string | null
          tenant_id: string
          vehicle_id: string | null
        }
        Insert: {
          ait?: string | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          indicated_driver_id?: string | null
          indicated_trip_id?: string | null
          location?: string | null
          notes?: string | null
          occurred_at?: string
          plate?: string | null
          points?: number | null
          raw?: Json | null
          source?: string
          status?: string
          suggested_driver_id?: string | null
          tenant_id?: string
          vehicle_id?: string | null
        }
        Update: {
          ait?: string | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          indicated_driver_id?: string | null
          indicated_trip_id?: string | null
          location?: string | null
          notes?: string | null
          occurred_at?: string
          plate?: string | null
          points?: number | null
          raw?: Json | null
          source?: string
          status?: string
          suggested_driver_id?: string | null
          tenant_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "infractions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infractions_indicated_driver_id_fkey"
            columns: ["indicated_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infractions_indicated_trip_id_fkey"
            columns: ["indicated_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infractions_suggested_driver_id_fkey"
            columns: ["suggested_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infractions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infractions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      instrument_budget_allocations: {
        Row: {
          appropriation: string
          category: string
          department_id: string
          funding_source: string
          id: string
          plan_id: string
          simam_code: string
          spending_limit: number
        }
        Insert: {
          appropriation: string
          category: string
          department_id: string
          funding_source: string
          id?: string
          plan_id: string
          simam_code?: string
          spending_limit: number
        }
        Update: {
          appropriation?: string
          category?: string
          department_id?: string
          funding_source?: string
          id?: string
          plan_id?: string
          simam_code?: string
          spending_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "instrument_budget_allocations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instrument_budget_allocations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "instrument_budget_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      instrument_budget_plans: {
        Row: {
          created_at: string
          document_reference: string
          fiscal_year: number
          id: string
          instrument_id: string
          status: string
          total_limit: number
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          document_reference: string
          fiscal_year: number
          id?: string
          instrument_id: string
          status?: string
          total_limit: number
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          document_reference?: string
          fiscal_year?: number
          id?: string
          instrument_id?: string
          status?: string
          total_limit?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "instrument_budget_plans_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "procurement_instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      iopgps_credentials: {
        Row: {
          access_token: string | null
          active: boolean
          app_secret: string
          appid: string
          base_url: string
          created_at: string
          id: string
          tenant_id: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          active?: boolean
          app_secret: string
          appid: string
          base_url?: string
          created_at?: string
          id?: string
          tenant_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          active?: boolean
          app_secret?: string
          appid?: string
          base_url?: string
          created_at?: string
          id?: string
          tenant_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iopgps_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          created_at: string
          description: string | null
          driver_id: string
          id: string
          photo_urls: string[]
          severity: Database["public"]["Enums"]["issue_severity"]
          status: Database["public"]["Enums"]["issue_status"]
          tenant_id: string
          title: string
          trip_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          driver_id: string
          id?: string
          photo_urls?: string[]
          severity?: Database["public"]["Enums"]["issue_severity"]
          status?: Database["public"]["Enums"]["issue_status"]
          tenant_id?: string
          title: string
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          driver_id?: string
          id?: string
          photo_urls?: string[]
          severity?: Database["public"]["Enums"]["issue_severity"]
          status?: Database["public"]["Enums"]["issue_status"]
          tenant_id?: string
          title?: string
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issues_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_positions: {
        Row: {
          battery: number | null
          course: number | null
          driver_id: string
          fix_source: string | null
          heading: number | null
          ignition: boolean | null
          is_active: boolean
          lat: number
          lng: number
          online: boolean | null
          source: string
          speed: number | null
          tenant_id: string
          trip_id: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          battery?: number | null
          course?: number | null
          driver_id: string
          fix_source?: string | null
          heading?: number | null
          ignition?: boolean | null
          is_active?: boolean
          lat: number
          lng: number
          online?: boolean | null
          source?: string
          speed?: number | null
          tenant_id?: string
          trip_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          battery?: number | null
          course?: number | null
          driver_id?: string
          fix_source?: string | null
          heading?: number | null
          ignition?: boolean | null
          is_active?: boolean
          lat?: number
          lng?: number
          online?: boolean | null
          source?: string
          speed?: number | null
          tenant_id?: string
          trip_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_positions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_positions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_positions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenances: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          due_odometer: number | null
          id: string
          odometer: number | null
          performed_at: string | null
          status: string
          tenant_id: string
          type: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_odometer?: number | null
          id?: string
          odometer?: number | null
          performed_at?: string | null
          status?: string
          tenant_id?: string
          type: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_odometer?: number | null
          id?: string
          odometer?: number | null
          performed_at?: string | null
          status?: string
          tenant_id?: string
          type?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenances_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          driver_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          read: boolean
          tenant_id: string
          title: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string
          driver_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read?: boolean
          tenant_id?: string
          title: string
          type: string
        }
        Update: {
          body?: string
          created_at?: string
          driver_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read?: boolean
          tenant_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          ai_document_model: string | null
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_document_model?: string | null
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_document_model?: string | null
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      procurement_fuel_reservations: {
        Row: {
          allocation_id: string
          authorized_quantity: number
          committed_amount: number
          committed_quantity: number
          created_at: string
          created_by: string
          expires_at: string
          fuel_type: string
          fueling_id: string
          issuance_payload: Json | null
          item_id: string
          price_id: string
          request: Json
          state: string
          station_id: string
          tenant_id: string
          unit_price: number
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          allocation_id: string
          authorized_quantity: number
          committed_amount: number
          committed_quantity: number
          created_at?: string
          created_by: string
          expires_at: string
          fuel_type: string
          fueling_id: string
          issuance_payload?: Json | null
          item_id: string
          price_id: string
          request: Json
          state: string
          station_id: string
          tenant_id: string
          unit_price: number
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          allocation_id?: string
          authorized_quantity?: number
          committed_amount?: number
          committed_quantity?: number
          created_at?: string
          created_by?: string
          expires_at?: string
          fuel_type?: string
          fueling_id?: string
          issuance_payload?: Json | null
          item_id?: string
          price_id?: string
          request?: Json
          state?: string
          station_id?: string
          tenant_id?: string
          unit_price?: number
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_fuel_reservations_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "instrument_budget_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_fuel_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_fuel_reservations_fueling_id_fkey"
            columns: ["fueling_id"]
            isOneToOne: true
            referencedRelation: "fuelings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_fuel_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_fuel_reservations_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "procurement_item_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_fuel_reservations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_fuel_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_fuel_reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_fuel_rollouts: {
        Row: {
          document_reference: string
          enabled: boolean
          instrument_id: string
        }
        Insert: {
          document_reference: string
          enabled?: boolean
          instrument_id: string
        }
        Update: {
          document_reference?: string
          enabled?: boolean
          instrument_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_fuel_rollouts_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: true
            referencedRelation: "procurement_instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_instrument_partners: {
        Row: {
          instrument_id: string
          partner_id: string
          partner_kind: string
        }
        Insert: {
          instrument_id: string
          partner_id: string
          partner_kind: string
        }
        Update: {
          instrument_id?: string
          partner_id?: string
          partner_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_instrument_partners_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "procurement_instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_instruments: {
        Row: {
          created_at: string
          declared_value: number | null
          documents: Json
          ends_on: string
          id: string
          kind: string
          origin_ata_id: string | null
          process_id: string
          reference: string
          starts_on: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
          year: number
        }
        Insert: {
          created_at?: string
          declared_value?: number | null
          documents?: Json
          ends_on: string
          id?: string
          kind: string
          origin_ata_id?: string | null
          process_id: string
          reference: string
          starts_on: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
          year: number
        }
        Update: {
          created_at?: string
          declared_value?: number | null
          documents?: Json
          ends_on?: string
          id?: string
          kind?: string
          origin_ata_id?: string | null
          process_id?: string
          reference?: string
          starts_on?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_instruments_origin_ata_id_tenant_id_fkey"
            columns: ["origin_ata_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "procurement_instruments"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "procurement_instruments_process_id_tenant_id_fkey"
            columns: ["process_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "procurement_processes"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "procurement_instruments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_item_prices: {
        Row: {
          created_at: string
          discount_percent: number | null
          document_reference: string
          effective_on: string
          id: string
          item_id: string
          pricing_mode: string
          revision: number
          table_reference: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          discount_percent?: number | null
          document_reference: string
          effective_on: string
          id?: string
          item_id: string
          pricing_mode: string
          revision: number
          table_reference?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          discount_percent?: number | null
          document_reference?: string
          effective_on?: string
          id?: string
          item_id?: string
          pricing_mode?: string
          revision?: number
          table_reference?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_item_prices_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_items: {
        Row: {
          category: string
          created_at: string
          description: string
          fuel_code: string | null
          id: string
          instrument_id: string
          lot_reference: string
          origin_item_id: string | null
          partner_id: string
          partner_kind: string
          quantity: number
          reference: string
          unit: string
          updated_at: string
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          fuel_code?: string | null
          id?: string
          instrument_id: string
          lot_reference?: string
          origin_item_id?: string | null
          partner_id: string
          partner_kind: string
          quantity: number
          reference: string
          unit: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          fuel_code?: string | null
          id?: string
          instrument_id?: string
          lot_reference?: string
          origin_item_id?: string | null
          partner_id?: string
          partner_kind?: string
          quantity?: number
          reference?: string
          unit?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_items_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "procurement_instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_items_instrument_id_partner_kind_partner_id_fkey"
            columns: ["instrument_id", "partner_kind", "partner_id"]
            isOneToOne: false
            referencedRelation: "procurement_instrument_partners"
            referencedColumns: ["instrument_id", "partner_kind", "partner_id"]
          },
          {
            foreignKeyName: "procurement_items_origin_item_id_fkey"
            columns: ["origin_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_legacy_reconciliations: {
        Row: {
          allocation_id: string
          amount_at_reconciliation: number
          disputed_amount: number
          documents: Json
          id: string
          instrument_id: string
          justification: string
          legacy_contract_id: string
          realized_amount: number
          reconciled_at: string
          reconciled_by: string
          reserved_amount: number
          source_id: string
          source_status: string
          source_type: string
          tenant_id: string
        }
        Insert: {
          allocation_id: string
          amount_at_reconciliation: number
          disputed_amount: number
          documents: Json
          id?: string
          instrument_id: string
          justification: string
          legacy_contract_id: string
          realized_amount: number
          reconciled_at?: string
          reconciled_by: string
          reserved_amount: number
          source_id: string
          source_status: string
          source_type: string
          tenant_id: string
        }
        Update: {
          allocation_id?: string
          amount_at_reconciliation?: number
          disputed_amount?: number
          documents?: Json
          id?: string
          instrument_id?: string
          justification?: string
          legacy_contract_id?: string
          realized_amount?: number
          reconciled_at?: string
          reconciled_by?: string
          reserved_amount?: number
          source_id?: string
          source_status?: string
          source_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_legacy_reconciliations_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "instrument_budget_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_legacy_reconciliations_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "procurement_instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_legacy_reconciliations_legacy_contract_id_fkey"
            columns: ["legacy_contract_id"]
            isOneToOne: false
            referencedRelation: "budget_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_legacy_reconciliations_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_legacy_reconciliations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_processes: {
        Row: {
          created_at: string
          documents: Json
          id: string
          legal_basis: string
          modality: string
          object: string
          reference: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
          year: number
        }
        Insert: {
          created_at?: string
          documents?: Json
          id?: string
          legal_basis: string
          modality: string
          object: string
          reference: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
          year: number
        }
        Update: {
          created_at?: string
          documents?: Json
          id?: string
          legal_basis?: string
          modality?: string
          object?: string
          reference?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_processes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_registry_events: {
        Row: {
          actor_id: string
          actor_name: string
          after_value: Json
          before_value: Json | null
          id: number
          kind: string
          occurred_at: string
          process_id: string
          reason: string
          record_id: string
          tenant_id: string
        }
        Insert: {
          actor_id: string
          actor_name: string
          after_value: Json
          before_value?: Json | null
          id?: never
          kind: string
          occurred_at?: string
          process_id: string
          reason: string
          record_id: string
          tenant_id: string
        }
        Update: {
          actor_id?: string
          actor_name?: string
          after_value?: Json
          before_value?: Json | null
          id?: never
          kind?: string
          occurred_at?: string
          process_id?: string
          reason?: string
          record_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_registry_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_registry_events_process_id_tenant_id_fkey"
            columns: ["process_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "procurement_processes"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "procurement_registry_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_station_reservations: {
        Row: {
          allocation_id: string
          authorized_quantity: number
          catalog_item_id: string
          committed_amount: number
          committed_quantity: number
          created_at: string
          created_by: string
          department_id: string
          expires_at: string
          issuance_payload: Json | null
          item_id: string
          item_kind: string
          item_name: string
          operation_id: string
          price_id: string
          request: Json
          state: string
          station_id: string
          tenant_id: string
          unit: string
          unit_price: number
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          allocation_id: string
          authorized_quantity: number
          catalog_item_id: string
          committed_amount: number
          committed_quantity: number
          created_at?: string
          created_by: string
          department_id: string
          expires_at: string
          issuance_payload?: Json | null
          item_id: string
          item_kind: string
          item_name: string
          operation_id: string
          price_id: string
          request: Json
          state: string
          station_id: string
          tenant_id: string
          unit: string
          unit_price: number
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          allocation_id?: string
          authorized_quantity?: number
          catalog_item_id?: string
          committed_amount?: number
          committed_quantity?: number
          created_at?: string
          created_by?: string
          department_id?: string
          expires_at?: string
          issuance_payload?: Json | null
          item_id?: string
          item_kind?: string
          item_name?: string
          operation_id?: string
          price_id?: string
          request?: Json
          state?: string
          station_id?: string
          tenant_id?: string
          unit?: string
          unit_price?: number
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_station_reservations_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "instrument_budget_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_station_reservations_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "station_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_station_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_station_reservations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_station_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_station_reservations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "station_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_station_reservations_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "procurement_item_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_station_reservations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_station_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_station_reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_station_rollouts: {
        Row: {
          document_reference: string
          enabled: boolean
          instrument_id: string
        }
        Insert: {
          document_reference: string
          enabled?: boolean
          instrument_id: string
        }
        Update: {
          document_reference?: string
          enabled?: boolean
          instrument_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_station_rollouts_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: true
            referencedRelation: "procurement_instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_blocked: boolean
          allowed_modules: string[]
          archived_at: string | null
          birth_date: string | null
          cnh_category: string | null
          cnh_ear: boolean
          cnh_expiry: string | null
          cnh_number: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          current_vehicle_id: string | null
          department: string | null
          department_id: string | null
          driver_status: Database["public"]["Enums"]["driver_lifecycle"]
          email: string | null
          full_name: string
          id: string
          must_change_password: boolean
          on_duty: boolean
          phone: string | null
          photo_url: string | null
          registration_number: string | null
          registration_status: string
          repair_shop_id: string | null
          role: string
          score: number | null
          session_revoked_at: string | null
          shift_end: string | null
          shift_start: string | null
          station_id: string | null
          tenant_id: string
          updated_by: string | null
        }
        Insert: {
          access_blocked?: boolean
          allowed_modules?: string[]
          archived_at?: string | null
          birth_date?: string | null
          cnh_category?: string | null
          cnh_ear?: boolean
          cnh_expiry?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          current_vehicle_id?: string | null
          department?: string | null
          department_id?: string | null
          driver_status?: Database["public"]["Enums"]["driver_lifecycle"]
          email?: string | null
          full_name?: string
          id: string
          must_change_password?: boolean
          on_duty?: boolean
          phone?: string | null
          photo_url?: string | null
          registration_number?: string | null
          registration_status?: string
          repair_shop_id?: string | null
          role?: string
          score?: number | null
          session_revoked_at?: string | null
          shift_end?: string | null
          shift_start?: string | null
          station_id?: string | null
          tenant_id?: string
          updated_by?: string | null
        }
        Update: {
          access_blocked?: boolean
          allowed_modules?: string[]
          archived_at?: string | null
          birth_date?: string | null
          cnh_category?: string | null
          cnh_ear?: boolean
          cnh_expiry?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          current_vehicle_id?: string | null
          department?: string | null
          department_id?: string | null
          driver_status?: Database["public"]["Enums"]["driver_lifecycle"]
          email?: string | null
          full_name?: string
          id?: string
          must_change_password?: boolean
          on_duty?: boolean
          phone?: string | null
          photo_url?: string | null
          registration_number?: string | null
          registration_status?: string
          repair_shop_id?: string | null
          role?: string
          score?: number | null
          session_revoked_at?: string | null
          shift_end?: string | null
          shift_start?: string | null
          station_id?: string | null
          tenant_id?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_vehicle_id_fkey"
            columns: ["current_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_repair_shop_id_fkey"
            columns: ["repair_shop_id"]
            isOneToOne: false
            referencedRelation: "repair_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          platform: string | null
          tenant_id: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform?: string | null
          tenant_id?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string | null
          tenant_id?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_shops: {
        Row: {
          address: string | null
          city: string | null
          cnpj: string | null
          code: string | null
          contract_alert_days: number
          contract_alert_percent: number
          contract_end: string | null
          contract_number: string | null
          contract_start: string | null
          contract_value: number | null
          created_at: string
          documents: Json | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          specialties: string[] | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          code?: string | null
          contract_alert_days?: number
          contract_alert_percent?: number
          contract_end?: string | null
          contract_number?: string | null
          contract_start?: string | null
          contract_value?: number | null
          created_at?: string
          documents?: Json | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          specialties?: string[] | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          code?: string | null
          contract_alert_days?: number
          contract_alert_percent?: number
          contract_end?: string | null
          contract_number?: string | null
          contract_start?: string | null
          contract_value?: number | null
          created_at?: string
          documents?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          specialties?: string[] | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_shops_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          attachment_path: string | null
          axis: string
          created_at: string
          from_state: string | null
          id: string
          note: string | null
          service_order_id: string
          tenant_id: string
          to_state: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          attachment_path?: string | null
          axis?: string
          created_at?: string
          from_state?: string | null
          id?: string
          note?: string | null
          service_order_id: string
          tenant_id?: string
          to_state?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          attachment_path?: string | null
          axis?: string
          created_at?: string
          from_state?: string | null
          id?: string
          note?: string | null
          service_order_id?: string
          tenant_id?: string
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_events_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_invoice_items: {
        Row: {
          created_at: string
          delivered_quantity: number
          id: string
          invoice_id: string
          line_amount: number
          quote_item_id: string
          reservation_quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          delivered_quantity: number
          id?: string
          invoice_id: string
          line_amount: number
          quote_item_id: string
          reservation_quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          delivered_quantity?: number
          id?: string
          invoice_id?: string
          line_amount?: number
          quote_item_id?: string
          reservation_quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "service_order_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_invoice_items_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "service_order_quote_items"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_invoices: {
        Row: {
          amount: number
          attestation_note: string | null
          attested_amount: number | null
          attested_at: string | null
          attested_by: string | null
          commitment_number: string | null
          created_at: string
          file_path: string | null
          glosa_amount: number
          id: string
          invoice_number: string
          issued_at: string
          repair_shop_id: string
          service_order_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          attestation_note?: string | null
          attested_amount?: number | null
          attested_at?: string | null
          attested_by?: string | null
          commitment_number?: string | null
          created_at?: string
          file_path?: string | null
          glosa_amount?: number
          id?: string
          invoice_number: string
          issued_at?: string
          repair_shop_id: string
          service_order_id: string
          tenant_id?: string
        }
        Update: {
          amount?: number
          attestation_note?: string | null
          attested_amount?: number | null
          attested_at?: string | null
          attested_by?: string | null
          commitment_number?: string | null
          created_at?: string
          file_path?: string | null
          glosa_amount?: number
          id?: string
          invoice_number?: string
          issued_at?: string
          repair_shop_id?: string
          service_order_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_invoices_attested_by_fkey"
            columns: ["attested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_invoices_repair_shop_id_fkey"
            columns: ["repair_shop_id"]
            isOneToOne: false
            referencedRelation: "repair_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_invoices_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string | null
          note: string | null
          paid_at: string
          registered_by: string | null
          service_order_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          paid_at?: string
          registered_by?: string | null
          service_order_id: string
          tenant_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          paid_at?: string
          registered_by?: string | null
          service_order_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "service_order_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_payments_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_payments_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_quote_item_procurement_links: {
        Row: {
          allocation_id: string
          contract_unit_price: number
          linked_at: string
          linked_by: string
          procurement_item_id: string
          procurement_price_id: string
          quote_item_id: string
          tenant_id: string
        }
        Insert: {
          allocation_id: string
          contract_unit_price: number
          linked_at?: string
          linked_by: string
          procurement_item_id: string
          procurement_price_id: string
          quote_item_id: string
          tenant_id: string
        }
        Update: {
          allocation_id?: string
          contract_unit_price?: number
          linked_at?: string
          linked_by?: string
          procurement_item_id?: string
          procurement_price_id?: string
          quote_item_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_quote_item_procurement__procurement_price_id_fkey"
            columns: ["procurement_price_id"]
            isOneToOne: false
            referencedRelation: "procurement_item_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_item_procurement_l_procurement_item_id_fkey"
            columns: ["procurement_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_item_procurement_links_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "instrument_budget_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_item_procurement_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_item_procurement_links_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: true
            referencedRelation: "service_order_quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_item_procurement_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_quote_items: {
        Row: {
          category: string | null
          created_at: string
          description: string
          id: string
          kind: string
          qty: number
          quote_id: string
          unit: string | null
          unit_price: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          description: string
          id?: string
          kind: string
          qty?: number
          quote_id: string
          unit?: string | null
          unit_price: number
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          kind?: string
          qty?: number
          quote_id?: string
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "service_order_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_quote_procurement_reservations: {
        Row: {
          allocation_id: string
          committed_amount: number
          committed_quantity: number
          created_at: string
          created_by: string
          procurement_item_id: string
          procurement_price_id: string
          quote_item_id: string
          reserved_amount: number
          reserved_quantity: number
          reserved_unit_price: number
          service_order_id: string
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allocation_id: string
          committed_amount: number
          committed_quantity: number
          created_at?: string
          created_by: string
          procurement_item_id: string
          procurement_price_id: string
          quote_item_id: string
          reserved_amount: number
          reserved_quantity: number
          reserved_unit_price: number
          service_order_id: string
          state: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allocation_id?: string
          committed_amount?: number
          committed_quantity?: number
          created_at?: string
          created_by?: string
          procurement_item_id?: string
          procurement_price_id?: string
          quote_item_id?: string
          reserved_amount?: number
          reserved_quantity?: number
          reserved_unit_price?: number
          service_order_id?: string
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_quote_procurement_reser_procurement_price_id_fkey"
            columns: ["procurement_price_id"]
            isOneToOne: false
            referencedRelation: "procurement_item_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_procurement_reserv_procurement_item_id_fkey"
            columns: ["procurement_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_procurement_reservati_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_procurement_reservations_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "instrument_budget_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_procurement_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_procurement_reservations_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: true
            referencedRelation: "service_order_quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quote_procurement_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_quotes: {
        Row: {
          created_at: string
          id: string
          note: string | null
          repair_shop_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_order_id: string
          status: string
          tenant_id: string
          total: number
          valid_until: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          repair_shop_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_order_id: string
          status?: string
          tenant_id?: string
          total?: number
          valid_until?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          repair_shop_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_order_id?: string
          status?: string
          tenant_id?: string
          total?: number
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_quotes_repair_shop_id_fkey"
            columns: ["repair_shop_id"]
            isOneToOne: false
            referencedRelation: "repair_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quotes_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quotes_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          admin_note: string | null
          approved_at: string | null
          approved_by: string | null
          at_shop_at: string | null
          budget: number | null
          category: string
          checklist_id: string | null
          commitment_document_path: string | null
          commitment_number: string | null
          completed_at: string | null
          cost: number | null
          created_at: string
          description: string | null
          driver_id: string | null
          financial_status: Database["public"]["Enums"]["service_order_fin_status"]
          id: string
          issue_id: string | null
          nad_number: string | null
          odometer: number | null
          opened_by: string
          operational_status: Database["public"]["Enums"]["service_order_op_status"]
          origin: string
          priority: Database["public"]["Enums"]["issue_severity"]
          received_at: string | null
          repair_shop: string | null
          repair_shop_id: string | null
          status: Database["public"]["Enums"]["service_order_status"]
          tenant_id: string
          vehicle_id: string | null
        }
        Insert: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          at_shop_at?: string | null
          budget?: number | null
          category: string
          checklist_id?: string | null
          commitment_document_path?: string | null
          commitment_number?: string | null
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          driver_id?: string | null
          financial_status?: Database["public"]["Enums"]["service_order_fin_status"]
          id?: string
          issue_id?: string | null
          nad_number?: string | null
          odometer?: number | null
          opened_by?: string
          operational_status?: Database["public"]["Enums"]["service_order_op_status"]
          origin?: string
          priority?: Database["public"]["Enums"]["issue_severity"]
          received_at?: string | null
          repair_shop?: string | null
          repair_shop_id?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          tenant_id?: string
          vehicle_id?: string | null
        }
        Update: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          at_shop_at?: string | null
          budget?: number | null
          category?: string
          checklist_id?: string | null
          commitment_document_path?: string | null
          commitment_number?: string | null
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          driver_id?: string | null
          financial_status?: Database["public"]["Enums"]["service_order_fin_status"]
          id?: string
          issue_id?: string | null
          nad_number?: string | null
          odometer?: number | null
          opened_by?: string
          operational_status?: Database["public"]["Enums"]["service_order_op_status"]
          origin?: string
          priority?: Database["public"]["Enums"]["issue_severity"]
          received_at?: string | null
          repair_shop?: string | null
          repair_shop_id?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          tenant_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_repair_shop_id_fkey"
            columns: ["repair_shop_id"]
            isOneToOne: false
            referencedRelation: "repair_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      station_catalog_items: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          kind: string
          name: string
          requires_odometer: boolean
          station_id: string
          tenant_id: string
          unit: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          kind: string
          name: string
          requires_odometer?: boolean
          station_id: string
          tenant_id: string
          unit: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          requires_odometer?: boolean
          station_id?: string
          tenant_id?: string
          unit?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_catalog_items_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_catalog_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      station_closing_commitments: {
        Row: {
          amount: number
          closing_id: string
          commitment_id: string
          id: string
          linked_at: string
          linked_by: string
          tenant_id: string
        }
        Insert: {
          amount: number
          closing_id: string
          commitment_id: string
          id?: string
          linked_at?: string
          linked_by: string
          tenant_id: string
        }
        Update: {
          amount?: number
          closing_id?: string
          commitment_id?: string
          id?: string
          linked_at?: string
          linked_by?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_closing_commitments_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: true
            referencedRelation: "station_monthly_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_commitments_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "station_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_commitments_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_commitments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      station_closing_invoices: {
        Row: {
          amount: number
          attestation_note: string | null
          attested_at: string | null
          attested_by: string | null
          closing_id: string
          document_path: string
          id: string
          invoice_number: string
          issued_on: string
          station_id: string
          status: string
          submitted_at: string
          submitted_by: string
          tenant_id: string
        }
        Insert: {
          amount: number
          attestation_note?: string | null
          attested_at?: string | null
          attested_by?: string | null
          closing_id: string
          document_path: string
          id?: string
          invoice_number: string
          issued_on: string
          station_id: string
          status?: string
          submitted_at?: string
          submitted_by: string
          tenant_id: string
        }
        Update: {
          amount?: number
          attestation_note?: string | null
          attested_at?: string | null
          attested_by?: string | null
          closing_id?: string
          document_path?: string
          id?: string
          invoice_number?: string
          issued_on?: string
          station_id?: string
          status?: string
          submitted_at?: string
          submitted_by?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_closing_invoices_attested_by_fkey"
            columns: ["attested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_invoices_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: true
            referencedRelation: "station_monthly_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_invoices_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_invoices_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      station_closing_payments: {
        Row: {
          amount: number
          closing_id: string
          created_at: string
          id: string
          invoice_id: string
          note: string | null
          paid_on: string | null
          payment_reference: string | null
          receipt_path: string | null
          registered_by: string
          scheduled_on: string
          tenant_id: string
        }
        Insert: {
          amount: number
          closing_id: string
          created_at?: string
          id?: string
          invoice_id: string
          note?: string | null
          paid_on?: string | null
          payment_reference?: string | null
          receipt_path?: string | null
          registered_by: string
          scheduled_on: string
          tenant_id: string
        }
        Update: {
          amount?: number
          closing_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          note?: string | null
          paid_on?: string | null
          payment_reference?: string | null
          receipt_path?: string | null
          registered_by?: string
          scheduled_on?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_closing_payments_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "station_monthly_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "station_closing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_payments_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_closing_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      station_commitments: {
        Row: {
          amount: number
          commitment_number: string
          created_at: string
          document_path: string
          id: string
          issued_on: string
          nad_number: string | null
          registered_by: string
          station_id: string
          status: string
          tenant_id: string
          updated_at: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          amount: number
          commitment_number: string
          created_at?: string
          document_path: string
          id?: string
          issued_on: string
          nad_number?: string | null
          registered_by: string
          station_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          valid_from: string
          valid_until: string
        }
        Update: {
          amount?: number
          commitment_number?: string
          created_at?: string
          document_path?: string
          id?: string
          issued_on?: string
          nad_number?: string | null
          registered_by?: string
          station_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_commitments_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_commitments_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_commitments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      station_monthly_closing_events: {
        Row: {
          actor_id: string
          actor_role: string
          closing_id: string
          created_at: string
          from_status: string | null
          id: number
          note: string | null
          tenant_id: string
          to_status: string
        }
        Insert: {
          actor_id: string
          actor_role: string
          closing_id: string
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          tenant_id: string
          to_status: string
        }
        Update: {
          actor_id?: string
          actor_role?: string
          closing_id?: string
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          tenant_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_monthly_closing_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_monthly_closing_events_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "station_monthly_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_monthly_closing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      station_monthly_closing_items: {
        Row: {
          anomaly_note: string | null
          authorizer_name: string | null
          closing_id: string
          created_at: string
          department_name: string | null
          distance_km: number | null
          driver_name: string | null
          efficiency: number | null
          evidence_paths: Json
          executed_at: string
          has_anomaly: boolean
          id: string
          item_kind: string
          item_name: string
          odometer: number | null
          plate: string
          previous_odometer: number | null
          quantity: number
          receipt_number: string | null
          source_id: string
          source_kind: string
          source_protocol: string
          station_id: string
          tenant_id: string
          total_cost: number
          unit: string
          unit_price: number
          vehicle_id: string
          vehicle_name: string | null
        }
        Insert: {
          anomaly_note?: string | null
          authorizer_name?: string | null
          closing_id: string
          created_at?: string
          department_name?: string | null
          distance_km?: number | null
          driver_name?: string | null
          efficiency?: number | null
          evidence_paths?: Json
          executed_at: string
          has_anomaly?: boolean
          id?: string
          item_kind: string
          item_name: string
          odometer?: number | null
          plate: string
          previous_odometer?: number | null
          quantity: number
          receipt_number?: string | null
          source_id: string
          source_kind: string
          source_protocol: string
          station_id: string
          tenant_id: string
          total_cost: number
          unit: string
          unit_price: number
          vehicle_id: string
          vehicle_name?: string | null
        }
        Update: {
          anomaly_note?: string | null
          authorizer_name?: string | null
          closing_id?: string
          created_at?: string
          department_name?: string | null
          distance_km?: number | null
          driver_name?: string | null
          efficiency?: number | null
          evidence_paths?: Json
          executed_at?: string
          has_anomaly?: boolean
          id?: string
          item_kind?: string
          item_name?: string
          odometer?: number | null
          plate?: string
          previous_odometer?: number | null
          quantity?: number
          receipt_number?: string | null
          source_id?: string
          source_kind?: string
          source_protocol?: string
          station_id?: string
          tenant_id?: string
          total_cost?: number
          unit?: string
          unit_price?: number
          vehicle_id?: string
          vehicle_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "station_monthly_closing_items_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "station_monthly_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_monthly_closing_items_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_monthly_closing_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      station_monthly_closings: {
        Row: {
          competence: string
          created_at: string
          fiscal_status: string
          id: string
          protocol: string
          record_count: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          snapshot_hash: string | null
          station_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: string
          total_amount: number
          total_quantity: number
          updated_at: string
        }
        Insert: {
          competence: string
          created_at?: string
          fiscal_status?: string
          id?: string
          protocol: string
          record_count?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_hash?: string | null
          station_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id: string
          total_amount?: number
          total_quantity?: number
          updated_at?: string
        }
        Update: {
          competence?: string
          created_at?: string
          fiscal_status?: string
          id?: string
          protocol?: string
          record_count?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_hash?: string | null
          station_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: string
          total_amount?: number
          total_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_monthly_closings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_monthly_closings_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_monthly_closings_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_monthly_closings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      station_operations: {
        Row: {
          authorization_note: string | null
          authorized_at: string
          authorized_by: string
          authorized_quantity: number
          catalog_item_id: string
          created_at: string
          department_id: string | null
          driver_id: string | null
          evidence_path: string | null
          executed_at: string | null
          executed_by: string | null
          expires_at: string
          id: string
          item_kind: string
          item_name: string
          odometer: number | null
          protocol: string
          quantity: number | null
          receipt_number: string | null
          rejection_reason: string | null
          station_id: string
          status: string
          tenant_id: string
          total_cost: number | null
          unit: string
          unit_price: number
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          vehicle_id: string
        }
        Insert: {
          authorization_note?: string | null
          authorized_at?: string
          authorized_by: string
          authorized_quantity: number
          catalog_item_id: string
          created_at?: string
          department_id?: string | null
          driver_id?: string | null
          evidence_path?: string | null
          executed_at?: string | null
          executed_by?: string | null
          expires_at: string
          id?: string
          item_kind: string
          item_name: string
          odometer?: number | null
          protocol: string
          quantity?: number | null
          receipt_number?: string | null
          rejection_reason?: string | null
          station_id: string
          status?: string
          tenant_id: string
          total_cost?: number | null
          unit: string
          unit_price: number
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id: string
        }
        Update: {
          authorization_note?: string | null
          authorized_at?: string
          authorized_by?: string
          authorized_quantity?: number
          catalog_item_id?: string
          created_at?: string
          department_id?: string | null
          driver_id?: string | null
          evidence_path?: string | null
          executed_at?: string | null
          executed_by?: string | null
          expires_at?: string
          id?: string
          item_kind?: string
          item_name?: string
          odometer?: number | null
          protocol?: string
          quantity?: number | null
          receipt_number?: string | null
          rejection_reason?: string | null
          station_id?: string
          status?: string
          tenant_id?: string
          total_cost?: number | null
          unit?: string
          unit_price?: number
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_operations_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_operations_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "station_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_operations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_operations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_operations_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_operations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "fuel_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_operations_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_operations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ai_limits: {
        Row: {
          enabled: boolean
          monthly_cap_usd: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          monthly_cap_usd?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          monthly_cap_usd?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ai_limits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_contracts: {
        Row: {
          created_at: string
          documents: Json | null
          end_date: string | null
          id: string
          object: string | null
          start_date: string | null
          status: string
          tenant_id: string
          title: string
          value: number | null
        }
        Insert: {
          created_at?: string
          documents?: Json | null
          end_date?: string | null
          id?: string
          object?: string | null
          start_date?: string | null
          status?: string
          tenant_id: string
          title: string
          value?: number | null
        }
        Update: {
          created_at?: string
          documents?: Json | null
          end_date?: string | null
          id?: string
          object?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string
          title?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invoices: {
        Row: {
          amount: number
          competencia: string
          created_at: string
          documents: Json
          due_date: string | null
          id: string
          notes: string | null
          paid_at: string | null
          receipt_url: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          competencia: string
          created_at?: string
          documents?: Json
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          receipt_url?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          competencia?: string
          created_at?: string
          documents?: Json
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          receipt_url?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string | null
          address: string | null
          app_name: string | null
          city: string | null
          cnpj: string | null
          created_at: string
          dark_color: string | null
          id: string
          login_eyebrow: string | null
          logo_url: string | null
          mayor_name: string | null
          name: string
          photo_url: string | null
          primary_color: string | null
          report_footer: string | null
          seal_url: string | null
          sessions_revoked_at: string | null
          slug: string
          state: string | null
          status: string
          support_email: string | null
          support_phone: string | null
          tracking_source: string
          trip_close_required_min: number
          trip_reminder_first_min: number
          trip_reminder_interval_min: number
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          app_name?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          dark_color?: string | null
          id?: string
          login_eyebrow?: string | null
          logo_url?: string | null
          mayor_name?: string | null
          name: string
          photo_url?: string | null
          primary_color?: string | null
          report_footer?: string | null
          seal_url?: string | null
          sessions_revoked_at?: string | null
          slug: string
          state?: string | null
          status?: string
          support_email?: string | null
          support_phone?: string | null
          tracking_source?: string
          trip_close_required_min?: number
          trip_reminder_first_min?: number
          trip_reminder_interval_min?: number
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          app_name?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          dark_color?: string | null
          id?: string
          login_eyebrow?: string | null
          logo_url?: string | null
          mayor_name?: string | null
          name?: string
          photo_url?: string | null
          primary_color?: string | null
          report_footer?: string | null
          seal_url?: string | null
          sessions_revoked_at?: string | null
          slug?: string
          state?: string | null
          status?: string
          support_email?: string | null
          support_phone?: string | null
          tracking_source?: string
          trip_close_required_min?: number
          trip_reminder_first_min?: number
          trip_reminder_interval_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      trackers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          identifier: string
          label: string | null
          model: string
          notes: string | null
          sim_number: string | null
          tenant_id: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          identifier: string
          label?: string | null
          model?: string
          notes?: string | null
          sim_number?: string | null
          tenant_id: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          identifier?: string
          label?: string | null
          model?: string
          notes?: string | null
          sim_number?: string | null
          tenant_id?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trackers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trackers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_locations: {
        Row: {
          accuracy: number | null
          driver_id: string
          heading: number | null
          id: number
          ignition: boolean | null
          lat: number
          lng: number
          recorded_at: string
          speed: number | null
          tenant_id: string
          trip_id: string
        }
        Insert: {
          accuracy?: number | null
          driver_id: string
          heading?: number | null
          id?: never
          ignition?: boolean | null
          lat: number
          lng: number
          recorded_at?: string
          speed?: number | null
          tenant_id?: string
          trip_id: string
        }
        Update: {
          accuracy?: number | null
          driver_id?: string
          heading?: number | null
          id?: never
          ignition?: boolean | null
          lat?: number
          lng?: number
          recorded_at?: string
          speed?: number | null
          tenant_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_watch: {
        Row: {
          anchor_lat: number | null
          anchor_lng: number | null
          close_required_at: string | null
          driver_id: string
          last_reminder_at: string | null
          last_signal_at: string | null
          manager_alerted_at: string | null
          reminders_sent: number
          source: string
          stopped_since: string | null
          tenant_id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          anchor_lat?: number | null
          anchor_lng?: number | null
          close_required_at?: string | null
          driver_id: string
          last_reminder_at?: string | null
          last_signal_at?: string | null
          manager_alerted_at?: string | null
          reminders_sent?: number
          source?: string
          stopped_since?: string | null
          tenant_id: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          anchor_lat?: number | null
          anchor_lng?: number | null
          close_required_at?: string | null
          driver_id?: string
          last_reminder_at?: string | null
          last_signal_at?: string | null
          manager_alerted_at?: string | null
          reminders_sent?: number
          source?: string
          stopped_since?: string | null
          tenant_id?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_watch_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_watch_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          destination: string
          distance_km: number | null
          driver_id: string
          end_at: string | null
          end_odometer: number | null
          end_odometer_photo_url: string | null
          estimated_distance_km: number | null
          id: string
          is_retroactive: boolean
          justification: string | null
          notes: string | null
          start_at: string
          start_odometer: number | null
          start_odometer_photo_url: string | null
          status: Database["public"]["Enums"]["trip_status"]
          tenant_id: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          destination: string
          distance_km?: number | null
          driver_id: string
          end_at?: string | null
          end_odometer?: number | null
          end_odometer_photo_url?: string | null
          estimated_distance_km?: number | null
          id?: string
          is_retroactive?: boolean
          justification?: string | null
          notes?: string | null
          start_at?: string
          start_odometer?: number | null
          start_odometer_photo_url?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          tenant_id?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          destination?: string
          distance_km?: number | null
          driver_id?: string
          end_at?: string | null
          end_odometer?: number | null
          end_odometer_photo_url?: string | null
          estimated_distance_km?: number | null
          id?: string
          is_retroactive?: boolean
          justification?: string | null
          notes?: string | null
          start_at?: string
          start_odometer?: number | null
          start_odometer_photo_url?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          tenant_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_documents: {
        Row: {
          created_at: string
          doc_type: string | null
          expires_at: string | null
          id: string
          issued_at: string | null
          tenant_id: string
          title: string
          url: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          doc_type?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          tenant_id?: string
          title: string
          url: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          tenant_id?: string
          title?: string
          url?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          brand: string | null
          chassis: string | null
          color: string | null
          created_at: string
          current_odometer: number
          department: string | null
          department_id: string | null
          document_url: string | null
          fuel_level: string | null
          fuel_type: Database["public"]["Enums"]["fuel_type_enum"] | null
          id: string
          insurance_expiry: string | null
          insurance_status: string | null
          last_service: string | null
          model: string | null
          name: string | null
          photo_url: string | null
          plate: string | null
          qr_code: string | null
          renavam: string | null
          status: Database["public"]["Enums"]["vehicle_status"]
          tank_capacity: number | null
          tenant_id: string
          unit_code: string
          vehicle_type: string | null
          year: number | null
        }
        Insert: {
          brand?: string | null
          chassis?: string | null
          color?: string | null
          created_at?: string
          current_odometer?: number
          department?: string | null
          department_id?: string | null
          document_url?: string | null
          fuel_level?: string | null
          fuel_type?: Database["public"]["Enums"]["fuel_type_enum"] | null
          id?: string
          insurance_expiry?: string | null
          insurance_status?: string | null
          last_service?: string | null
          model?: string | null
          name?: string | null
          photo_url?: string | null
          plate?: string | null
          qr_code?: string | null
          renavam?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tank_capacity?: number | null
          tenant_id?: string
          unit_code: string
          vehicle_type?: string | null
          year?: number | null
        }
        Update: {
          brand?: string | null
          chassis?: string | null
          color?: string | null
          created_at?: string
          current_odometer?: number
          department?: string | null
          department_id?: string | null
          document_url?: string | null
          fuel_level?: string | null
          fuel_type?: Database["public"]["Enums"]["fuel_type_enum"] | null
          id?: string
          insurance_expiry?: string | null
          insurance_status?: string | null
          last_service?: string | null
          model?: string | null
          name?: string | null
          photo_url?: string | null
          plate?: string | null
          qr_code?: string | null
          renavam?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tank_capacity?: number | null
          tenant_id?: string
          unit_code?: string
          vehicle_type?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activity_log_ignored_cols: { Args: never; Returns: string[] }
      activity_log_purge: { Args: never; Returns: undefined }
      activity_log_retention_warn: { Args: never; Returns: undefined }
      api_rate_limits_cleanup: { Args: never; Returns: undefined }
      approx_distance_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      assert_server_session: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: undefined
      }
      auto_close_abandoned_trips: {
        Args: { p_hours?: number }
        Returns: number
      }
      cancel_procurement_station_operation: {
        Args: { p_operation: string; p_reason: string }
        Returns: undefined
      }
      check_current_access: { Args: never; Returns: undefined }
      check_vehicle_conflict: {
        Args: { p_vehicle_id: string }
        Returns: {
          driver_name: string
          in_use: boolean
          is_stale: boolean
          last_activity_at: string
          start_at: string
          trip_id: string
        }[]
      }
      complete_procurement_fueling: {
        Args: {
          p_fueling: string
          p_liters: number
          p_odometer: number
          p_photo: string
          p_receipt: string
        }
        Returns: Json
      }
      delete_own_account: { Args: never; Returns: undefined }
      driver_release_current_vehicle: {
        Args: { p_vehicle_id?: string }
        Returns: boolean
      }
      driver_update_service_order: {
        Args: {
          p_action: string
          p_attachment_path?: string
          p_note?: string
          p_order_id: string
        }
        Returns: string
      }
      expire_open_authorizations: { Args: never; Returns: number }
      fueling_escrita_direta_motorista: { Args: never; Returns: boolean }
      get_current_vehicle_people: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_dashboard_alerts: {
        Args: never
        Returns: {
          count: number
          detail: string
          kind: string
          link: string
          severity: string
          title: string
        }[]
      }
      get_dashboard_summary: { Args: never; Returns: Json }
      get_department_budget_events: {
        Args: { p_contract_id: string; p_offset?: number }
        Returns: Json
      }
      get_department_budgets: { Args: { p_year: number }; Returns: Json }
      get_instrument_budget_events: {
        Args: { p_offset?: number; p_plan: string }
        Returns: Json
      }
      get_instrument_budgets: {
        Args: { p_instrument?: string; p_offset?: number; p_year: number }
        Returns: Json
      }
      get_partner_contract_status: {
        Args: never
        Returns: {
          alert_days: number
          alert_percent: number
          block_code: string
          block_message: string
          block_title: string
          can_create_new: boolean
          can_execute_existing: boolean
          committed_value: number
          contract_end: string
          contract_number: string
          contract_start: string
          contract_value: number
          days_remaining: number
          is_active: boolean
          partner_id: string
          partner_kind: string
          partner_name: string
          remaining_percent: number
          remaining_value: number
        }[]
      }
      get_partner_contract_usage: {
        Args: never
        Returns: {
          can_create_new: boolean
          consumed_percent: number
          consumed_value: number
          contract_end: string
          contract_number: string
          contract_start: string
          contract_value: number
          days_remaining: number
          disputed_value: number
          invoiced_value: number
          is_active: boolean
          month_contract_percent: number
          month_realized_value: number
          paid_value: number
          partner_id: string
          partner_kind: string
          partner_name: string
          realized_value: number
          remaining_value: number
          reserved_value: number
        }[]
      }
      get_partner_dashboard: {
        Args: never
        Returns: {
          metrics: Json
          monthly_series: Json
          partner_kind: string
          status_series: Json
        }[]
      }
      get_procurement_alerts: {
        Args: never
        Returns: {
          alert_code: string
          blocks_new_operations: boolean
          committed_value: number
          contract_end: string
          contract_number: string
          contract_value: number
          days_remaining: number
          partner_id: string
          partner_kind: string
          partner_name: string
          remaining_percent: number
          remaining_value: number
          severity: string
        }[]
      }
      get_procurement_contract_usage: {
        Args: never
        Returns: {
          can_create_new: boolean
          consumed_percent: number
          consumed_value: number
          contract_end: string
          contract_number: string
          contract_start: string
          contract_value: number
          days_remaining: number
          disputed_value: number
          invoiced_value: number
          is_active: boolean
          month_contract_percent: number
          month_realized_value: number
          paid_value: number
          partner_id: string
          partner_kind: string
          partner_name: string
          realized_value: number
          remaining_value: number
          reserved_value: number
        }[]
      }
      get_procurement_fiscal_reconciliation: {
        Args: { p_department?: string; p_instrument?: string; p_year?: number }
        Returns: {
          allocation_id: string
          appropriation: string
          attested_amount: number
          category: string
          consumed_amount: number
          declared_value: number
          department_id: string
          department_name: string
          disputed_amount: number
          fiscal_year: number
          funding_source: string
          instrument_id: string
          instrument_kind: string
          instrument_reference: string
          instrument_status: string
          invoiced_amount: number
          paid_amount: number
          planned_limit: number
          process_id: string
          process_reference: string
          realized_amount: number
          remaining_amount: number
          reserved_amount: number
          simam_code: string
        }[]
      }
      get_procurement_items: {
        Args: {
          p_date?: string
          p_instrument: string
          p_offset?: number
          p_search?: string
        }
        Returns: Json
      }
      get_procurement_legacy_reconciliation: {
        Args: { p_department?: string; p_year?: number }
        Returns: {
          consumed_amount: number
          contract_id: string
          contract_reference: string
          department_id: string
          department_name: string
          disputed_amount: number
          fiscal_year: number
          partner_id: string
          realized_amount: number
          reconciliation_status: string
          reserved_amount: number
          source_id: string
          source_status: string
          source_type: string
          vehicle_id: string
        }[]
      }
      get_procurement_prices: {
        Args: { p_item: string; p_offset?: number }
        Returns: Json
      }
      get_procurement_reconciled_legacy_totals: {
        Args: { p_department?: string; p_instrument?: string; p_year?: number }
        Returns: {
          allocation_id: string
          legacy_reconciled_amount: number
        }[]
      }
      get_procurement_registry: {
        Args: {
          p_kind: string
          p_offset?: number
          p_process?: string
          p_search?: string
        }
        Returns: Json
      }
      get_procurement_registry_events: {
        Args: { p_offset?: number; p_process: string }
        Returns: Json
      }
      get_procurement_registry_partners: { Args: never; Returns: Json }
      get_quote_procurement_candidates: {
        Args: { p_quote_id: string }
        Returns: Json
      }
      get_repair_shop_orders: {
        Args: never
        Returns: {
          brand: string
          category: string
          commitment_number: string
          created_at: string
          description: string
          financial_status: string
          model: string
          odometer: number
          operational_status: string
          order_id: string
          plate: string
          priority: string
          year: number
        }[]
      }
      get_station_authorizations_with_contracts: { Args: never; Returns: Json }
      get_station_closing_audit_report: {
        Args: { p_closing_id: string }
        Returns: {
          anomaly_note: string
          authorizer_name: string
          closing_id: string
          closing_protocol: string
          closing_status: string
          competence: string
          contract_number: string
          department_name: string
          distance_km: number
          driver_name: string
          efficiency: number
          evidence_count: number
          executed_at: string
          fiscal_status: string
          has_anomaly: boolean
          item_kind: string
          item_name: string
          odometer: number
          plate: string
          previous_odometer: number
          quantity: number
          receipt_number: string
          snapshot_hash: string
          source_kind: string
          source_protocol: string
          station_cnpj: string
          station_name: string
          total_cost: number
          unit: string
          unit_price: number
          vehicle_name: string
        }[]
      }
      get_station_closing_events: {
        Args: { p_closing_id: string }
        Returns: {
          actor_name: string
          actor_role: string
          created_at: string
          event_id: number
          from_status: string
          note: string
          to_status: string
        }[]
      }
      get_station_closing_fiscal_details: {
        Args: { p_closing_id: string }
        Returns: {
          closing_id: string
          commitment_amount: number
          commitment_document_path: string
          commitment_id: string
          commitment_number: string
          fiscal_status: string
          invoice_amount: number
          invoice_attested_at: string
          invoice_document_path: string
          invoice_id: string
          invoice_issued_on: string
          invoice_number: string
          invoice_status: string
          nad_number: string
          paid_on: string
          payment_amount: number
          payment_id: string
          payment_receipt_path: string
          payment_reference: string
          scheduled_on: string
        }[]
      }
      get_station_closing_items: {
        Args: { p_closing_id: string }
        Returns: {
          anomaly_note: string | null
          authorizer_name: string | null
          closing_id: string
          created_at: string
          department_name: string | null
          distance_km: number | null
          driver_name: string | null
          efficiency: number | null
          evidence_paths: Json
          executed_at: string
          has_anomaly: boolean
          id: string
          item_kind: string
          item_name: string
          odometer: number | null
          plate: string
          previous_odometer: number | null
          quantity: number
          receipt_number: string | null
          source_id: string
          source_kind: string
          source_protocol: string
          station_id: string
          tenant_id: string
          total_cost: number
          unit: string
          unit_price: number
          vehicle_id: string
          vehicle_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "station_monthly_closing_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_station_closing_register: {
        Args: { p_from?: string; p_station_id?: string; p_to?: string }
        Returns: {
          closing_id: string
          closing_status: string
          commitment_amount: number
          commitment_number: string
          competence: string
          contract_number: string
          fiscal_status: string
          invoice_amount: number
          invoice_attested_at: string
          invoice_id: string
          invoice_issued_on: string
          invoice_number: string
          invoice_status: string
          last_payment_date: string
          nad_number: string
          next_payment_date: string
          paid_amount: number
          protocol: string
          record_count: number
          reviewed_at: string
          scheduled_amount: number
          snapshot_hash: string
          station_cnpj: string
          station_id: string
          station_name: string
          submitted_at: string
          total_amount: number
          total_quantity: number
        }[]
      }
      get_station_closings: {
        Args: { p_month?: string; p_station_id?: string }
        Returns: {
          closing_id: string
          competence: string
          protocol: string
          record_count: number
          review_note: string
          reviewed_at: string
          reviewed_by_name: string
          snapshot_hash: string
          station_id: string
          station_name: string
          status: string
          submitted_at: string
          submitted_by_name: string
          total_amount: number
          total_quantity: number
        }[]
      }
      get_station_fiscal_dashboard: {
        Args: { p_months?: number; p_station_id?: string }
        Returns: {
          closed_amount: number
          integrity_failures: number
          invoiced_amount: number
          open_amount: number
          paid_amount: number
          paid_closings: number
          pending_attestation: number
          pending_commitment: number
          pending_invoice: number
          pending_payment: number
          pending_review: number
          station_id: string
          station_name: string
          total_closings: number
        }[]
      }
      get_station_history: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_to?: string
        }
        Returns: {
          brand: string
          filled_at: string
          fuel_type: string
          fueling_id: string
          has_anomaly: boolean
          liters: number
          model: string
          odometer: number
          photo_url: string
          plate: string
          price_per_liter: number
          receipt_no: string
          rejection_reason: string
          total_cost: number
          total_count: number
          workflow_status: string
        }[]
      }
      get_station_history_item: {
        Args: { p_fueling_id: string }
        Returns: {
          brand: string
          filled_at: string
          fuel_type: string
          fueling_id: string
          has_anomaly: boolean
          liters: number
          model: string
          odometer: number
          photo_url: string
          plate: string
          price_per_liter: number
          receipt_no: string
          rejection_reason: string
          total_cost: number
          workflow_status: string
        }[]
      }
      get_station_monthly_summary: {
        Args: { p_month?: string }
        Returns: {
          fuel_type: string
          pending_amount: number
          pending_count: number
          rejected_count: number
          total_amount: number
          total_count: number
          total_liters: number
          validated_amount: number
          validated_count: number
        }[]
      }
      get_station_pending_authorizations: {
        Args: never
        Returns: {
          authorized_at: string
          brand: string
          expires_at: string
          fuel_type: string
          fueling_id: string
          max_liters: number
          model: string
          note: string
          plate: string
          price_per_liter: number
        }[]
      }
      get_tenant_branding: {
        Args: { p_slug: string }
        Returns: {
          accent_color: string
          app_name: string
          dark_color: string
          login_eyebrow: string
          logo_url: string
          name: string
          photo_url: string
          primary_color: string
          seal_url: string
          slug: string
          status: string
        }[]
      }
      get_trip_timeline: { Args: { p_trip_id: string }; Returns: Json }
      get_unregistered_movements: {
        Args: never
        Returns: {
          event_count: number
          first_seen: string
          last_seen: string
          plate: string
          vehicle_id: string
        }[]
      }
      get_user_current_vehicle_id: { Args: never; Returns: string }
      get_user_department_id: { Args: never; Returns: string }
      get_user_repair_shop_id: { Args: never; Returns: string }
      get_user_station_id: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      get_workshop_monthly_summary: {
        Args: { p_month?: string }
        Returns: {
          attested_amount: number
          balance: number
          category: string
          financial_status: string
          invoiced_amount: number
          order_id: string
          paid_amount: number
          plate: string
          quoted_amount: number
          received_at: string
        }[]
      }
      has_procurement_station_binding: {
        Args: { p_operation: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_manager: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_motorista: { Args: never; Returns: boolean }
      is_oficina: { Args: never; Returns: boolean }
      is_posto: { Args: never; Returns: boolean }
      is_secretario: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      issue_procurement_fueling: {
        Args: { p_payload: Json; p_request: string }
        Returns: string
      }
      issue_procurement_station_operation: {
        Args: { p_payload: Json; p_request: string }
        Returns: string
      }
      log_login: { Args: { p_source?: string }; Returns: undefined }
      log_manual_activity: {
        Args: {
          p_action: string
          p_actor_id: string
          p_entity_id: string
          p_entity_type: string
          p_note?: string
        }
        Returns: undefined
      }
      manager_attest_service_order_invoice: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      manager_attest_service_order_invoice_before_workshop_attestatio: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      manager_attest_service_order_invoice_v2: {
        Args: { p_glosa_amount?: number; p_invoice_id: string; p_note?: string }
        Returns: undefined
      }
      manager_attest_station_closing_invoice: {
        Args: { p_invoice_id: string; p_note?: string }
        Returns: undefined
      }
      manager_authorize_service_order: {
        Args: { p_note?: string; p_order_id: string; p_repair_shop_id: string }
        Returns: undefined
      }
      manager_cancel_fueling_authorization: {
        Args: { p_fueling_id: string; p_reason: string }
        Returns: undefined
      }
      manager_cancel_service_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      manager_cancel_service_order_before_workshop_reservation: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      manager_confirm_shop_delivery: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      manager_confirm_station_closing_payment: {
        Args: {
          p_paid_on: string
          p_payment_id: string
          p_receipt_path?: string
          p_reference: string
        }
        Returns: undefined
      }
      manager_create_direct_fueling: {
        Args: {
          p_driver_id: string
          p_fuel_type: string
          p_full_tank?: boolean
          p_liters: number
          p_occurred_on?: string
          p_odometer: number
          p_photo_dashboard_url?: string
          p_photo_requisition_url?: string
          p_price_per_liter: number
          p_station_id?: string
          p_station_name?: string
          p_vehicle_id: string
        }
        Returns: string
      }
      manager_create_fueling_authorization: {
        Args: {
          p_driver_id: string
          p_expires_at?: string
          p_fuel_type: string
          p_max_liters?: number
          p_note?: string
          p_station_id: string
          p_vehicle_id: string
        }
        Returns: string
      }
      manager_create_service_order: {
        Args: {
          p_category: string
          p_checklist_id?: string
          p_description: string
          p_driver_id: string
          p_odometer?: number
          p_priority: string
          p_vehicle_id: string
        }
        Returns: string
      }
      manager_create_station_operation: {
        Args: {
          p_catalog_item_id: string
          p_driver_id: string
          p_expires_at?: string
          p_note?: string
          p_quantity: number
          p_station_id: string
          p_vehicle_id: string
        }
        Returns: string
      }
      manager_delete_vehicle: {
        Args: { p_plate_confirmation: string; p_vehicle_id: string }
        Returns: undefined
      }
      manager_get_station_commitment_balance: {
        Args: { p_on?: string; p_station_id: string }
        Returns: number
      }
      manager_get_station_operations: {
        Args: { p_from?: string; p_station_id?: string; p_to?: string }
        Returns: {
          authorized_at: string
          authorizer_name: string
          department_name: string
          driver_name: string
          evidence_path: string
          executed_at: string
          item_kind: string
          item_name: string
          odometer: number
          operation_id: string
          plate: string
          protocol: string
          quantity: number
          receipt_number: string
          rejection_reason: string
          station_name: string
          status: string
          total_cost: number
          unit: string
          unit_price: number
          vehicle_name: string
        }[]
      }
      manager_link_station_closing_commitment: {
        Args: { p_closing_id: string; p_commitment_id: string }
        Returns: undefined
      }
      manager_list_station_catalog: {
        Args: { p_include_inactive?: boolean; p_station_id?: string }
        Returns: {
          active: boolean
          item_id: string
          kind: string
          name: string
          requires_odometer: boolean
          station_id: string
          station_name: string
          unit: string
          unit_price: number
        }[]
      }
      manager_list_station_commitments: {
        Args: { p_station_id?: string }
        Returns: {
          allocated_amount: number
          amount: number
          available_amount: number
          commitment_id: string
          commitment_number: string
          document_path: string
          issued_on: string
          nad_number: string
          station_id: string
          station_name: string
          status: string
          valid_from: string
          valid_until: string
        }[]
      }
      manager_receive_service_order_vehicle: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      manager_receive_service_order_vehicle_before_workshop_reservati: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      manager_register_service_order_commitment:
        | {
            Args: {
              p_commitment_number: string
              p_nad_number?: string
              p_order_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_commitment_number: string
              p_document_path: string
              p_nad_number: string
              p_order_id: string
            }
            Returns: undefined
          }
      manager_register_service_order_payment: {
        Args: {
          p_amount: number
          p_invoice_id?: string
          p_note?: string
          p_order_id: string
          p_paid_at?: string
        }
        Returns: boolean
      }
      manager_register_service_order_payment_before_workshop_invoice_: {
        Args: {
          p_amount: number
          p_invoice_id?: string
          p_note?: string
          p_order_id: string
          p_paid_at?: string
        }
        Returns: boolean
      }
      manager_register_station_commitment: {
        Args: {
          p_amount: number
          p_commitment_number: string
          p_document_path: string
          p_issued_on: string
          p_nad_number: string
          p_station_id: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: string
      }
      manager_review_fueling: {
        Args: { p_approved: boolean; p_fueling_id: string; p_note?: string }
        Returns: undefined
      }
      manager_review_service_order_quote: {
        Args: { p_approved: boolean; p_note?: string; p_quote_id: string }
        Returns: undefined
      }
      manager_review_service_order_quote_before_procurement_links: {
        Args: { p_approved: boolean; p_note?: string; p_quote_id: string }
        Returns: undefined
      }
      manager_review_service_order_quote_before_workshop_reservation: {
        Args: { p_approved: boolean; p_note?: string; p_quote_id: string }
        Returns: undefined
      }
      manager_review_station_closing: {
        Args: { p_approved: boolean; p_closing_id: string; p_note?: string }
        Returns: undefined
      }
      manager_review_station_operation: {
        Args: { p_approved: boolean; p_note?: string; p_operation_id: string }
        Returns: undefined
      }
      manager_schedule_station_closing_payment: {
        Args: {
          p_amount: number
          p_closing_id: string
          p_note?: string
          p_scheduled_on: string
        }
        Returns: string
      }
      manager_update_service_order_request: {
        Args: {
          p_category: string
          p_description: string
          p_driver_id: string
          p_odometer?: number
          p_order_id: string
          p_priority: string
          p_vehicle_id: string
        }
        Returns: undefined
      }
      manager_upsert_station_catalog_item: {
        Args: {
          p_active?: boolean
          p_code?: string
          p_item_id: string
          p_kind: string
          p_name: string
          p_requires_odometer?: boolean
          p_station_id: string
          p_unit: string
          p_unit_price: number
        }
        Returns: string
      }
      notify_admins: {
        Args: {
          p_body: string
          p_entity_id?: string
          p_entity_type?: string
          p_link?: string
          p_tenant?: string
          p_title: string
          p_type: string
        }
        Returns: number
      }
      notify_cnh_expiring: { Args: never; Returns: undefined }
      notify_fleet_managers: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_link: string
          p_tenant_id: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      notify_partner_profile: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_link: string
          p_partner_id: string
          p_partner_role: string
          p_tenant_id: string
          p_title: string
          p_type: string
        }
        Returns: number
      }
      notify_users: {
        Args: {
          p_body: string
          p_entity_id?: string
          p_entity_type?: string
          p_link?: string
          p_title: string
          p_type: string
          p_user_ids: string[]
        }
        Returns: number
      }
      partner_complete_fueling: {
        Args: {
          p_fueling_id: string
          p_liters: number
          p_odometer: number
          p_photo_url?: string
          p_receipt_no?: string
        }
        Returns: {
          fueling_id: string
          price_per_liter: number
          total_cost: number
        }[]
      }
      partner_complete_fueling_v2: {
        Args: {
          p_fueling_id: string
          p_liters: number
          p_odometer: number
          p_photo_url: string
          p_receipt_no: string
        }
        Returns: {
          fueling_id: string
          price_per_liter: number
          total_cost: number
        }[]
      }
      partner_complete_station_operation: {
        Args: {
          p_evidence_path: string
          p_odometer: number
          p_operation_id: string
          p_quantity: number
          p_receipt_number: string
        }
        Returns: {
          protocol: string
          total_cost: number
          unit_price: number
        }[]
      }
      partner_context: {
        Args: never
        Returns: {
          kind: string
          partner_id: string
          partner_name: string
          profile_id: string
          tenant_id: string
        }[]
      }
      partner_get_pending_station_operations: {
        Args: never
        Returns: {
          authorized_at: string
          authorized_quantity: number
          brand: string
          expires_at: string
          item_kind: string
          item_name: string
          model: string
          note: string
          operation_id: string
          plate: string
          protocol: string
          unit: string
          unit_price: number
        }[]
      }
      partner_read_context: {
        Args: never
        Returns: {
          kind: string
          partner_id: string
          partner_name: string
          profile_id: string
          tenant_id: string
        }[]
      }
      partner_submit_station_closing_invoice: {
        Args: {
          p_amount: number
          p_closing_id: string
          p_document_path: string
          p_invoice_number: string
          p_issued_on: string
        }
        Returns: string
      }
      partner_submit_station_monthly_closing: {
        Args: { p_month: string }
        Returns: string
      }
      preview_procurement_operation: {
        Args: { p_payload: Json }
        Returns: Json
      }
      profile_history_count: { Args: { p_profile_id: string }; Returns: number }
      purge_old_notifications: {
        Args: { p_days_all?: number; p_days_read?: number }
        Returns: {
          removidas_antigas: number
          removidas_lidas: number
        }[]
      }
      reconcile_procurement_legacy_entry: {
        Args: {
          p_allocation: string
          p_documents: Json
          p_instrument: string
          p_justification: string
          p_source_id: string
          p_source_type: string
        }
        Returns: string
      }
      register_push_token: {
        Args: { p_platform?: string; p_token: string }
        Returns: undefined
      }
      release_stale_trip: {
        Args: { p_reason?: string; p_vehicle_id: string }
        Returns: {
          previous_driver_name: string
          released: boolean
          trip_id: string
        }[]
      }
      repair_shop_contract_committed: {
        Args: { p_repair_shop_id: string }
        Returns: number
      }
      repair_shop_contract_usage: {
        Args: { p_repair_shop_id: string }
        Returns: {
          consumed_value: number
          disputed_value: number
          invoiced_value: number
          month_realized_value: number
          paid_value: number
          realized_value: number
          reserved_value: number
        }[]
      }
      repair_shop_finish_service: {
        Args: { p_note?: string; p_order_id: string }
        Returns: undefined
      }
      repair_shop_finish_service_v2: {
        Args: { p_note: string; p_order_id: string; p_photo_urls: string[] }
        Returns: undefined
      }
      repair_shop_start_service: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      repair_shop_submit_invoice: {
        Args: {
          p_amount: number
          p_file_path?: string
          p_invoice_number: string
          p_issued_at?: string
          p_order_id: string
        }
        Returns: string
      }
      repair_shop_submit_invoice_v2: {
        Args: {
          p_amount: number
          p_file_path: string
          p_invoice_number: string
          p_issued_at?: string
          p_order_id: string
        }
        Returns: string
      }
      repair_shop_submit_invoice_v2_before_workshop_attestation: {
        Args: {
          p_amount: number
          p_file_path: string
          p_invoice_number: string
          p_issued_at?: string
          p_order_id: string
        }
        Returns: string
      }
      repair_shop_submit_invoice_v3: {
        Args: {
          p_amount: number
          p_file_path: string
          p_invoice_number: string
          p_issued_at: string
          p_lines: Json
          p_order_id: string
        }
        Returns: string
      }
      repair_shop_submit_quote: {
        Args: {
          p_items: Json
          p_note?: string
          p_order_id: string
          p_valid_until?: string
        }
        Returns: string
      }
      repair_shop_submit_quote_v2: {
        Args: {
          p_items: Json
          p_note?: string
          p_order_id: string
          p_valid_until?: string
        }
        Returns: string
      }
      repair_shop_submit_quote_v3: {
        Args: {
          p_items: Json
          p_note?: string
          p_order_id: string
          p_valid_until?: string
        }
        Returns: string
      }
      resolve_tenant_host: {
        Args: { p_slug: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      rl_check_and_hit: {
        Args: {
          p_increment?: number
          p_key: string
          p_max_hits: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          retry_after_seconds: number
        }[]
      }
      save_department_budget: { Args: { p_payload: Json }; Returns: string }
      save_instrument_budget: { Args: { p_payload: Json }; Returns: string }
      save_procurement_item: { Args: { p_payload: Json }; Returns: string }
      save_procurement_price: { Args: { p_payload: Json }; Returns: string }
      save_procurement_registry: {
        Args: { p_kind: string; p_payload: Json }
        Returns: string
      }
      service_order_manager_context: {
        Args: never
        Returns: {
          profile_id: string
          superadmin: boolean
          tenant_id: string
        }[]
      }
      set_quote_procurement_links: {
        Args: { p_links: Json; p_quote_id: string; p_reason: string }
        Returns: undefined
      }
      sgf_role: { Args: never; Returns: string }
      sgf_tenant: { Args: never; Returns: string }
      station_closing_calculate_hash: {
        Args: { p_closing_id: string }
        Returns: string
      }
      station_commitment_available: {
        Args: { p_commitment_id: string }
        Returns: number
      }
      station_commitment_total_available: {
        Args: { p_on: string; p_station_id: string }
        Returns: number
      }
      station_contract_committed: {
        Args: { p_station_id: string }
        Returns: number
      }
      station_contract_committed_before_station_procurement: {
        Args: { p_station_id: string }
        Returns: number
      }
      station_contract_usage: {
        Args: { p_station_id: string }
        Returns: {
          consumed_value: number
          disputed_value: number
          month_realized_value: number
          realized_value: number
          reserved_value: number
        }[]
      }
      takeover_vehicle: {
        Args: { p_vehicle_id: string }
        Returns: {
          ended_trip_id: string
          previous_driver_name: string
          success: boolean
        }[]
      }
      trip_last_activity_at: {
        Args: { p_start_at: string; p_trip_id: string }
        Returns: string
      }
      trip_stale_after_hours: { Args: never; Returns: number }
      trip_tracking_mode: { Args: { p_vehicle_id: string }; Returns: string }
      trip_watchdog: { Args: never; Returns: number }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      vehicle_tracker_live: { Args: { p_vehicle_id: string }; Returns: boolean }
    }
    Enums: {
      checklist_state: "ok" | "atencao" | "pendente"
      driver_lifecycle: "ativo" | "inativo" | "suspenso"
      fuel_type_enum: "diesel" | "gasolina" | "etanol" | "flex"
      fueling_workflow_status:
        | "autorizado"
        | "concluido"
        | "rejeitado_motorista"
        | "validado"
        | "rejeitado_admin"
        | "lancado_direto"
      issue_severity: "baixa" | "media" | "alta"
      issue_status: "aberto" | "em_analise" | "resolvido"
      service_order_fin_status:
        | "not_started"
        | "awaiting_commitment"
        | "committed"
        | "invoiced"
        | "attested"
        | "paid"
      service_order_op_status:
        | "pending"
        | "authorized"
        | "at_shop"
        | "awaiting_quote_approval"
        | "in_progress"
        | "ready"
        | "received"
        | "cancelled"
      service_order_status:
        | "pendente"
        | "aprovada"
        | "rejeitada"
        | "em_execucao"
        | "concluida"
      trip_status: "andamento" | "concluida" | "problema"
      vehicle_status: "liberado" | "manutencao" | "bloqueado"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      checklist_state: ["ok", "atencao", "pendente"],
      driver_lifecycle: ["ativo", "inativo", "suspenso"],
      fuel_type_enum: ["diesel", "gasolina", "etanol", "flex"],
      fueling_workflow_status: [
        "autorizado",
        "concluido",
        "rejeitado_motorista",
        "validado",
        "rejeitado_admin",
        "lancado_direto",
      ],
      issue_severity: ["baixa", "media", "alta"],
      issue_status: ["aberto", "em_analise", "resolvido"],
      service_order_fin_status: [
        "not_started",
        "awaiting_commitment",
        "committed",
        "invoiced",
        "attested",
        "paid",
      ],
      service_order_op_status: [
        "pending",
        "authorized",
        "at_shop",
        "awaiting_quote_approval",
        "in_progress",
        "ready",
        "received",
        "cancelled",
      ],
      service_order_status: [
        "pendente",
        "aprovada",
        "rejeitada",
        "em_execucao",
        "concluida",
      ],
      trip_status: ["andamento", "concluida", "problema"],
      vehicle_status: ["liberado", "manutencao", "bloqueado"],
    },
  },
} as const
