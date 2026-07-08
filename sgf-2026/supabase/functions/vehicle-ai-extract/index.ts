import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'google/gemini-2.5-flash-lite';

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
      feature: 'vehicle',
      model: MODEL,
      tokens_in: Number(usage?.prompt_tokens ?? 0),
      tokens_out: Number(usage?.completion_tokens ?? 0),
      cost_usd: Number((usage as { cost?: number } | undefined)?.cost ?? 0),
    });
  } catch { /* nunca quebra a resposta por causa do log */ }
}

const SYSTEM_PROMPT = `Você é um especialista em identificação de veículos do mercado BRASILEIRO a partir de imagens.
Você recebe até 4 fotos: (1) o veículo, (2) a placa, (3) o documento (CRLV), (4) o hodômetro/painel.
Extraia e deduza o máximo de informações usando seu conhecimento sobre marcas/modelos/anos brasileiros.

REGRAS DE IDIOMA (OBRIGATÓRIO):
- Responda TODOS os campos de texto em PORTUGUÊS DO BRASIL. NUNCA em inglês.
- "color": nome da cor em português (ex.: Branco, Prata, Cinza, Preto, Vermelho, Azul, Verde, Amarelo, Marrom, Bege, Dourado, Laranja, Vinho). Ex.: white→Branco, silver→Prata, gray/grey→Cinza, black→Preto.

REGRA DE TIPO ("vehicleType") — use EXATAMENTE um destes valores em português:
  "Hatch", "Sedan", "SUV", "Picape", "Furgão", "Van", "Minivan", "Ônibus", "Micro-ônibus", "Caminhão", "Motocicleta", "Trator", "Máquina", "Outro".
Guia por modelos comuns no Brasil:
- Picape (caçamba aberta): Fiat Strada, Fiat Toro, VW Saveiro, Chevrolet Montana, Chevrolet S10, Toyota Hilux, Ford Ranger, Mitsubishi L200, Nissan Frontier, VW Amarok.
- Furgão (carga fechado peq/médio): Fiat Fiorino, Fiat Doblo Cargo, Renault Kangoo, VW Express.
- Van (passageiros/carga grande): Mercedes Sprinter, Renault Master, Fiat Ducato, Iveco Daily, Peugeot Boxer.
- Hatch (5 portas compacto): VW Gol, VW Polo, Chevrolet Onix, Hyundai HB20, Fiat Argo, Fiat Mobi, Renault Kwid, Ford Ka, Honda Fit.
- Sedan (3 volumes): VW Voyage, VW Virtus, Onix Plus/Prisma, HB20S, Fiat Cronos, Toyota Corolla, Honda Civic, Nissan Versa.
- SUV: Jeep Renegade/Compass, VW T-Cross/Nivus, Hyundai Creta, Renault Duster, Honda HR-V, Chevrolet Tracker.
- Caminhão: Mercedes Accelo/Atego/Axor, VW Constellation/Delivery, Volvo, Scania, Iveco Tector.
- Ônibus / Micro-ônibus: Marcopolo, Comil, chassis de ônibus.
Na dúvida Picape x Furgão: caçamba ABERTA = Picape; compartimento FECHADO = Furgão. Se não souber, use "Outro".

REGRA DO ODÔMETRO ("odometer"):
- Se houver foto do painel/hodômetro, leia o valor TOTAL do odômetro (quilometragem do veículo) e retorne como número inteiro em km, SEM pontos/vírgulas. Ignore o hodômetro PARCIAL (trip A/B). Se não houver foto do painel ou não for legível, retorne null.

Responda APENAS com um JSON válido (sem markdown, sem texto extra) neste formato exato:
{
  "plate": string|null,            // placa, formato ABC1D23 ou ABC-1234
  "brand": string|null,            // marca (ex: Fiat)
  "model": string|null,            // modelo (ex: Argo)
  "year": number|null,             // ano de fabricação/modelo
  "color": string|null,            // cor EM PORTUGUÊS (ex: Branco)
  "fuelType": "GASOLINE"|"ETHANOL"|"DIESEL"|"FLEX"|null,
  "tankCapacity": number|null,     // litros (estimado pelo modelo se necessário)
  "vehicleType": string|null,      // um dos valores da lista acima, em português
  "renavam": string|null,          // do documento, se visível
  "chassis": string|null,          // chassi/VIN, se visível
  "odometer": number|null,         // km total lido do painel (inteiro), ou null
  "confidence": number             // 0 a 1
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
    const images: string[] = (body.images ?? []).filter((u: unknown) => typeof u === 'string' && u);
    if (images.length === 0) {
      return new Response(JSON.stringify({ error: 'Envie ao menos uma imagem.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const content: unknown[] = [
      { type: 'text', text: 'Analise as imagens do veículo (e do painel, se houver) e retorne o JSON solicitado, com TODOS os textos em português do Brasil.' },
      ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
    ];

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sgf-2026.local',
        'X-Title': 'SGF 2026 - Identificação de veículo',
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
