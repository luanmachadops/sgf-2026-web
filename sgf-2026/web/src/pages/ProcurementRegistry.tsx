import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useHeader } from '@/contexts/HeaderContext';
import { SGFButton, SGFCard, SGFInput, SGFBadge } from '@/components/sgf';
import { Modal } from '@/components/ui/Modal';
import { InstrumentBudgetPlanning } from '@/components/procurement/InstrumentBudgetPlanning';
import { ProcurementItems } from '@/components/procurement/ProcurementItems';
import { ProcurementNavigation } from '@/components/procurement/ProcurementNavigation';
import { canManageProcurement } from '@/lib/procurement-navigation';
import { procurementRegistryApi as api, type ProcurementProcess, type ProcurementInstrument, type RegistryPayload } from '@/lib/procurement-registry-api';
import { formatCurrency, matchesSearch } from '@/lib/utils';

const SIZE = 20;
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
type Editor = { kind: 'process'; record?: ProcurementProcess } | { kind: 'instrument'; process: ProcurementProcess; record?: ProcurementInstrument; type: 'ata' | 'contract'; origin?: ProcurementInstrument };
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm">
    <span>{total} registro(s) · Página {page + 1} de {Math.max(1, Math.ceil(total / SIZE))}</span>
    <div className="flex gap-2"><SGFButton type="button" variant="ghost" size="sm" disabled={!page} onClick={() => onPage(page - 1)}>Anterior</SGFButton><SGFButton type="button" variant="ghost" size="sm" disabled={(page + 1) * SIZE >= total} onClick={() => onPage(page + 1)}>Próxima</SGFButton></div>
  </div>;
}
function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return <SGFCard><p role="alert" className="mb-3 text-red-700">{error.message}</p><SGFButton type="button" variant="secondary" onClick={retry}>Tentar novamente</SGFButton></SGFCard>;
}
export default function ProcurementRegistry() {
  const { user } = useAuth();
  if (!canManageProcurement(user)) return <Navigate to="/perfil" replace />;
  return <Registry key={`${user?.tenantId}:${user?.id}`} />;
}
function Registry() {
  const { user } = useAuth();
  const { setTitle, setDescription } = useHeader();
  const client = useQueryClient();
  const [selected, setSelected] = useState<ProcurementProcess | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [history, setHistory] = useState(false);
  const [budgetInstrument, setBudgetInstrument] = useState<ProcurementInstrument | null>(null);
  const [itemsInstrument, setItemsInstrument] = useState<ProcurementInstrument | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [notice, setNotice] = useState('');
  const processes = useQuery({ queryKey: ['procurement-registry', user?.tenantId, user?.id, 'process', page, search], queryFn: () => api.processes(page * SIZE, search), enabled: !selected });
  const instruments = useQuery({ queryKey: ['procurement-registry', user?.tenantId, user?.id, 'instrument', selected?.id, page, search], queryFn: () => api.instruments(selected!.id, page * SIZE, search), enabled: Boolean(selected) });
  const query = selected ? instruments : processes;
  useEffect(() => {
    setTitle('Processos, atas e contratos');
    setDescription('Cadastro central dos instrumentos da contratação.');
  }, [setTitle, setDescription]);
  const openProcess = (process: ProcurementProcess | null) => { setSelected(process); setPage(0); setSearch(''); setDraftSearch(''); setNotice(''); };
  if (budgetInstrument) return <div className="space-y-6"><ProcurementNavigation /><InstrumentBudgetPlanning instrument={budgetInstrument} onBack={() => setBudgetInstrument(null)} /></div>;
  return <div className="space-y-6">
    <ProcurementNavigation />
    <SGFCard><h2 className="font-semibold">Cadastro em preparação</h2><p className="mt-2 text-sm text-slate-600">Os processos, atas e contratos são salvos como rascunhos. Itens e condições de preço já podem ser preparados. O planejamento por secretaria está disponível. A ativação para uso nas operações será disponibilizada após a integração.</p></SGFCard>
    {notice && <p role="status" className="text-green-700">{notice}</p>}
    {selected && <SGFCard>
      <SGFButton type="button" variant="ghost" size="sm" onClick={() => openProcess(null)}>Voltar aos processos</SGFButton>
      <h2 className="mt-3 text-xl font-bold">{selected.reference} · {selected.year}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm">{selected.object}</p>
      <p className="mt-2 text-sm text-slate-500">{selected.modality} · {selected.legal_basis}</p>
      <div className="mt-4 flex flex-wrap gap-2"><SGFButton type="button" variant="secondary" size="sm" onClick={() => setEditor({ kind: 'process', record: selected })}>Editar processo</SGFButton><SGFButton type="button" variant="ghost" size="sm" onClick={() => setHistory(true)}>Histórico do processo</SGFButton></div>
    </SGFCard>}
    <div className="flex flex-wrap items-end justify-between gap-3">
      <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(draftSearch.trim()); setPage(0); }}>
        <SGFInput label={selected ? 'Buscar referência do instrumento' : 'Buscar referência ou objeto'} maxLength={100} value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} />
        <SGFButton type="submit" variant="secondary">Buscar</SGFButton>
      </form>
      <div className="flex flex-wrap gap-2">{selected ? <>
        <SGFButton type="button" onClick={() => setEditor({ kind: 'instrument', process: selected, type: 'ata' })}>Nova ata</SGFButton>
        <SGFButton type="button" onClick={() => setEditor({ kind: 'instrument', process: selected, type: 'contract' })}>Novo contrato</SGFButton>
      </> : <SGFButton type="button" onClick={() => setEditor({ kind: 'process' })}>Novo processo</SGFButton>}</div>
    </div>
    {query.isPending ? <p role="status">Carregando registros…</p> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : <SGFCard>
      {!query.data?.total && <p className="text-sm text-slate-500">Nenhum registro encontrado.</p>}
      <div className="divide-y divide-slate-100">{!selected ? processes.data?.items.map((process) => <div key={process.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0 flex-1"><h3 className="font-semibold">{process.reference} · {process.year}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-600">{process.object}</p><SGFBadge variant="info">Rascunho</SGFBadge></div>
        <SGFButton type="button" variant="secondary" size="sm" onClick={() => openProcess(process)}>Abrir processo</SGFButton>
      </div>) : instruments.data?.items.map((instrument) => <div key={instrument.id} className="py-4">
        <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{instrument.kind === 'ata' ? 'Ata' : 'Contrato'} {instrument.reference} · {instrument.year}</h3>
          <p className="mt-1 text-sm text-slate-600">{date(instrument.starts_on)} a {date(instrument.ends_on)} · {instrument.partners.length} fornecedor(es)</p>
          <p className="mt-1 text-sm">{instrument.kind === 'ata' ? 'Valor registrado' : 'Valor contratado'}: {instrument.declared_value === null ? 'Não informado' : formatCurrency(instrument.declared_value)}</p>
          {instrument.origin_ata_id && <p className="text-xs text-slate-500">Vinculado a uma ata deste processo</p>}
          <SGFBadge variant="info">Rascunho</SGFBadge></div>
          <div className="flex flex-wrap items-center gap-2">{user?.allowedModules?.includes('budgets') && <SGFButton type="button" size="sm" variant="outline" onClick={() => setBudgetInstrument(instrument)}>Tetos por secretaria</SGFButton>}<SGFButton type="button" size="sm" onClick={() => setItemsInstrument(instrument)}>Itens e preços</SGFButton><SGFButton type="button" size="sm" variant="secondary" onClick={() => setEditor({ kind: 'instrument', process: selected, type: instrument.kind, record: instrument })}>Editar {instrument.kind === 'ata' ? 'ata' : 'contrato'}</SGFButton>
          {instrument.kind === 'ata' && <SGFButton type="button" size="sm" variant="ghost" onClick={() => setEditor({ kind: 'instrument', process: selected, type: 'contract', origin: instrument })}>Criar contrato derivado</SGFButton>}</div>
        </div>
      </div>)}</div>
      <Pager page={page} total={query.data?.total ?? 0} onPage={setPage} />
    </SGFCard>}
    {editor && <RegistryEditor editor={editor} onClose={() => setEditor(null)} onSaved={(payload) => {
      if (editor.kind === 'process' && selected && payload.id === selected.id) setSelected({ ...selected, ...payload, version: selected.version + 1 });
      setEditor(null); setNotice('Rascunho salvo. A alteração foi registrada no histórico.');
      void client.invalidateQueries({ queryKey: ['procurement-registry'] });
    }} />}
    {itemsInstrument && <ProcurementItems instrument={itemsInstrument} onClose={() => setItemsInstrument(null)} />}
    {history && selected && <History processId={selected.id} onClose={() => setHistory(false)} />}
  </div>;
}
function RegistryEditor({ editor, onClose, onSaved }: { editor: Editor; onClose: () => void; onSaved: (payload: RegistryPayload) => void }) {
  const { user } = useAuth();
  const record = editor.record;
  const [payload, setPayload] = useState<RegistryPayload>(() => ({
    reference: record?.reference ?? '', year: record?.year ?? new Date().getFullYear(), documents: record?.documents ?? [], reason: '',
    ...(record ? { id: record.id, version: record.version } : {}),
    ...(editor.kind === 'process' ? { object: editor.record?.object ?? '', modality: editor.record?.modality ?? '', legal_basis: editor.record?.legal_basis ?? '' } : {
      kind: editor.type, process_id: editor.process.id, starts_on: editor.record?.starts_on ?? '', ends_on: editor.record?.ends_on ?? '',
      declared_value: editor.record?.declared_value ?? null, origin_ata_id: editor.record?.origin_ata_id ?? editor.origin?.id ?? null,
      partners: editor.record?.partners ?? editor.origin?.partners ?? [],
    }),
  }));
  const [validation, setValidation] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerPage, setPartnerPage] = useState(0);
  const partners = useQuery({ queryKey: ['procurement-registry', user?.tenantId, user?.id, 'partners'], queryFn: api.partners, enabled: editor.kind === 'instrument' });
  const save = useMutation({ mutationFn: () => api.save(editor.kind, payload), onSuccess: () => onSaved(payload) });
  const update = (patch: Partial<RegistryPayload>) => { setPayload((previous) => ({ ...previous, ...patch })); setValidation(''); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (payload.reason.trim().length < 3) return setValidation('Informe uma justificativa com pelo menos 3 caracteres.');
    if (editor.kind === 'instrument' && !payload.partners?.length) return setValidation('Selecione ao menos um fornecedor.');
    if (payload.starts_on && payload.ends_on && payload.starts_on > payload.ends_on) return setValidation('A data final deve ser igual ou posterior à inicial.');
    if (payload.documents.some((document) => { try { const url = new URL(document.url); return url.protocol !== 'https:' || !!url.username || !!url.password || !document.label.trim(); } catch { return true; } })) return setValidation('Cada documento precisa de um título e de um link HTTPS válido, sem credenciais.');
    save.mutate();
  };
  const available = (partners.data ?? []).filter((partner) => matchesSearch(partnerSearch, partner.name) && (editor.kind !== 'instrument' || !editor.origin || editor.origin.partners.includes(partner.id)));
  const title = `${record ? 'Editar' : 'Novo cadastro de'} ${editor.kind === 'process' ? 'processo' : editor.type === 'ata' ? 'ata' : 'contrato'}`;
  return <Modal isOpen onClose={() => { if (!save.isPending) onClose(); }} title={title} description="Rascunho — não autoriza despesas nem altera os saldos atuais." size="xl">
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={save.isPending} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><SGFInput label="Número / referência" required maxLength={100} value={payload.reference} onChange={(event) => update({ reference: event.target.value })} fullWidth /><SGFInput label="Ano" type="number" min={1900} max={2200} required value={payload.year} onChange={(event) => update({ year: Number(event.target.value) })} fullWidth /></div>
        {editor.kind === 'process' ? <>
          <label className="block text-sm font-medium">Objeto<textarea className={`${inputClass} mt-1`} rows={3} required minLength={3} maxLength={3000} value={payload.object} onChange={(event) => update({ object: event.target.value })} /></label>
          <SGFInput label="Modalidade / procedimento" hint="Informe conforme o processo já realizado." required minLength={2} maxLength={120} value={payload.modality} onChange={(event) => update({ modality: event.target.value })} fullWidth />
          <SGFInput label="Fundamento legal" required minLength={2} maxLength={300} value={payload.legal_basis} onChange={(event) => update({ legal_basis: event.target.value })} fullWidth />
        </> : <>
          <p className="text-sm text-slate-600">Processo: {editor.process.reference} · {editor.process.year}{payload.origin_ata_id ? ` · Ata de origem: ${editor.origin?.reference ?? 'vínculo já registrado'}` : ''}</p>
          <div className="grid gap-4 sm:grid-cols-2"><SGFInput label="Início da vigência" type="date" required value={payload.starts_on} onChange={(event) => update({ starts_on: event.target.value })} fullWidth /><SGFInput label="Fim da vigência" type="date" required min={payload.starts_on} value={payload.ends_on} onChange={(event) => update({ ends_on: event.target.value })} fullWidth /></div>
          <SGFInput label={editor.type === 'ata' ? 'Valor registrado (R$)' : 'Valor contratado (R$)'} type="number" min={0} max={999999999999.99} step="0.01" value={payload.declared_value ?? ''} hint="Opcional nesta etapa. Deixe vazio quando ainda não conferido no documento." onChange={(event) => update({ declared_value: event.target.value === '' ? null : Number(event.target.value) })} fullWidth />
          <fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">Fornecedores vinculados ({payload.partners?.length ?? 0})</legend>
            <SGFInput label="Buscar fornecedor" value={partnerSearch} onChange={(event) => { setPartnerSearch(event.target.value); setPartnerPage(0); }} fullWidth />
            {partners.isPending ? <p role="status">Carregando fornecedores…</p> : partners.isError ? <Failure error={partners.error} retry={() => void partners.refetch()} /> : <>
              <div className="mt-3 space-y-2">{available.slice(partnerPage * SIZE, (partnerPage + 1) * SIZE).map((partner) => <label key={partner.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-[var(--sgf-primary)]" checked={payload.partners?.includes(partner.id) ?? false} onChange={(event) => update({ partners: event.target.checked ? [...(payload.partners ?? []), partner.id] : payload.partners?.filter((value) => value !== partner.id) })} /><span>{partner.name} <span className="text-slate-500">({partner.id.startsWith('posto:') ? 'Posto' : 'Oficina'})</span></span></label>)}</div>
              {!available.length && <p className="mt-3 text-sm text-slate-500">Nenhum fornecedor encontrado.</p>}
              <Pager page={partnerPage} total={available.length} onPage={setPartnerPage} />
            </>}
          </fieldset>
        </>}
        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">Referências documentais</legend>
          <p className="text-xs text-slate-500">Links HTTPS para documentos oficiais já publicados. Não inclua senhas ou links de acesso temporário.</p>
          {payload.documents.map((document, index) => <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <SGFInput label={`Título do documento ${index + 1}`} required maxLength={120} value={document.label} onChange={(event) => update({ documents: payload.documents.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} fullWidth />
            <SGFInput label={`Link HTTPS ${index + 1}`} type="url" required maxLength={2000} value={document.url} onChange={(event) => update({ documents: payload.documents.map((item, i) => i === index ? { ...item, url: event.target.value } : item) })} fullWidth />
            <SGFButton type="button" variant="ghost" size="sm" onClick={() => update({ documents: payload.documents.filter((_, i) => i !== index) })}>Remover</SGFButton>
          </div>)}
          <SGFButton type="button" variant="secondary" size="sm" disabled={payload.documents.length >= 20} onClick={() => update({ documents: [...payload.documents, { label: '', url: '' }] })}>Adicionar documento</SGFButton>
        </fieldset>
        <SGFInput label="Justificativa do cadastro ou alteração" required minLength={3} maxLength={1000} value={payload.reason} onChange={(event) => update({ reason: event.target.value })} fullWidth />
      </fieldset>
      {(validation || save.isError) && <p role="alert" className="text-sm text-red-700">{validation || save.error?.message || 'Não foi possível salvar o rascunho. Verifique sua conexão e tente novamente.'}</p>}
      <div className="flex justify-end gap-2"><SGFButton type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>Cancelar</SGFButton><SGFButton type="submit" loading={save.isPending} disabled={editor.kind === 'instrument' && !partners.isSuccess}>Salvar rascunho</SGFButton></div>
    </form>
  </Modal>;
}
function History({ processId, onClose }: { processId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const query = useQuery({ queryKey: ['procurement-registry', user?.tenantId, user?.id, 'events', processId, page], queryFn: () => api.events(processId, page * SIZE) });
  return <Modal isOpen onClose={onClose} title="Histórico do processo" description="Cadastros e alterações de processos, atas e contratos." size="xl">
    {query.isPending ? <p role="status">Carregando histórico…</p> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : <>
      <ol className="space-y-4">{query.data.items.map((event) => <li key={event.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="font-semibold">{event.before_value ? 'Alteração' : 'Cadastro'} · {event.kind === 'budget' ? 'Planejamento do instrumento' : event.kind === 'item' ? 'Item' : event.kind === 'price' ? 'Condição de preço do item' : event.kind === 'process' ? 'Processo' : event.after_value.kind === 'ata' ? 'Ata' : 'Contrato'} {String(event.after_value.reference)} · Versão {String(event.after_value.version)}</p>
        <p className="mt-1 text-xs text-slate-500">{new Date(event.occurred_at).toLocaleString('pt-BR')} · Responsável: {event.actor_name}</p>
        <p className="mt-2 whitespace-pre-wrap">{event.reason}</p>
        {event.before_value && <p className="mt-2 text-xs text-slate-500">Campos alterados: {Object.keys(event.after_value).filter((key) => !['updated_at', 'version'].includes(key) && JSON.stringify(event.before_value?.[key]) !== JSON.stringify(event.after_value[key])).map((key) => ({ reference: 'referência', year: 'ano', object: 'objeto', modality: 'modalidade', legal_basis: 'fundamento legal', documents: 'documentos', starts_on: 'início da vigência', ends_on: 'fim da vigência', declared_value: 'valor', origin_ata_id: 'ata de origem', partners: 'fornecedores', description: 'descrição', quantity: 'quantidade', unit: 'unidade', category: 'categoria', lot_reference: 'lote', partner_kind: 'tipo de fornecedor', partner_id: 'fornecedor', fiscal_year: 'exercício', total_limit: 'teto do exercício', document_reference: 'documento de distribuição', allocations: 'dotações e fontes' }[key] ?? key)).join(', ') || 'nenhuma mudança de conteúdo'}</p>}
      </li>)}</ol>
      {!query.data.total && <p>Nenhuma alteração registrada.</p>}
      <Pager page={page} total={query.data.total} onPage={setPage} />
    </>}
  </Modal>;
}
