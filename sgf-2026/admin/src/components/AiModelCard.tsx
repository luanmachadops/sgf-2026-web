import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/lib/ui';
import { SGFCard, SearchField, FilterChip } from '@/components/sgf';
import { Sparkles, Check } from '@/components/sgf/icons';

/** Padrão das edge functions quando nada foi escolhido (ver supabase/functions/_shared/ai-model.ts). */
const DEFAULT_MODEL = 'google/gemini-3.6-flash';
const MODEL_ID_RE = /^[~\w.-]+\/[\w.:~-]+$/;
// Estimativa de uma leitura de documento: foto (~2 mil tokens) + JSON de resposta (~400).
const EST_IN = 2000;
const EST_OUT = 400;

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
}
interface ModelRow { id: string; name: string; provider: string; inPerM: number; outPerM: number; perDoc: number; context: number }

/** Modelos que leem imagem e respondem em texto, com preço por 1 milhão de tokens. */
async function fetchVisionModels(): Promise<ModelRow[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`OpenRouter respondeu ${res.status}`);
  const json = await res.json() as { data?: OpenRouterModel[] };
  return (json.data ?? [])
    .filter((m) => {
      const inMod = m.architecture?.input_modalities ?? [];
      const outMod = m.architecture?.output_modalities ?? [];
      return inMod.includes('image') && outMod.includes('text') && !outMod.includes('image') && !m.id.endsWith(':batch');
    })
    .map((m) => {
      const pin = Number(m.pricing?.prompt ?? 0);
      const pout = Number(m.pricing?.completion ?? 0);
      return {
        id: m.id,
        name: m.name.replace(/^[^:]+:\s*/, ''),
        provider: m.id.split('/')[0],
        inPerM: pin * 1e6,
        outPerM: pout * 1e6,
        perDoc: pin * EST_IN + pout * EST_OUT,
        context: m.context_length ?? 0,
      };
    })
    .filter((m) => m.inPerM >= 0 && m.outPerM >= 0);
}

