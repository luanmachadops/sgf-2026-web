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

async function resolveTenant(req: Request): Promise<{ tenantId: string | null; blocked: boolean }> {
  try {
    const header = req.headers.get('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return { tenantId: null, blocked: false };
    const sb = admin();
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return { tenantId: null, blocked: false };
    const { data: profile } = await sb.from('profiles').select('tenant_id').eq('id', u.user.id).maybeSingle();
    const tenantId = (profile as { tenant_id?: string } | null)?.tenant_id ?? null;
    if (!tenantId) return { tenantId: null, blocked: false };

    const { data: limit } = await sb.from('tenant_ai_limits').select('monthly_cap_usd, enabled').eq('tenant_id', tenantId).maybeSingle();
    const cap = Number((limit as { monthly_cap_usd?: number } | null)?.monthly_cap_usd ?? 0);
    const enabled = (limit as { enabled?: boolean } | null)?.enabled ?? true;
    if (enabled && cap > 0) {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const { data: rows } = await sb.from('ai_usage').select('cost_usd').eq('tenant_id', tenantId).gte('created_at', start.toISOString());
      const spent = (rows ?? []).reduce((s: number, r: { cost_usd?: number }) => s + Number(r.cost_usd ?? 0), 0);
      if (spent >= cap) return { tenantId, blocked: true };
    }
    return { tenantId, blocked: false };
  } catch {
    return { tenantId: null, blocked: false };
  }
}

async function logUsage(tenantId: string | null, usage: Record<string, unknown> | undefined) {
  if (!tenantId) return;
  try {
    await admin().from('ai_usage').insert({
      tenant_id: tenantId,
      feature: 'cnh',
      model: MODEL,
      tokens_in: Number(usage?.prompt_tokens ?? 0),
      tokens_out: Number(usage?.completion_tokens ?? 0),
      cost_usd: Number((usage as { cost?: number } | undefined)?.cost ?? 0),
    });
  } catch { /* nunca quebra a resposta por causa do log */ }
}

const SYSTEM_PROMPT = `Você é um especialista em leitura da CNH brasileira (Carteira Nacional de Habilitação) a partir de fotos.
Você recebe 1 ou 2 fotos da CNH (frente e/ou verso) e extrai os dados do condutor.
Regras importantes:
- Datas SEMPRE no formato ISO \\"YYYY-MM-DD\\".
- CPF apenas com os 11 dígitos (sem pontos/traços).
- A categoria é a habilitação (ex: A, B, AB, C, D, E, AC, AD, AE).
- O número de registro da CNH tem 11 dígitos.
Responda APENAS com um JSON válido (sem markdown, sem texto extra) neste formato exato:
{
  \\"name\\": string|null,          // nome completo do condutor
  \\"cpf\\": string|null,           // somente dígitos (11)
  \\"birthDate\\": string|null,     // YYYY-MM-DD (data de nascimento)
  \\"cnhNumber\\": string|null,     // nº de registro da CNH
  \\"cnhCategory\\": string|null,   // categoria de habilitação
  \\"cnhExpiry\\": string|null,     // YYYY-MM-DD (validade da CNH)
  \\"confidence\\": number          // 0 a 1
}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY não configurada no projeto.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { tenantId, blocked } = await resolveTenant(req);
    if (blocked) {
      return new Response(JSON.stringify({ error: 'Limite mensal de uso de IA atingido para esta prefeitura. Contate o administrador da plataforma.' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const images: string[] = (body.images ?? []).filter((u: unknown) => typeof u === 'string' && u);
    if (images.length === 0) {
      return new Response(JSON.stringify({ error: 'Envie ao menos uma imagem da CNH.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const content: unknown[] = [
      { type: 'text', text: 'Leia a CNH nas imagens e retorne o JSON solicitado.' },
      ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
    ];

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sgf-2026.local',
        'X-Title': 'SGF 2026 - Leitura de CNH',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        usage: { include: true },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: `Erro do provedor de IA: ${aiRes.status}`, detail: t }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const aiJson = await aiRes.json();
    await logUsage(tenantId, aiJson?.usage);
    const raw = aiJson?.choices?.[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    return new Response(JSON.stringify({ data: parsed }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Erro inesperado.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
