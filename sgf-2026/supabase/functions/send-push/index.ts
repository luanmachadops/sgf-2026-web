import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Envia Expo Push para os tokens do destinatário de uma notificação.
// Chamada pelo trigger do banco (pg_net) no INSERT de notifications.
// verify_jwt=false: a chamada vem do banco, sem JWT de usuário.
// Proteção: segredo compartilhado obrigatório, lido de app_secrets
// (tabela privada — RLS sem policies, service role bypassa) ou, se
// definido, da env PUSH_WEBHOOK_SECRET. Migration: push_webhook_secret.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENV_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET'); // opcional, tem precedência

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

let cachedSecret: string | null | undefined;
async function getSecret(): Promise<string | null> {
  if (ENV_SECRET) return ENV_SECRET;
  if (cachedSecret !== undefined) return cachedSecret;
  const { data } = await admin.from('app_secrets').select('value').eq('name', 'PUSH_WEBHOOK_SECRET').maybeSingle();
  cachedSecret = (data?.value as string | undefined) ?? null;
  return cachedSecret;
}

type Notif = {
  id: string;
  driver_id: string;
  title: string;
  body: string;
  type?: string;
  link?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
};

Deno.serve(async (req) => {
  try {
    // Segredo compartilhado obrigatório quando configurado (env ou app_secrets).
    const secret = await getSecret();
    if (secret && req.headers.get('x-webhook-secret') !== secret) {
      return new Response('unauthorized', { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    let notif: Notif | null = payload.record ?? null;
    if (!notif && payload.notification_id) {
      const { data } = await admin.from('notifications').select('*').eq('id', payload.notification_id).single();
      notif = data as Notif | null;
    }
    if (!notif?.driver_id) {
      return new Response(JSON.stringify({ skipped: 'no recipient' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', notif.driver_id);
    const list = (tokens ?? []).map((t: { token: string }) => t.token).filter((t) => t && t.startsWith('ExponentPushToken'));
    if (list.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no tokens' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const messages = list.map((to) => ({
      to,
      sound: 'default',
      title: notif!.title,
      body: notif!.body ?? '',
      priority: 'high',
      channelId: 'default',
      data: { id: notif!.id, link: notif!.link ?? null, entity_type: notif!.entity_type ?? null, entity_id: notif!.entity_id ?? null },
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const out = await res.json();
    return new Response(JSON.stringify({ sent: list.length, expo: out }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
