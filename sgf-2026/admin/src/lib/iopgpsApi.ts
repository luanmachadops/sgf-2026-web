import { supabase } from './supabase';
import { apiUrl } from './apiBase';

// NOTE: device_status / device_commands / iopgps_credentials ainda não estão no
// database.types.ts gerado (rode `supabase gen types` após aplicar a migration
// 20260630_000001_iopgps_integration.sql). Até lá usamos um client destipado
// apenas para essas tabelas novas.
const sb = supabase as unknown as {
  from: (t: string) => any;
  functions: { invoke: (name: string, opts: { body: unknown }) => Promise<{ data: any; error: any }> };
};

export interface DeviceStatus {
  tracker_id: string;
  tenant_id: string;
  vehicle_id: string | null;
  imei: string;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  course: number | null;
  ignition: boolean | null;
  online: boolean | null;
  voltage: number | null;
  fix_source: string | null;
  gps_time: string | null;
  updated_at: string;
}

export interface DeviceCommand {
  id: string;
  tenant_id: string;
  vehicle_id: string | null;
  imei: string;
  command: 'FUEL_CUT' | 'FUEL_RESTORE';
  command_id: string | null;
  status: string;
  issued_by: string | null;
  created_at: string;
  responded_at: string | null;
}

export const iopgpsApi = {
  status: async (tenantId?: string): Promise<DeviceStatus[]> => {
    let q = sb.from('device_status').select('*').order('updated_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as DeviceStatus[];
  },

  commands: async (tenantId?: string): Promise<DeviceCommand[]> => {
    let q = sb.from('device_commands').select('*').order('created_at', { ascending: false }).limit(100);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as DeviceCommand[];
  },

  /** Dispara o sync manualmente (mesma Edge Function do cron). */
  syncNow: async (): Promise<{ positions: number; alarms: number }> => {
    const { data, error } = await sb.functions.invoke('iopgps-sync', { body: {} });
    if (error) throw new Error(error.message);
    if (data && data.ok === false) throw new Error(data.error || 'Falha no sync');
    return { positions: data?.positions ?? 0, alarms: data?.alarms ?? 0 };
  },

  /** Corte/retomada de combustível (auditado). */
  fuelCommand: async (trackerId: string, command: 'FUEL_CUT' | 'FUEL_RESTORE'): Promise<string> => {
    const { data, error } = await sb.functions.invoke('iopgps-command', { body: { trackerId, command } });
    if (error) throw new Error(error.message);
    if (data && data.ok === false) throw new Error(data.error || 'Falha ao enviar comando');
    return data?.commandId ?? '';
  },

  /** Salva/atualiza as credenciais da conta IOPGPS (global ou por prefeitura).
   *  Via serverless service-role (a tabela é bloqueada por RLS no cliente). */
  saveCredentials: async (payload: {
    tenant_id?: string | null; base_url?: string; appid: string; app_secret: string;
  }): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(apiUrl('iopgps'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ action: 'saveCredentials', ...payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || 'Falha ao salvar credenciais');
  },
};
