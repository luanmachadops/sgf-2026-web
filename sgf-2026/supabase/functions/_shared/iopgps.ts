// IOPGPS Open API client (Deno / Supabase Edge Functions).
//
// Base: https://open.iopgps.com   (endpoints VERIFICADOS contra conta real)
// Auth: POST /api/auth { appid, time, signature } -> { code, accessToken, expiresIn(ms) }
//   signature = md5( md5(appSecret) + time )   ✓ confirmado
// Demais chamadas enviam o token no header "accessToken".
//
// Endpoints confirmados:
//   GET /api/device/status?imei=IMEI  -> data:[{ imei,lng,lat,speed,course,
//        accStatus(bool),status(text),positionType(GPS|LBS),gpsTime,signalTime,
//        extVoltage(=V*10),isWireless,gpsNum }]
//   GET /api/device/alarm?imei=&startTime=&endTime= -> details:[{ deviceAlarmId,
//        imei,lat,lng,time,alarmCode(str),alarmTime,alarmType(num),positionType,speed }]
//   GET /api/device?imei=&pageNo=&pageSize= -> data:[{imei,deviceName,deviceType,...}],page
//   POST /api/command/send (comandos) — payload a confirmar p/ corte de combustível.
//
// status text: '离线'=offline · '静止'=parado · '行驶'=em movimento.
// Limites: auth <= 2x/min; demais <= 10x/s; tempos em segundos; coords WGS84.

import { createHash } from 'node:crypto';

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex');
}

export interface IopgpsConfig {
  baseUrl: string;
  appid: string;
  appSecret: string;
  /** token em cache (se ainda válido) para evitar re-auth */
  accessToken?: string | null;
  tokenExpiresAt?: number | null; // epoch ms
}

export interface TrackPoint {
  imei: string;
  lat: number;
  lng: number;
  speed: number | null;
  course: number | null;
  ignition: boolean | null;
  online: boolean | null;
  voltage: number | null;     // tensão externa em volts (extVoltage/10)
  fixSource: 'gps' | 'lbs' | null;
  gpsTime: number | null;     // epoch seconds
}

export interface AlarmRecord {
  deviceAlarmId: string;
  imei: string;
  alarmCode: string;          // ex.: 'ACCOFF', 'SPEEDING'
  alarmType: string;          // rótulo normalizado
  lat: number | null;
  lng: number | null;
  speed: number | null;
  gpsTime: number | null;
}

// Códigos de alarme (string) → rótulo. Confirmados/observados: ACCOFF.
const ALARM_LABELS: Record<string, string> = {
  SOS: 'sos', LOWBATTERY: 'low_battery', SPEEDING: 'speeding',
  GEOIN: 'geofence_in', GEOOUT: 'geofence_out', ACCON: 'acc_on', ACCOFF: 'acc_off',
  IDLE: 'idle', PARKINGTIMEOUT: 'parking_timeout', POWERCUT: 'power_cut',
  VIBRATION: 'vibration', TOW: 'tow',
};
export function alarmLabelOf(code: string): string {
  return ALARM_LABELS[code?.toUpperCase()] ?? code?.toLowerCase() ?? 'unknown';
}

export class IopgpsClient {
  private cfg: IopgpsConfig;
  /** chamado quando um novo token é obtido (para persistir no banco) */
  onToken?: (token: string, expiresAtMs: number) => Promise<void> | void;

  constructor(cfg: IopgpsConfig) {
    this.cfg = cfg;
  }

  private async token(): Promise<string> {
    const now = Date.now();
    if (this.cfg.accessToken && this.cfg.tokenExpiresAt && this.cfg.tokenExpiresAt - 60_000 > now) {
      return this.cfg.accessToken;
    }
    return await this.authenticate();
  }

