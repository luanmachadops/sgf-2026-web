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
      feature: 'vehicle-import',
      model: MODEL,
      tokens_in: Number(usage?.prompt_tokens ?? 0),
      tokens_out: Number(usage?.completion_tokens ?? 0),
      cost_usd: Number((usage as { cost?: number } | undefined)?.cost ?? 0),
    });
  } catch { /* nunca quebra a resposta por causa do log */ }
}

const SYSTEM_PROMPT = `Você é um especialista em organizar cadastros de frota do setor público BRASILEIRO.
Recebe TEXTO BRUTO extraído de um PDF, relatório, e-mail ou lista colada (colunas podem estar separadas por espaços, tabulações, ";" ou "|"; pode haver cabeçalhos, rodapés, números de página e linhas de total que devem ser IGNORADOS).
Sua tarefa: identificar CADA veículo e devolver uma linha estruturada por veículo.

REGRAS:
- Devolva TODOS os campos de texto em PORTUGUÊS DO BRASIL.
- "brand" = apenas a marca/montadora (ex.: Fiat, Volkswagen, Chevrolet, Mercedes-Benz). Normalize abreviações: VW→Volkswagen, GM→Chevrolet, M.BENZ→Mercedes-Benz.
- "model" = apenas o modelo, SEM a marca (ex.: de "VW/SAVEIRO CS" → model "Saveiro CS"). Se vier duplicado ("VOLARE V8 VOLARE V8"), deixe uma vez só.
- "plate" = placa no formato original (ABC1D23 ou ABC-1234). Se não houver placa clara, use null.
- "year" = ano de fabricação/modelo (número). Se houver "2020/2021", use o maior (modelo).
- "color" = cor em português (Branco, Prata, Cinza, Preto, Vermelho, Azul, Verde, Amarelo, etc.), ou null.
- "fuel" = um de: "Gasolina", "Etanol", "Diesel", "Flex", "GNV". Álcool/Gasolina = "Flex". Se não souber, null.
- "department" = secretaria/lotação/setor, se aparecer, senão null.
- "tankCapacity" = capacidade do tanque em litros (número), só se estiver EXPLÍCITA no texto; senão null (o sistema estima depois).
- "odometer" = quilometragem/hodômetro total em km (número inteiro, sem pontos), se aparecer; senão null.
- "renavam" = número do RENAVAM se aparecer, senão null.
- "chassis" = chassi/VIN se aparecer, senão null.
- NÃO invente placas, RENAVAM ou chassi. Campos ausentes = null.
- Ignore linhas que claramente NÃO são veículos (títulos, "Total:", "Página X de Y", assinaturas).

Responda APENAS com um JSON válido (sem markdown, sem texto extra) neste formato EXATO:
{
  "vehicles": [
    {
      "plate": string|null,
      "brand": string|null,
      "model": string|null,
      "year": number|null,
      "color": string|null,
      "fuel": "Gasolina"|"Etanol"|"Diesel"|"Flex"|"GNV"|null,
      "department": string|null,
      "tankCapacity": number|null,
      "odometer": number|null,
      "renavam": string|null,
      "chassis": string|null
    }
  ]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY não configurada no projeto. Defina o segredo nas configurações do Supabase.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { tenantId, blocked } = await resolveTenant(req);
    if (blocked) {
      return new Response(JSON.stringify({ error: 'Limite mensal de uso de IA atingido para esta prefeitura. Contate o administrador da plataforma.' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const text: string = typeof body.text === 'string' ? body.text : '';
    const images: string[] = Array.isArray(body.images)
      ? (body.images as unknown[]).filter((u): u is string => typeof u === 'string' && !!u).slice(0, 15)
      : [];

    if (!text.trim() && images.length === 0) {
      return new Response(JSON.stringify({ error: 'Envie o texto extraído do arquivo ou as imagens das páginas.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Monta a mensagem do usuário: por texto (PDF/lista com texto) OU por imagens (PDF digitalizado/scanner).
    let userContent: unknown;
    if (images.length > 0) {
      userContent = [
        { type: 'text', text: 'Estas são as páginas de um documento de frota (possivelmente digitalizado). Leia por reconhecimento visual (OCR) e organize os veículos no JSON solicitado.' },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
      ];
    } else {
      const MAX_CHARS = 60000;
      const clipped = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
      userContent = `Organize os veículos deste conteúdo:\n\n${clipped}`;
    }

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sgf-2026.local',
        'X-Title': 'SGF 2026 - Importação de veículos',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
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

    const vehicles = Array.isArray((parsed as { vehicles?: unknown }).vehicles)
      ? (parsed as { vehicles: unknown[] }).vehicles
      : [];

    return new Response(JSON.stringify({ data: vehicles }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Erro inesperado.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
