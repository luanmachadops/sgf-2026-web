// iopgps-history — retorna o trajeto de uma viagem.
// A IOPGPS não expõe endpoint de playback na Open API; o trajeto é construído
// pelo próprio iopgps-sync, que grava pontos em trip_locations a cada ciclo.
// Esta função apenas lê esses pontos (com checagem de papel/tenant).
// Body: { tripId: string }
import { admin, cors, requireRole } from '../_shared/ctx.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  try {
    if (req.method !== 'POST') throw Object.assign(new Error('Method not allowed'), { status: 405 });
    const me = await requireRole(db, req, ['superadmin', 'admin', 'gestor']);
    const { tripId } = await req.json();
    if (!tripId) throw Object.assign(new Error('tripId obrigatório'), { status: 400 });

    const { data: trip } = await db.from('trips').select('id, tenant_id').eq('id', tripId).single();
    if (!trip) throw Object.assign(new Error('Viagem não encontrada'), { status: 404 });
    if (me.role !== 'superadmin' && trip.tenant_id !== me.tenantId) {
      throw Object.assign(new Error('Sem permissão'), { status: 403 });
    }

    const { data: points } = await db.from('trip_locations')
      .select('lat, lng, speed, heading, recorded_at')
      .eq('trip_id', tripId)
      .order('recorded_at', { ascending: true });

    return new Response(JSON.stringify({ ok: true, points: points?.length ?? 0, track: points ?? [] }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 400;
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