const usd = (n: number) => {
  if (n === 0) return 'grátis';
  if (n < 0.01) return `US$ ${n.toLocaleString('pt-BR', { maximumSignificantDigits: 2 })}`;
  return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const POPULAR = ['google', 'anthropic', 'openai', 'mistralai', 'qwen', 'meta-llama'];

/** Escolha do modelo de IA que lê documentos (CNH, CRLV, importações), com preço de cada um. */
export function AiModelCard() {
  const qc = useQueryClient();
  const { data: setting } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_settings').select('ai_document_model, updated_at').eq('id', true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: models = [], isLoading, error } = useQuery({ queryKey: ['openrouter-models'], queryFn: fetchVisionModels, staleTime: 60 * 60 * 1000 });

  const current = setting?.ai_document_model || DEFAULT_MODEL;
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState<string>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? current;

  const providers = useMemo(() => {
    const present = new Set(models.map((m) => m.provider));
    return POPULAR.filter((p) => present.has(p));
  }, [models]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return models
      .filter((m) => provider === 'all' || m.provider === provider)
      .filter((m) => !s || m.id.toLowerCase().includes(s) || m.name.toLowerCase().includes(s))
      .sort((a, b) => (a.id === current ? -1 : b.id === current ? 1 : a.perDoc - b.perDoc));
  }, [models, q, provider, current]);

  const currentRow = models.find((m) => m.id === current);

  const save = useMutation({
    mutationFn: async (model: string) => {
      if (!MODEL_ID_RE.test(model)) throw new Error('Identificador de modelo inválido.');
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('platform_settings')
        .update({ ai_document_model: model, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
        .eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Modelo de IA atualizado. Vale para as próximas leituras (até 1 min).'); setPicked(null); qc.invalidateQueries({ queryKey: ['platform-settings'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <SGFCard padding="lg" title="Modelo de IA para documentos" icon={Sparkles}>
      <p className="-mt-1 mb-4 text-sm text-[var(--rt-ink500)]">
        Usado na leitura de CNH, documento do veículo e importação de planilhas/fotos, via OpenRouter. Vale para todas as prefeituras.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--rt-paper)] p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--rt-brand-100)] text-[var(--rt-brand)]"><Sparkles width={20} height={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--rt-ink500)]">Em uso</p>
          <p className="truncate text-[15px] font-semibold text-[var(--rt-ink900)]">{currentRow?.name ?? current}</p>
          <p className="truncate text-xs text-[var(--rt-ink500)]">{current}{!setting?.ai_document_model && ' · padrão'}</p>
        </div>
        {currentRow && (
          <div className="text-right text-xs text-[var(--rt-ink500)]">
            <p><span className="rt-num font-semibold text-[var(--rt-ink900)]">{usd(currentRow.perDoc)}</span> por leitura*</p>
            <p className="rt-num">{usd(currentRow.inPerM)} / {usd(currentRow.outPerM)} por 1M tokens</p>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 [&>label]:!w-full"><SearchField value={q} onChange={setQ} placeholder="Buscar modelo (ex.: gemini, claude, gpt)" /></div>
      </div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
        <FilterChip label="Todos" active={provider === 'all'} onClick={() => setProvider('all')} />
        {providers.map((p) => <FilterChip key={p} label={p} active={provider === p} onClick={() => setProvider(p)} />)}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--rt-hairline)]">
        <div className="grid grid-cols-[1fr_auto] gap-3 bg-[var(--rt-paper)] px-4 py-2 text-xs font-medium text-[var(--rt-ink500)] sm:grid-cols-[1fr_110px_150px]">
          <span>Modelo</span>
          <span className="text-right">Por leitura*</span>
          <span className="hidden text-right sm:block">Entrada / saída (1M)</span>
        </div>
        <div className="rt-scroll max-h-80 overflow-y-auto">
          {isLoading && <p className="px-4 py-6 text-center text-sm text-[var(--rt-ink500)]">Carregando modelos do OpenRouter…</p>}
          {error && <p className="px-4 py-6 text-center text-sm text-[var(--rt-red600)]">Não foi possível carregar a lista: {(error as Error).message}</p>}
          {!isLoading && !error && visible.length === 0 && <p className="px-4 py-6 text-center text-sm text-[var(--rt-ink500)]">Nenhum modelo encontrado.</p>}
          {visible.map((m) => {
            const isSel = m.id === selected;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setPicked(m.id)}
                aria-pressed={isSel}
                className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 border-t border-[var(--rt-hairline)] px-4 py-2.5 text-left transition first:border-t-0 sm:grid-cols-[1fr_110px_150px] ${
                  isSel ? 'bg-[var(--rt-brand-100)]' : 'hover:bg-[var(--rt-paper)]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${isSel ? 'border-[var(--rt-brand)] bg-[var(--rt-brand)] text-white' : 'border-[var(--rt-ink300)]'}`}>
                    {isSel && <Check width={12} height={12} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--rt-ink900)]">
                      {m.name}
                      {m.id === current && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--rt-brand)]">em uso</span>}
                    </span>
                    <span className="block truncate text-xs text-[var(--rt-ink500)]">{m.id}</span>
                  </span>
                </span>
                <span className="rt-num text-right text-sm font-semibold text-[var(--rt-ink900)]">{usd(m.perDoc)}</span>
                <span className="rt-num hidden text-right text-xs text-[var(--rt-ink500)] sm:block">{usd(m.inPerM)} / {usd(m.outPerM)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--rt-ink400)]">
          * Estimativa para uma foto de documento (~{EST_IN.toLocaleString('pt-BR')} tokens de entrada e {EST_OUT} de saída). Preços do OpenRouter, em dólar.
        </p>
        <Button disabled={selected === current || save.isPending} onClick={() => save.mutate(selected)}>
          {save.isPending ? 'Salvando…' : 'Usar este modelo'}
        </Button>
      </div>
    </SGFCard>
  );
}
