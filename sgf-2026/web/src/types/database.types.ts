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
          registration_number: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          tenant_id: string
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
          registration_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          tenant_id: string
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
          registration_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          tenant_id?: string
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
          contract_end: string | null
          contract_number: string | null
          contract_start: string | null
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
          contract_end?: string | null
          contract_number?: string | null
          contract_start?: string | null
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
          contract_end?: string | null
          contract_number?: string | null
          contract_start?: string | null
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
      profiles: {
        Row: {
          access_blocked: boolean
          birth_date: string | null
          cnh_category: string | null
          cnh_ear: boolean
          cnh_expiry: string | null
          cnh_number: string | null
          cpf: string | null
          created_at: string
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
          shift_end: string | null
          shift_start: string | null
          station_id: string | null
          tenant_id: string
        }
        Insert: {
          access_blocked?: boolean
          birth_date?: string | null
          cnh_category?: string | null
          cnh_ear?: boolean
          cnh_expiry?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
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
          shift_end?: string | null
          shift_start?: string | null
          station_id?: string | null
          tenant_id?: string
        }
        Update: {
          access_blocked?: boolean
          birth_date?: string | null
          cnh_category?: string | null
          cnh_ear?: boolean
          cnh_expiry?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
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
          shift_end?: string | null
          shift_start?: string | null
          station_id?: string | null
          tenant_id?: string
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
          contract_end: string | null
          contract_number: string | null
          contract_start: string | null
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
          contract_end?: string | null
          contract_number?: string | null
          contract_start?: string | null
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
          contract_end?: string | null
          contract_number?: string | null
          contract_start?: string | null
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
      service_order_invoices: {
        Row: {
          amount: number
          attested_at: string | null
          attested_by: string | null
          commitment_number: string | null
          created_at: string
          file_path: string | null
          id: string
          invoice_number: string
          issued_at: string
          repair_shop_id: string
          service_order_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          attested_at?: string | null
          attested_by?: string | null
          commitment_number?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          repair_shop_id: string
          service_order_id: string
          tenant_id?: string
        }
        Update: {
          amount?: number
          attested_at?: string | null
          attested_by?: string | null
          commitment_number?: string | null
          created_at?: string
          file_path?: string | null
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
      service_order_quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: string
          qty: number
          quote_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kind: string
          qty?: number
          quote_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: string
          qty?: number
          quote_id?: string
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
          commitment_number: string | null
          completed_at: string | null
          cost: number | null
          created_at: string
          description: string | null
          driver_id: string
          financial_status: Database["public"]["Enums"]["service_order_fin_status"]
          id: string
          nad_number: string | null
          odometer: number | null
          operational_status: Database["public"]["Enums"]["service_order_op_status"]
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
          commitment_number?: string | null
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          driver_id: string
          financial_status?: Database["public"]["Enums"]["service_order_fin_status"]
          id?: string
          nad_number?: string | null
          odometer?: number | null
          operational_status?: Database["public"]["Enums"]["service_order_op_status"]
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
          commitment_number?: string | null
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          driver_id?: string
          financial_status?: Database["public"]["Enums"]["service_order_fin_status"]
          id?: string
          nad_number?: string | null
          odometer?: number | null
          operational_status?: Database["public"]["Enums"]["service_order_op_status"]
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
          slug: string
          state: string | null
          status: string
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
          slug: string
          state?: string | null
          status?: string
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
          slug?: string
          state?: string | null
          status?: string
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
      auto_close_abandoned_trips: {
        Args: { p_hours?: number }
        Returns: number
      }
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
      delete_own_account: { Args: never; Returns: undefined }
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
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_manager: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_motorista: { Args: never; Returns: boolean }
      is_oficina: { Args: never; Returns: boolean }
      is_posto: { Args: never; Returns: boolean }
      is_secretario: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
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
      register_push_token: {
        Args: { p_platform?: string; p_token: string }
        Returns: undefined
      }
      resolve_tenant_host: {
        Args: { p_slug: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      release_stale_trip: {
        Args: { p_reason?: string; p_vehicle_id: string }
        Returns: {
          previous_driver_name: string
          released: boolean
          trip_id: string
        }[]
      }
      repair_shop_finish_service: {
        Args: { p_note?: string; p_order_id: string }
        Returns: undefined
      }
      repair_shop_finish_service_v2: {
        Args: {
          p_note: string
          p_order_id: string
          p_photo_urls: string[]
        }
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
      sgf_role: { Args: never; Returns: string }
      sgf_tenant: { Args: never; Returns: string }
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
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
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
