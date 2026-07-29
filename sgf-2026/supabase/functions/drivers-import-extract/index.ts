import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'google/gemini-3.6-flash';

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function tenantContext(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return { tenantId: null, blocked: false };
  const sb = admin();
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return { tenantId: null, blocked: false };
  const { data: profile } = await sb.from('profiles').select('tenant_id').eq('id', data.user.id).maybeSingle();
  const tenantId = profile?.tenant_id ?? null;
  if (!tenantId) return { tenantId: null, blocked: false };
  const { data: limit } = await sb.from('tenant_ai_limits').select('monthly_cap_usd, enabled').eq('tenant_id', tenantId).maybeSingle();
  if (!limit?.enabled || Number(limit.monthly_cap_usd ?? 0) <= 0) return { tenantId, blocked: false };
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data: usage } = await sb.from('ai_usage').select('cost_usd').eq('tenant_id', tenantId).gte('created_at', start.toISOString());
  const spent = (usage ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  return { tenantId, blocked: spent >= Number(limit.monthly_cap_usd) };
}

const SYSTEM_PROMPT = `Organize cadastros de motoristas brasileiros extraídos de planilhas, PDFs ou imagens.
Ignore títulos, rodapés, totais e linhas sem pessoa. Não invente dados.
CPF deve conter somente 11 dígitos. Preserve matrícula como texto.
Responda somente JSON válido:
{"drivers":[{"name":"Nome completo","cpf":"00000000000","registrationNumber":"texto ou null"}]}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) throw new Error('OPENROUTER_API_KEY não configurada.');
    const { tenantId, blocked } = await tenantContext(req);
    if (blocked) return new Response(JSON.stringify({ error: 'Limite mensal de IA atingido.' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.slice(0, 60000) : '';
    const images = Array.isArray(body.images) ? body.images.filter((value: unknown) => typeof value === 'string').slice(0, 12) : [];
    if (!text.trim() && images.length === 0) throw new Error('Envie texto ou imagens para análise.');
    const userContent = images.length
      ? [{ type: 'text', text: 'Leia o documento por OCR e organize todos os motoristas.' }, ...images.map((url: string) => ({ type: 'image_url', image_url: { url } }))]
      : `Organize os motoristas:\n\n${text}`;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://exattusrotta.com.br', 'X-Title': 'Exattus Rotta - Importação de motoristas' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }], temperature: 0.1, response_format: { type: 'json_object' }, usage: { include: true } }),
    });
    if (!response.ok) throw new Error(`Erro do provedor de IA: ${response.status}`);
    const json = await response.json();
    const raw = json?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    if (tenantId) {
      await admin().from('ai_usage').insert({ tenant_id: tenantId, feature: 'driver-import', model: MODEL, tokens_in: Number(json?.usage?.prompt_tokens ?? 0), tokens_out: Number(json?.usage?.completion_tokens ?? 0), cost_usd: Number(json?.usage?.cost ?? 0) });
    }
    return new Response(JSON.stringify({ data: Array.isArray(parsed.drivers) ? parsed.drivers : [] }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
