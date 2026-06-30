// iopgps-command — envia corte/retomada de combustível a um rastreador.
// Restrito a superadmin/admin/gestor. Registra em device_commands (auditoria).
// Body: { trackerId: string, command: 'FUEL_CUT' | 'FUEL_RESTORE' }
import { admin, cors, iopgpsFor, requireRole } from '../_shared/ctx.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  try {
    if (req.method !== 'POST') throw Object.assign(new Error('Method not allowed'), { status: 405 });
    const me = await requireRole(db, req, ['superadmin', 'admin', 'gestor']);
    const { trackerId, command } = await req.json();
    if (!trackerId || (command !== 'FUEL_CUT' && command !== 'FUEL_RESTORE')) {
      throw Object.assign(new Error('Parâmetros inválidos'), { status: 400 });
    }

    const { data: trk } = await db.from('trackers')
      .select('id, identifier, tenant_id, vehicle_id').eq('id', trackerId).single();
    if (!trk) throw Object.assign(new Error('Rastreador não encontrado'), { status: 404 });
    // Tenant scoping: não-superadmin só age no próprio tenant.
    if (me.role !== 'superadmin' && trk.tenant_id !== me.tenantId) {
      throw Object.assign(new Error('Sem permissão para este rastreador'), { status: 403 });
    }

    const { data: cmd } = await db.from('device_commands').insert({
      tenant_id: trk.tenant_id, tracker_id: trk.id, vehicle_id: trk.vehicle_id, imei: trk.identifier,
      command, status: 'pending', issued_by: me.userId,
    }).select('id').single();

    const client = await iopgpsFor(db, trk.tenant_id);
    if (!client) throw Object.assign(new Error('Credencial IOPGPS não configurada'), { status: 412 });

    try {
      const commandId = await client.sendFuelCommand(trk.identifier, command === 'FUEL_CUT');
      await db.from('device_commands').update({ command_id: commandId, status: 'sent', responded_at: new Date().toISOString() }).eq('id', cmd!.id);
      return new Response(JSON.stringify({ ok: true, commandId }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (e) {
      await db.from('device_commands').update({ status: 'failed', response: String(e), responded_at: new Date().toISOString() }).eq('id', cmd!.id);
      throw e;
    }
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 400;
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
