import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { SGFButton, SGFInput, SGFSelect } from '@/components/sgf';
import { Modal } from '@/components/ui/Modal';
import { procurementRegistryApi, type ProcurementInstrument } from '@/lib/procurement-registry-api';
import { procurementItemsApi as api, ITEM_CATEGORIES, ITEM_UNITS, type ItemPayload, type PricePayload, type ProcurementItem, type ProcurementPrice } from '@/lib/procurement-items-api';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 6 });
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const options = (values: Record<string, string>) => Object.entries(values).map(([value, label]) => ({ value, label }));
function Paging({ page, total, change }: { page: number; total: number; change: (n: number) => void }) {
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{total} registro(s) · Página {page + 1}</span><div className="flex gap-2"><SGFButton type="button" variant="ghost" disabled={!page} onClick={() => change(page - 1)}>Anterior</SGFButton><SGFButton type="button" variant="ghost" disabled={(page + 1) * 20 >= total} onClick={() => change(page + 1)}>Próxima</SGFButton></div></div>;
}
function Condition({ price }: { price: ProcurementPrice }) {
  return <><span>{price.pricing_mode === 'unit' ? `${money(price.unit_price!)} por unidade` : `${price.discount_percent?.toLocaleString('pt-BR')}% de desconto · ${price.table_reference}`}</span><p className="mt-1 text-xs text-slate-500">Efeito a partir de {dateLabel(price.effective_on)} · Revisão {price.revision}</p></>;
}
type Mode = { type: 'item'; item?: ProcurementItem; source?: ProcurementItem } | { type: 'price' | 'history'; item: ProcurementItem } | { type: 'source' } | null;
export function ProcurementItems({ instrument, onClose }: { instrument: ProcurementInstrument; onClose: () => void }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [mode, setMode] = useState<Mode>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [inputSearch, setInputSearch] = useState('');
  const [date, setDate] = useState(today);
  const [notice, setNotice] = useState('');
  const key = ['procurement-items', user?.tenantId, user?.id];
  const query = useQuery({ queryKey: [...key, instrument.id, page, search, date], queryFn: () => api.list(instrument.id, page * 20, search, date) });
  const saved = () => { setMode(null); setNotice('Registro salvo com histórico.'); void client.invalidateQueries({ queryKey: ['procurement-items'] }); void client.invalidateQueries({ queryKey: ['procurement-registry'] }); };
  // Editors own their modal so backdrop/escape cannot discard an in-flight save.
  if (mode?.type === 'item') return <ItemEditor instrument={instrument} item={mode.item} source={mode.source} onClose={() => setMode(null)} onSaved={saved} />;
  if (mode?.type === 'price') return <PriceEditor instrument={instrument} item={mode.item} onClose={() => setMode(null)} onSaved={saved} />;
  if (mode?.type === 'history') return <PriceHistory item={mode.item} onClose={() => setMode(null)} />;
  if (mode?.type === 'source') return <SourcePicker instrument={instrument} onClose={() => setMode(null)} onSelect={(source) => setMode({ type: 'item', source })} />;
  return <Modal isOpen title={`Itens e preços · ${instrument.kind === 'ata' ? 'Ata' : 'Contrato'} ${instrument.reference}`} description="Rascunhos agrupados por lote. Os preços abaixo correspondem à data consultada." size="xl" onClose={onClose}>
    <div className="space-y-4">
      <p className="text-sm text-slate-600">As quantidades de contratos derivados são distribuídas a partir dos itens da ata. Desconto sobre tabela não gera valor total até que a base de cálculo seja conhecida.</p>
      {notice && <p role="status" className="text-green-700">{notice}</p>}
      <div className="flex flex-wrap items-end gap-3"><form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(inputSearch.trim()); setPage(0); }}><SGFInput label="Buscar item, lote ou descrição" maxLength={100} value={inputSearch} onChange={(e) => setInputSearch(e.target.value)} /><SGFButton type="submit" variant="secondary">Buscar</SGFButton></form><SGFInput type="date" label="Data de consulta do preço" value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} /><SGFButton type="button" onClick={() => setMode(instrument.origin_ata_id ? { type: 'source' } : { type: 'item' })}>{instrument.origin_ata_id ? 'Selecionar item da ata' : 'Novo item'}</SGFButton></div>
      {query.isPending ? <p role="status">Carregando itens…</p> : query.isError ? <p role="alert" className="text-red-700">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Tentar novamente</button></p> : <>
        <div className="space-y-3">{query.data.items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{item.lot_reference ? `Lote ${item.lot_reference}` : 'Sem agrupamento em lote'} · {ITEM_CATEGORIES[item.category]}</p><h3 className="mt-1 font-semibold">Item {item.reference} · {item.description}</h3>
          <p className="mt-1 text-sm">{item.partner_name} · {item.quantity.toLocaleString('pt-BR')} {item.unit}</p>
          <div className="mt-2 text-sm">{item.price ? <Condition price={item.price} /> : <span className="text-amber-700">Sem condição de preço para a data consultada.</span>}</div>
          <div className="mt-3 flex flex-wrap gap-2"><SGFButton type="button" size="sm" variant="secondary" onClick={() => setMode({ type: 'item', item })}>Editar item</SGFButton><SGFButton type="button" size="sm" onClick={() => setMode({ type: 'price', item })}>Registrar condição</SGFButton><SGFButton type="button" size="sm" variant="ghost" onClick={() => setMode({ type: 'history', item })}>Histórico de preços</SGFButton></div>
        </article>)}</div>
        {!query.data.total && <p className="text-sm text-slate-500">Nenhum item cadastrado para esta busca.</p>}
        <Paging page={page} total={query.data.total} change={setPage} />
      </>}
    </div>
  </Modal>;
}
function SourcePicker({ instrument, onClose, onSelect }: { instrument: ProcurementInstrument; onClose: () => void; onSelect: (item: ProcurementItem) => void }) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [inputSearch, setInputSearch] = useState('');
  const query = useQuery({ queryKey: ['procurement-items', user?.tenantId, user?.id, 'source', instrument.origin_ata_id, page, search], queryFn: () => api.list(instrument.origin_ata_id!, page * 20, search) });
  return <Modal isOpen title="Selecionar item da ata de origem" size="xl" onClose={onClose}>
    <p className="mb-3 text-sm text-slate-600">Escolha um item de fornecedor vinculado ao contrato. A quantidade disponível será validada ao salvar.</p>
    <form className="mb-3 flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(inputSearch.trim()); setPage(0); }}><SGFInput label="Buscar item da ata" value={inputSearch} maxLength={100} onChange={(e) => setInputSearch(e.target.value)} /><SGFButton type="submit">Buscar</SGFButton></form>
    {query.isPending ? <p>Carregando…</p> : query.isError ? <p role="alert">{query.error.message}</p> : <><div className="space-y-3">{query.data.items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><span>Item {item.reference} · {item.description}<br />{item.partner_name} · {item.quantity.toLocaleString('pt-BR')} {item.unit}</span><SGFButton type="button" size="sm" disabled={!instrument.partners.includes(`${item.partner_kind}:${item.partner_id}`)} onClick={() => onSelect(item)}>Selecionar</SGFButton></div>)}</div>{!query.data.total && <p>Cadastre primeiro os itens na ata de origem.</p>}<Paging page={page} total={query.data.total} change={setPage} /></>}
    <SGFButton type="button" variant="ghost" onClick={onClose}>Voltar</SGFButton>
  </Modal>;
}
function ItemEditor({ instrument, item, source, onClose, onSaved }: { instrument: ProcurementInstrument; item?: ProcurementItem; source?: ProcurementItem; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const template = item ?? source;
  const [payload, setPayload] = useState<ItemPayload>({ instrument_id: instrument.id, reference: item?.reference ?? '', lot_reference: template?.lot_reference ?? '', description: template?.description ?? '', category: template?.category ?? 'fuel', unit: template?.unit ?? 'L', quantity: item?.quantity ?? 1, partner_kind: template?.partner_kind ?? 'posto', partner_id: template?.partner_id ?? '', origin_item_id: item?.origin_item_id ?? source?.id ?? null, ...(item ? { id: item.id, version: item.version } : {}), reason: '' });
  const partners = useQuery({ queryKey: ['procurement-registry', user?.tenantId, user?.id, 'partners'], queryFn: procurementRegistryApi.partners });
  const mutation = useMutation({ mutationFn: () => api.save(payload), onSuccess: onSaved });
  const update = (patch: Partial<ItemPayload>) => setPayload((prev) => ({ ...prev, ...patch }));
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  return <Modal isOpen title={item ? `Editar item ${item.reference}` : 'Novo item adjudicado'} description="Informe os dados do instrumento já formalizado. O cadastro permanece em rascunho." size="xl" onClose={() => { if (!mutation.isPending) onClose(); }}>
    <form className="space-y-4" onSubmit={submit}><fieldset disabled={mutation.isPending} className="space-y-4">
      {source && <p className="text-sm">Origem: item {source.reference} da ata. A condição de preço será registrada separadamente no contrato.</p>}
      <div className="grid gap-4 sm:grid-cols-2"><SGFInput fullWidth required maxLength={100} label="Número do item" value={payload.reference} onChange={(e) => update({ reference: e.target.value })} /><SGFInput fullWidth maxLength={100} label="Lote (opcional)" hint="Use a mesma referência nos itens do mesmo lote." value={payload.lot_reference} onChange={(e) => update({ lot_reference: e.target.value })} /></div>
      <SGFInput fullWidth required minLength={3} maxLength={2000} label="Descrição do item" value={payload.description} onChange={(e) => update({ description: e.target.value })} />
      <div className="grid gap-4 sm:grid-cols-2"><SGFSelect fullWidth label="Categoria" options={options(ITEM_CATEGORIES)} value={payload.category} disabled={Boolean(payload.origin_item_id)} onChange={(value) => update({ category: value as ItemPayload['category'] })} /><SGFSelect fullWidth label="Unidade" options={options(ITEM_UNITS)} value={payload.unit} disabled={Boolean(payload.origin_item_id)} onChange={(value) => update({ unit: value as ItemPayload['unit'] })} /></div>
      <SGFInput fullWidth required label="Quantidade adjudicada / contratada" type="number" min="0.001" max="9999999999999.999" step="0.001" value={payload.quantity} onChange={(e) => update({ quantity: Number(e.target.value) })} />
      {partners.isError ? <p role="alert">{partners.error.message}</p> : <SGFSelect fullWidth label="Fornecedor adjudicado" placeholder={partners.isPending ? 'Carregando…' : 'Selecione o fornecedor'} disabled={Boolean(payload.origin_item_id) || partners.isPending} options={(partners.data ?? []).filter((p) => instrument.partners.includes(p.id)).map((p) => ({ value: p.id, label: `${p.name} (${p.id.startsWith('posto:') ? 'Posto' : 'Oficina'})` }))} value={payload.partner_id ? `${payload.partner_kind}:${payload.partner_id}` : ''} onChange={(value) => { const [kind, id] = value.split(':'); update({ partner_kind: kind as ItemPayload['partner_kind'], partner_id: id }); }} />}
      <SGFInput fullWidth required minLength={3} maxLength={1000} label="Justificativa" value={payload.reason} onChange={(e) => update({ reason: e.target.value })} />
    </fieldset>{mutation.isError && <p role="alert" className="text-red-700">{mutation.error.message}</p>}<div className="flex justify-end gap-2"><SGFButton type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>Voltar</SGFButton><SGFButton type="submit" loading={mutation.isPending} disabled={!payload.partner_id || !partners.isSuccess}>Salvar item</SGFButton></div></form>
  </Modal>;
}
function PriceEditor({ instrument, item, onClose, onSaved }: { instrument: ProcurementInstrument; item: ProcurementItem; onClose: () => void; onSaved: () => void }) {
  const [payload, setPayload] = useState<PricePayload>({ item_id: item.id, version: item.version, effective_on: instrument.starts_on, pricing_mode: 'unit', unit_price: null, discount_percent: null, table_reference: null, document_reference: '', reason: '' });
  const mutation = useMutation({ mutationFn: () => api.savePrice(payload), onSuccess: onSaved });
  const update = (patch: Partial<PricePayload>) => setPayload((prev) => ({ ...prev, ...patch }));
  return <Modal isOpen title={`Condição de preço · Item ${item.reference}`} description="Cada registro preserva os anteriores. Na mesma data de efeito, prevalece a revisão mais recente." size="lg" onClose={() => { if (!mutation.isPending) onClose(); }}>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}><fieldset disabled={mutation.isPending} className="space-y-4">
      <p className="text-sm">{item.description} · {item.partner_name} · Unidade: {ITEM_UNITS[item.unit]}</p>
      <SGFInput fullWidth type="date" required label="Data de início do efeito" min={instrument.starts_on} max={instrument.ends_on} value={payload.effective_on} onChange={(e) => update({ effective_on: e.target.value })} />
      <SGFSelect fullWidth label="Forma de preço" options={[{ value: 'unit', label: 'Preço unitário' }, { value: 'discount', label: 'Desconto sobre tabela' }]} value={payload.pricing_mode} onChange={(value) => update({ pricing_mode: value as PricePayload['pricing_mode'], unit_price: null, discount_percent: null, table_reference: null })} />
      {payload.pricing_mode === 'unit' ? <SGFInput fullWidth label="Preço por unidade (R$)" required type="number" min="0" step="0.000001" value={payload.unit_price ?? ''} onChange={(e) => update({ unit_price: e.target.value === '' ? null : Number(e.target.value) })} /> : <><SGFInput fullWidth label="Desconto (%)" required type="number" min="0" max="100" step="0.0001" value={payload.discount_percent ?? ''} onChange={(e) => update({ discount_percent: e.target.value === '' ? null : Number(e.target.value) })} /><SGFInput fullWidth label="Tabela de referência e versão / data-base" required minLength={3} maxLength={500} hint="Identifique a tabela e sua edição conforme o contrato." value={payload.table_reference ?? ''} onChange={(e) => update({ table_reference: e.target.value })} /></>}
      <SGFInput fullWidth label="Documento que fundamenta a condição" required minLength={3} maxLength={500} value={payload.document_reference} onChange={(e) => update({ document_reference: e.target.value })} />
      <SGFInput fullWidth label="Justificativa" required minLength={3} maxLength={1000} value={payload.reason} onChange={(e) => update({ reason: e.target.value })} />
    </fieldset>{mutation.isError && <p role="alert" className="text-red-700">{mutation.error.message}</p>}<div className="flex justify-end gap-2"><SGFButton type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>Voltar</SGFButton><SGFButton type="submit" loading={mutation.isPending}>Registrar condição</SGFButton></div></form>
  </Modal>;
}
function PriceHistory({ item, onClose }: { item: ProcurementItem; onClose: () => void }) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const query = useQuery({ queryKey: ['procurement-items', user?.tenantId, user?.id, 'prices', item.id, page], queryFn: () => api.prices(item.id, page * 20) });
  return <Modal isOpen title={`Histórico de preços · Item ${item.reference}`} size="lg" onClose={onClose}>
    {query.isPending ? <p>Carregando…</p> : query.isError ? <p role="alert">{query.error.message}</p> : <><ol className="space-y-3">{query.data.items.map((price) => <li key={price.id} className="rounded-xl border bg-white p-4 text-sm"><Condition price={price} /><p className="mt-2">Documento: {price.document_reference}</p></li>)}</ol>{!query.data.total && <p>Nenhuma condição registrada.</p>}<Paging page={page} total={query.data.total} change={setPage} /></>}
    <SGFButton type="button" variant="ghost" onClick={onClose}>Voltar aos itens</SGFButton>
  </Modal>;
}
