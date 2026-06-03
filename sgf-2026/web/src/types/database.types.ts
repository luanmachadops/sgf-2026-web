export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: boolean
          fuel_price_mode: string
          org_name: string | null
          cnh_alert_days: number
          contract_alert_days: number
          require_fuel_validation: boolean
          tank_overflow_alert: boolean
          updated_at: string
        }
        Insert: {
          id?: boolean
          fuel_price_mode?: string
          org_name?: string | null
          cnh_alert_days?: number
          contract_alert_days?: number
          require_fuel_validation?: boolean
          tank_overflow_alert?: boolean
          updated_at?: string
        }
        Update: {
          id?: boolean
          fuel_price_mode?: string
          org_name?: string | null
          cnh_alert_days?: number
          contract_alert_days?: number
          require_fuel_validation?: boolean
          tank_overflow_alert?: boolean
          updated_at?: string
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
        }
        Insert: {
          checklist_id: string
          id?: string
          item_key: string
          label: string
          state?: Database["public"]["Enums"]["checklist_state"]
        }
        Update: {
          checklist_id?: string
          id?: string
          item_key?: string
          label?: string
          state?: Database["public"]["Enums"]["checklist_state"]
        }
        Relationships: []
      }
      checklists: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          quick_confirm: boolean
          trip_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          quick_confirm?: boolean
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          quick_confirm?: boolean
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
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
          updated_at?: string
        }
        Relationships: []
      }
      fuelings: {
        Row: {
          anomaly_type: string | null
          authorized_at: string | null
          authorized_by: string | null
          created_at: string
          driver_id: string
          fuel_type: string | null
          has_anomaly: boolean | null
          id: string
          km_per_liter: number | null
          liters: number
          max_liters: number | null
          odometer: number | null
          photo_dashboard_url: string | null
          photo_receipt_url: string | null
          photo_requisition_url: string | null
          photo_url: string | null
          price_per_liter: number | null
          station: string | null
          station_id: string | null
          total_cost: number | null
          trip_id: string | null
          validated_at: string | null
          validated_by: string | null
          vehicle_id: string | null
          workflow_status: Database["public"]["Enums"]["fueling_workflow_status"]
        }
        Insert: {
          anomaly_type?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          created_at?: string
          driver_id: string
          fuel_type?: string | null
          has_anomaly?: boolean | null
          id?: string
          km_per_liter?: number | null
          liters: number
          max_liters?: number | null
          odometer?: number | null
          photo_dashboard_url?: string | null
          photo_receipt_url?: string | null
          photo_requisition_url?: string | null
          photo_url?: string | null
          price_per_liter?: number | null
          station?: string | null
          station_id?: string | null
          total_cost?: number | null
          trip_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id?: string | null
          workflow_status?: Database["public"]["Enums"]["fueling_workflow_status"]
        }
        Update: {
          anomaly_type?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          created_at?: string
          driver_id?: string
          fuel_type?: string | null
          has_anomaly?: boolean | null
          id?: string
          km_per_liter?: number | null
          liters?: number
          max_liters?: number | null
          odometer?: number | null
          photo_dashboard_url?: string | null
          photo_receipt_url?: string | null
          photo_requisition_url?: string | null
          photo_url?: string | null
          price_per_liter?: number | null
          station?: string | null
          station_id?: string | null
          total_cost?: number | null
          trip_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id?: string | null
          workflow_status?: Database["public"]["Enums"]["fueling_workflow_status"]
        }
        Relationships: []
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
          vehicle_id?: string | null
        }
        Relationships: []
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
          title?: string
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: []
      }
      live_positions: {
        Row: {
          driver_id: string
          heading: number | null
          is_active: boolean
          lat: number
          lng: number
          speed: number | null
          trip_id: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          driver_id: string
          heading?: number | null
          is_active?: boolean
          lat: number
          lng: number
          speed?: number | null
          trip_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          driver_id?: string
          heading?: number | null
          is_active?: boolean
          lat?: number
          lng?: number
          speed?: number | null
          trip_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: []
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
          type?: string
          vehicle_id?: string
        }
        Relationships: []
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
          title?: string
          type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
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
          on_duty: boolean
          phone: string | null
          photo_url: string | null
          registration_number: string | null
          role: string
          score: number | null
          shift_end: string | null
          shift_start: string | null
        }
        Insert: {
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
          on_duty?: boolean
          phone?: string | null
          photo_url?: string | null
          registration_number?: string | null
          role?: string
          score?: number | null
          shift_end?: string | null
          shift_start?: string | null
        }
        Update: {
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
          on_duty?: boolean
          phone?: string | null
          photo_url?: string | null
          registration_number?: string | null
          role?: string
          score?: number | null
          shift_end?: string | null
          shift_start?: string | null
        }
        Relationships: []
      }
      service_orders: {
        Row: {
          admin_note: string | null
          approved_at: string | null
          approved_by: string | null
          category: string
          created_at: string
          description: string | null
          driver_id: string
          id: string
          odometer: number | null
          priority: Database["public"]["Enums"]["issue_severity"]
          status: Database["public"]["Enums"]["service_order_status"]
          vehicle_id: string | null
        }
        Insert: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category: string
          created_at?: string
          description?: string | null
          driver_id: string
          id?: string
          odometer?: number | null
          priority?: Database["public"]["Enums"]["issue_severity"]
          status?: Database["public"]["Enums"]["service_order_status"]
          vehicle_id?: string | null
        }
        Update: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          created_at?: string
          description?: string | null
          driver_id?: string
          id?: string
          odometer?: number | null
          priority?: Database["public"]["Enums"]["issue_severity"]
          status?: Database["public"]["Enums"]["service_order_status"]
          vehicle_id?: string | null
        }
        Relationships: []
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
          trip_id?: string
        }
        Relationships: []
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
          notes: string | null
          start_at: string
          start_odometer: number | null
          start_odometer_photo_url: string | null
          status: Database["public"]["Enums"]["trip_status"]
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
          notes?: string | null
          start_at?: string
          start_odometer?: number | null
          start_odometer_photo_url?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
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
          notes?: string | null
          start_at?: string
          start_odometer?: number | null
          start_odometer_photo_url?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          vehicle_id?: string | null
        }
        Relationships: []
      }
      vehicle_documents: {
        Row: {
          created_at: string
          doc_type: string | null
          expires_at: string | null
          id: string
          issued_at: string | null
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
          title?: string
          url?: string
          vehicle_id?: string
        }
        Relationships: []
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
          unit_code?: string
          vehicle_type?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      get_user_department_id: { Args: Record<string, never>; Returns: string }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_admin_or_manager: { Args: Record<string, never>; Returns: boolean }
      is_manager: { Args: Record<string, never>; Returns: boolean }
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
      service_order_status:
        | "pendente"
        | "aprovada"
        | "rejeitada"
        | "em_execucao"
        | "concluida"
      trip_status: "andamento" | "concluida" | "problema"
      vehicle_status: "liberado" | "manutencao" | "bloqueado"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"]
export type Enums<T extends keyof DefaultSchema["Enums"]> = DefaultSchema["Enums"][T]