  async authenticate(): Promise<string> {
    const time = Math.floor(Date.now() / 1000);
    const signature = md5(md5(this.cfg.appSecret) + time); // ✓ confirmado
    const res = await fetch(`${this.cfg.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appid: this.cfg.appid, time, signature }),
    });
    const json = await res.json();
    if (json.code && json.code !== 0) {
      throw new Error(`IOPGPS auth falhou (code=${json.code}): ${json.message ?? ''}`);
    }
    const token: string = json.accessToken;
    if (!token) throw new Error('IOPGPS auth: accessToken ausente na resposta');
    // expiresIn vem em MILISSEGUNDOS (ex.: 7200000 = 2h). Heurística defensiva:
    // valores pequenos (<100000) são tratados como segundos.
    const expiresIn: number = json.expiresIn ?? 7200000;
    const expiresInMs = expiresIn < 100_000 ? expiresIn * 1000 : expiresIn;
    const expiresAtMs = Date.now() + expiresInMs;
    this.cfg.accessToken = token;
    this.cfg.tokenExpiresAt = expiresAtMs;
    if (this.onToken) await this.onToken(token, expiresAtMs);
    return token;
  }

  private async get(path: string, params: Record<string, string | number>): Promise<any> {
    const token = await this.token();
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${this.cfg.baseUrl}${path}?${qs.toString()}`, {
      headers: { accessToken: token },
    });
    const json = await res.json();
    if (json.code && json.code !== 0) throw new Error(`IOPGPS ${path} code=${json.code}: ${json.message ?? ''}`);
    return json;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<any> {
    const token = await this.token();
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accessToken: token },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.code && json.code !== 0) throw new Error(`IOPGPS ${path} code=${json.code}: ${json.message ?? ''}`);
    return json;
  }

  /** Posição/telemetria em tempo real. /api/device/status é por-IMEI. */
  async track(imeis: string[]): Promise<TrackPoint[]> {
    const out: TrackPoint[] = [];
    for (const imei of imeis) {
      let rows: any[] = [];
      try {
        const json = await this.get('/api/device/status', { imei });
        rows = json.data ?? [];
      } catch (_e) { continue; }
      for (const r of rows) {
        if (r.lat == null || r.lng == null) continue;
        out.push({
          imei: String(r.imei),
          lat: Number(r.lat),
          lng: Number(r.lng),
          speed: r.speed != null ? Number(r.speed) : null,
          course: r.course != null ? Number(r.course) : null,
          ignition: typeof r.accStatus === 'boolean' ? r.accStatus : (r.accStatus != null ? Boolean(Number(r.accStatus)) : null),
          online: r.status != null ? r.status !== '离线' : null,
          voltage: r.extVoltage != null ? Number(r.extVoltage) / 10 : null,
          fixSource: r.positionType === 'LBS' ? 'lbs' : 'gps',
          gpsTime: r.gpsTime != null ? Number(r.gpsTime) : null,
        });
      }
    }
    return out;
  }

  /** Alarmes de um IMEI numa janela (epoch seconds). */
  async alarms(imei: string, startTime: number, endTime: number): Promise<AlarmRecord[]> {
    const json = await this.get('/api/device/alarm', { imei, startTime, endTime });
    const rows: any[] = json.details ?? [];
    return rows.map((r) => ({
      deviceAlarmId: String(r.deviceAlarmId ?? `${imei}-${r.alarmCode}-${r.alarmTime ?? r.time}`),
      imei,
      alarmCode: String(r.alarmCode ?? ''),
      alarmType: alarmLabelOf(String(r.alarmCode ?? '')),
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      speed: r.speed != null ? Number(r.speed) : null,
      gpsTime: (r.alarmTime ?? r.time) != null ? Number(r.alarmTime ?? r.time) : null,
    }));
  }

  /** Lista de dispositivos (paginada). /api/device?pageNo&pageSize */
  async deviceList(pageNo = 1, pageSize = 100): Promise<any[]> {
    const json = await this.get('/api/device', { pageNo, pageSize });
    return json.data ?? [];
  }

  /** Envia comando de corte/retomada de combustível. Retorna commandId. */
  async sendFuelCommand(imei: string, cut: boolean): Promise<string> {
    // RELAY,1 = corta combustível/motor; RELAY,0 = retoma.
    const json = await this.post('/api/command/send', { imei, command: cut ? 'RELAY,1' : 'RELAY,0' });
    return String(json.commandId ?? json.result?.commandId ?? json.data?.commandId ?? '');
  }

  /** Cria nó na árvore de usuários (hierarquia prefeitura→secretaria). */
  async createUserNode(payload: Record<string, unknown>): Promise<any> {
    return await this.post('/api/user/create', payload);
  }

  /** Cadastra veículo na IOPGPS já vinculado a um device. */
  async addVehicleBindDevice(payload: Record<string, unknown>): Promise<any> {
    return await this.post('/api/vehicle', payload);
  }
}
