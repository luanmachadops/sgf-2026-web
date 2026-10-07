// iopgps-sync — chamado pelo pg_cron (~1x/min).
// 1) para cada tenant com rastreadores ativos: /track dos IMEIs
// 2) resolve tracker → vehicle → viagem ativa → driver
// 3) upsert device_status (sempre)  +  upsert live_positions (se em viagem)
// 4) alarms incremental → device_alarms
// 5) detecção de ociosidade: motor ligado + parado por N min → notifications
import { admin, cors, iopgpsFor, requireRole } from '../_shared/ctx.ts';
import type { TrackPoint } from '../_shared/iopgps.ts';

// Ociosidade: velocidade abaixo disso com ignição ligada conta como "parado".
const IDLE_SPEED_KMH = 3;
// Minutos contínuos de ociosidade antes de emitir o alerta (1 por episódio).
const IDLE_ALERT_MINUTES = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  const started = Date.now();
  const report: Record<string, unknown> = {};

  // Autorização: aceita o segredo do cron (x-cron-secret, guardado em app_config)
  // OU um usuário autenticado com papel de gestão (botão "Sincronizar agora").
  // Escopo: cron e superadmin sincronizam TODOS os tenants; gestor/admin, só o próprio.
  let scopeTenantId: string | null = null;
  try {
    const provided = req.headers.get('x-cron-secret');
    let cronOk = false;
    if (provided) {
      const { data: cfg } = await db.from('app_config').select('value').eq('key', 'iopgps_cron_secret').maybeSingle();
      cronOk = !!cfg && cfg.value === provided;
    }
    if (!cronOk) {
      const caller = await requireRole(db, req, ['superadmin', 'admin', 'gestor']);
      if (caller.role !== 'superadmin') {
        if (!caller.tenantId) throw Object.assign(new Error('Perfil sem tenant'), { status: 403 });
        scopeTenantId = caller.tenantId;
      }
    }
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 401;
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    // Rastreadores ativos (com ou sem veículo). device_status cobre todos;
    // live_positions só é alimentado quando há veículo + viagem ativa.
    let trackersQuery = db
      .from('trackers')
      .select('id, identifier, tenant_id, vehicle_id, active')
      .eq('active', true);
    if (scopeTenantId) trackersQuery = trackersQuery.eq('tenant_id', scopeTenantId);
    const { data: trackers, error } = await trackersQuery;
    if (error) throw error;

    // Agrupa por tenant.
    const byTenant = new Map<string, typeof trackers>();
    for (const t of trackers ?? []) {
      const arr = byTenant.get(t.tenant_id) ?? [];
      arr.push(t);
      byTenant.set(t.tenant_id, arr);
    }

    let totalPositions = 0;
    let totalAlarms = 0;
    let totalIdleAlerts = 0;

    for (const [tenantId, list] of byTenant) {
      const client = await iopgpsFor(db, tenantId);
      if (!client) continue; // sem credencial configurada p/ esse tenant

      const imeis = list.map((t) => t.identifier);
      const byImei = new Map(list.map((t) => [t.identifier, t]));

      // ---- posições em tempo real ----
      let points: TrackPoint[] = [];
      try {
        points = await client.track(imeis);
      } catch (e) {
        report[`tenant_${tenantId}_track_error`] = String(e);
        continue;
      }

      // Viagens ativas dos veículos desse tenant (status 'andamento').
      const vehicleIds = list.map((t) => t.vehicle_id).filter(Boolean) as string[];
      const { data: trips } = await db
        .from('trips')
        .select('id, vehicle_id, driver_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'andamento')
        .in('vehicle_id', vehicleIds);
      const tripByVehicle = new Map((trips ?? []).map((tr) => [tr.vehicle_id, tr]));

      // Estado anterior de ociosidade (episódios contínuos entre execuções do cron).
      const { data: prevStatus } = await db
        .from('device_status')
        .select('tracker_id, idle_since, idle_notified_at')
        .in('tracker_id', list.map((t) => t.id));
      const prevByTracker = new Map((prevStatus ?? []).map((r) => [r.tracker_id, r]));

      // Nomes dos veículos (mensagem da notificação) e gestores do tenant (destinatários).
      const { data: vehicles } = vehicleIds.length
        ? await db.from('vehicles').select('id, name, plate').in('id', vehicleIds)
        : { data: [] as { id: string; name: string | null; plate: string | null }[] };
      const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v]));
      let managersCache: { id: string }[] | null = null;
      const getManagers = async () => {
        if (managersCache) return managersCache;
        const { data } = await db.from('profiles').select('id').eq('tenant_id', tenantId).in('role', ['gestor', 'admin']);
        managersCache = data ?? [];
        return managersCache;
      };

      const statusRows: any[] = [];
      const liveRows: any[] = [];
      for (const p of points) {
        const trk = byImei.get(p.imei);
        if (!trk) continue;
        const gpsIso = p.gpsTime ? new Date(p.gpsTime * 1000).toISOString() : new Date().toISOString();

        // ---- ociosidade: motor ligado + parado ----
        const prev = prevByTracker.get(trk.id);
        const isIdle = p.ignition === true && (p.speed ?? 0) <= IDLE_SPEED_KMH;
        let idleSince: string | null = null;
        let idleNotifiedAt: string | null = null;
        if (isIdle) {
          idleSince = prev?.idle_since ?? new Date().toISOString();
          idleNotifiedAt = prev?.idle_notified_at ?? null;
          const idleMin = (Date.now() - new Date(idleSince).getTime()) / 60_000;
          const alreadyNotified = !!idleNotifiedAt && new Date(idleNotifiedAt) >= new Date(idleSince);
          if (idleMin >= IDLE_ALERT_MINUTES && !alreadyNotified && trk.vehicle_id) {
            idleNotifiedAt = new Date().toISOString();
            const veh = vehicleById.get(trk.vehicle_id);
            const label = veh ? `${veh.name ?? 'Veículo'}${veh.plate ? ` (${veh.plate})` : ''}` : 'Veículo';
            const title = 'Motor ligado com veículo parado';
            const body = `${label} está parado com o motor ligado há mais de ${IDLE_ALERT_MINUTES} minutos.`;
            const trip = tripByVehicle.get(trk.vehicle_id);
            const rows: any[] = [];
            if (trip) {
              rows.push({ driver_id: trip.driver_id, tenant_id: tenantId, type: 'warning', title, body, entity_type: 'vehicle', entity_id: trk.vehicle_id });
            }
            for (const m of await getManagers()) {
              if (!trip || m.id !== trip.driver_id) {
                rows.push({ driver_id: m.id, tenant_id: tenantId, type: 'warning', title, body, entity_type: 'vehicle', entity_id: trk.vehicle_id });
              }
            }
            if (rows.length) {
              const { error: notifErr } = await db.from('notifications').insert(rows);
              if (notifErr) report[`tenant_${tenantId}_idle_notify_error`] = notifErr.message;
              else totalIdleAlerts++;
            }
          }
        }

        statusRows.push({
          tracker_id: trk.id, tenant_id: tenantId, vehicle_id: trk.vehicle_id, imei: p.imei,
          lat: p.lat, lng: p.lng, speed: p.speed, course: p.course, ignition: p.ignition,
          online: p.online, voltage: p.voltage,
          idle_since: idleSince, idle_notified_at: idleNotifiedAt,
          fix_source: p.fixSource, gps_time: gpsIso, updated_at: new Date().toISOString(),
        });

        // Em viagem? então alimenta o mapa do gestor (live_positions) com o motorista.
        const trip = trk.vehicle_id ? tripByVehicle.get(trk.vehicle_id) : undefined;
        if (trip) {
          liveRows.push({
            driver_id: trip.driver_id, tenant_id: tenantId, vehicle_id: trk.vehicle_id, trip_id: trip.id,
            lat: p.lat, lng: p.lng, speed: p.speed, heading: p.course, course: p.course,
            ignition: p.ignition, online: p.online, is_active: true,
            source: 'iopgps', fix_source: p.fixSource, updated_at: new Date().toISOString(),
          });
        }
      }

      if (statusRows.length) {
        await db.from('device_status').upsert(statusRows, { onConflict: 'tracker_id' });
      }
      if (liveRows.length) {
        await db.from('live_positions').upsert(liveRows, { onConflict: 'driver_id' });
        // append no histórico da viagem
        await db.from('trip_locations').insert(liveRows.map((r) => ({
          trip_id: r.trip_id, driver_id: r.driver_id, tenant_id: r.tenant_id,
          lat: r.lat, lng: r.lng, speed: r.speed, heading: r.heading,
        })));
      }
      totalPositions += statusRows.length;

      // ---- alarmes (janela curta, dedupe) ----
      const end = Math.floor(Date.now() / 1000);
      const begin = end - 120; // últimos 2 min
      for (const trk of list) {
        try {
          const alarms = await client.alarms(trk.identifier, begin, end);
          for (const a of alarms) {
            await db.from('device_alarms').upsert({
              tenant_id: tenantId, tracker_id: trk.id, vehicle_id: trk.vehicle_id, imei: a.imei,
              device_alarm_id: a.deviceAlarmId, alarm_type: a.alarmType, alarm_code: a.alarmCode,
              lat: a.lat, lng: a.lng, speed: a.speed,
              gps_time: a.gpsTime ? new Date(a.gpsTime * 1000).toISOString() : null,
              raw: a as unknown as Record<string, unknown>,
            }, { onConflict: 'device_alarm_id', ignoreDuplicates: true });
            totalAlarms++;
          }
        } catch (_e) { /* alarmes são best-effort */ }
      }
    }

    report.positions = totalPositions;
    report.alarms = totalAlarms;
    report.idle_alerts = totalIdleAlerts;
    report.ms = Date.now() - started;
    return new Response(JSON.stringify({ ok: true, ...report }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
