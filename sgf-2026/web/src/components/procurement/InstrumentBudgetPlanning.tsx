import { useState } from 'react';
import { ProcurementPreflight } from './ProcurementPreflight';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { SGFButton, SGFInput, SGFSelect, SGFCard } from '@/components/sgf';
import { Modal } from '@/components/ui/Modal';
import { ITEM_CATEGORIES } from '@/lib/procurement-items-api';
import { instrumentBudgetApi as api, type InstrumentBudget, type InstrumentBudgetPayload, type InstrumentBudgetLine } from '@/lib/instrument-budget-api';
import type { ProcurementInstrument } from '@/lib/procurement-registry-api';
const money = (value: number) => value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
const options = Object.entries(ITEM_CATEGORIES).map(([value, label]) => ({value, label}));
function Paging({page,total,size=10,change}: {page:number;total:number;size?:number;change:(p:number)=>void}) {
  return <div className="mt-4 flex items-center justify-between gap-2 text-sm"><span>{total} registro(s) · Página {page+1}</span><div className="flex gap-2"><SGFButton type="button" variant="ghost" disabled={!page} onClick={()=>change(page-1)}>Anterior</SGFButton><SGFButton type="button" variant="ghost" disabled={(page+1)*size>=total} onClick={()=>change(page+1)}>Próxima</SGFButton></div></div>;
}
export function InstrumentBudgetPlanning({instrument,onBack}: {instrument?:ProcurementInstrument;onBack?:()=>void}) {
  const {user}=useAuth();
  const [year,setYear]=useState(instrument ? Math.max(Number(instrument.starts_on.slice(0,4)),Math.min(new Date().getFullYear(),Number(instrument.ends_on.slice(0,4)))) : new Date().getFullYear());
  const [page,setPage]=useState(0);
  const [editor,setEditor]=useState<InstrumentBudget|'new'|null>(null);
  const [history,setHistory]=useState<InstrumentBudget|null>(null);
  const [preview,setPreview]=useState<InstrumentBudget|null>(null);
  const query=useQuery({queryKey:['instrument-budgets',user?.tenantId,user?.id,year,instrument?.id,page],queryFn:()=>api.list(year,instrument?.id,page*10)});
  const canEdit=['admin','superadmin'].includes(user?.accountRole??'') && user?.allowedModules?.includes('procurement') && user?.allowedModules?.includes('budgets');
  const canAudit=user?.accountRole!=='secretario';
  return <div className="space-y-5">
    {onBack && <SGFButton type="button" variant="ghost" onClick={onBack}>Voltar aos instrumentos</SGFButton>}
    <SGFCard><h2 className="text-xl font-bold">Planejamento por instrumento{instrument ? ` · ${instrument.kind==='ata'?'Ata':'Contrato'} ${instrument.reference}` : ''}</h2>
      <p className="mt-2 text-sm text-slate-600">Distribua o teto entre secretarias, categorias, dotações e fontes. Estes rascunhos serão usados nas operações após a integração. Os contratos derivados utilizam parcelas do planejamento da ata; seus valores não devem ser somados ao da ata.</p>
      <p className="mt-2 text-sm text-slate-600">O teto planejado é diferente do saldo de empenho. O saldo contábil de empenhos ainda não está integrado.</p>
    </SGFCard>
    <div className="flex flex-wrap items-end gap-3"><SGFInput label="Exercício do planejamento" type="number" min="1900" max="2200" value={year} onChange={(e)=>{const value=Number(e.target.value);if(value>=1900&&value<=2200){setYear(value);setPage(0);}}}/>
      {instrument && canEdit && query.isSuccess && !query.data.total && <SGFButton type="button" onClick={()=>setEditor('new')}>Definir teto e distribuição</SGFButton>}
      {!instrument && canEdit && <p className="text-sm text-slate-500">Para um novo planejamento, abra a ata ou contrato em “Processos, atas e contratos” e selecione “Tetos por secretaria”.</p>}
    </div>
    {query.isPending ? <p role="status">Carregando planejamento…</p> : query.isError ? <SGFCard><p role="alert" className="text-red-700">{query.error.message}</p><SGFButton type="button" onClick={()=>void query.refetch()}>Tentar novamente</SGFButton></SGFCard> : <>
      {!query.data.total && <SGFCard>Nenhum planejamento neste exercício.</SGFCard>}
      {query.data.items.map(plan=><PlanCard key={plan.id} plan={plan} canEdit={Boolean(canEdit)} canAudit={canAudit} onEdit={()=>setEditor(plan)} onHistory={()=>setHistory(plan)} onPreview={canAudit && user?.allowedModules?.includes('procurement') ? ()=>setPreview(plan) : undefined}/>)}
      <Paging page={page} total={query.data.total} change={setPage}/>
    </>}
    {editor && query.data && <PlanEditor plan={editor==='new'?undefined:editor} instrumentId={editor==='new'?instrument!.id:editor.instrument_id} year={year} departments={query.data.departments} onClose={()=>setEditor(null)}/>}
    {preview && <ProcurementPreflight plan={preview} onClose={()=>setPreview(null)}/>}
    {history && <PlanHistory plan={history} onClose={()=>setHistory(null)}/>}
  </div>;
}
function PlanCard({plan,canEdit,canAudit,onEdit,onHistory,onPreview}: {plan:InstrumentBudget;canEdit:boolean;canAudit:boolean;onEdit:()=>void;onHistory:()=>void;onPreview?:()=>void}) {
  const [page,setPage]=useState(0);
  const [departmentPage,setDepartmentPage]=useState(0);
  const departmentTotals = new Map<string, {name:string;total:number}>();
  for (const line of plan.allocations) {
    const previous = departmentTotals.get(line.department_id);
    departmentTotals.set(line.department_id, {name:line.department_name,total:(previous?.total??0)+line.spending_limit});
  }
  const departments = [...departmentTotals.entries()];
  const allocated=plan.allocations.reduce((sum,line)=>sum+line.spending_limit,0);
  return <SGFCard><div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-semibold">{plan.kind==='ata'?'Ata':'Contrato'} {plan.reference} · {plan.fiscal_year}</h3><p className="text-sm text-slate-500">Rascunho · Revisão {plan.version}{plan.origin_ata_id?' · Parcela da ata de origem':''}</p></div><div className="flex flex-wrap gap-2">{onPreview && plan.kind==='contract' && <SGFButton type="button" variant="secondary" onClick={onPreview}>Simular operação</SGFButton>}{canEdit&&<SGFButton type="button" variant="secondary" onClick={onEdit}>Revisar / remanejar</SGFButton>}{canAudit&&<SGFButton type="button" variant="ghost" onClick={onHistory}>Histórico</SGFButton>}</div></div>
    <div className="my-4 grid gap-3 sm:grid-cols-3">{plan.total_limit!==null&&<div><p className="text-xs text-slate-500">Teto do instrumento neste exercício</p><strong>{money(plan.total_limit)}</strong></div>}<div><p className="text-xs text-slate-500">{plan.total_limit===null?'Cota da sua secretaria':'Distribuído em dotações'}</p><strong>{money(allocated)}</strong></div>{plan.total_limit!==null&&<div><p className="text-xs text-slate-500">Ainda não distribuído</p><strong>{money(plan.total_limit-allocated)}</strong></div>}</div>
    {plan.declared_value!==null&&<p className="mb-3 text-sm">Valor {plan.kind==='ata'?'registrado':'contratado'} total: {money(plan.declared_value)}</p>}
    <p className="mb-3 text-xs text-slate-500">Fundamento da distribuição: {plan.document_reference}</p>
    <section className="mb-5 rounded-xl border border-slate-200 p-3" aria-label="Totais por secretaria">
      <h4 className="mb-2 font-semibold">Totais por secretaria</h4>
      <p className="mb-3 text-xs text-slate-500">Soma das dotações e fontes de cada secretaria neste exercício.</p>
      <dl className="space-y-2">{departments.slice(departmentPage*10,(departmentPage+1)*10).map(([id,department])=><div key={id} className="flex justify-between gap-3 text-sm"><dt>{department.name}</dt><dd className="font-semibold">{money(department.total)}</dd></div>)}</dl>
      {departments.length>10&&<Paging page={departmentPage} total={departments.length} change={setDepartmentPage}/>}
    </section>
    <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr>{['Secretaria','Categoria','Dotação / SIM-AM','Fonte','Teto planejado'].map(h=><th key={h} className="border-b p-2">{h}</th>)}</tr></thead><tbody>{plan.allocations.slice(page*10,(page+1)*10).map(line=><tr key={line.id}><td className="border-b p-2">{line.department_name}</td><td className="border-b p-2">{ITEM_CATEGORIES[line.category]}</td><td className="border-b p-2">{line.appropriation}{line.simam_code&&<p className="text-xs text-slate-500">{line.simam_code}</p>}</td><td className="border-b p-2">{line.funding_source}</td><td className="border-b p-2 font-semibold">{money(line.spending_limit)}</td></tr>)}</tbody></table></div><Paging page={page} total={plan.allocations.length} change={setPage}/>
  </SGFCard>;
}
function PlanEditor({plan,instrumentId,year,departments,onClose}: {plan?:InstrumentBudget;instrumentId:string;year:number;departments:Array<{id:string;name:string}>;onClose:()=>void}) {
  const client=useQueryClient();
  const [form,setForm]=useState<InstrumentBudgetPayload>({...(plan?{id:plan.id,version:plan.version}:{}),instrument_id:instrumentId,fiscal_year:year,total_limit:plan?.total_limit??0,document_reference:plan?.document_reference??'',reason:'',allocations:plan?.allocations.map(({id,department_id,category,spending_limit,appropriation,funding_source,simam_code})=>({id,department_id,category,spending_limit,appropriation,funding_source,simam_code}))??[]});
  const [page,setPage]=useState(0);
  const save=useMutation({mutationFn:()=>api.save(form),onSuccess:()=>{void client.invalidateQueries({queryKey:['instrument-budgets']});void client.invalidateQueries({queryKey:['procurement-registry']});onClose();}});
  const change=(index:number,patch:Partial<InstrumentBudgetLine>)=>setForm(prev=>({...prev,allocations:prev.allocations.map((line,i)=>i===index?{...line,...patch}:line)}));
  const allocated=form.allocations.reduce((sum,line)=>sum+line.spending_limit,0);
  return <Modal isOpen onClose={()=>{if(!save.isPending)onClose();}} title={`${plan?'Revisar / remanejar':'Definir'} planejamento · ${year}`} description="Cada revisão exige documento e justificativa e preserva o histórico." size="xl"><form className="space-y-4" onSubmit={e=>{e.preventDefault();save.mutate();}}>
    <fieldset disabled={save.isPending} className="space-y-4"><SGFInput fullWidth type="number" min="0" step="0.01" required label="Teto do instrumento no exercício (R$)" value={form.total_limit} onChange={e=>setForm({...form,total_limit:Number(e.target.value)})}/><p className="text-sm">Distribuído: {money(allocated)} · Não distribuído: {money(form.total_limit-allocated)}</p>
      <div className="space-y-4">{form.allocations.slice(page*5,(page+1)*5).map((line,offset)=>{const index=page*5+offset;return <fieldset key={line.id??index} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><legend className="px-1 text-sm font-semibold">Dotação {index+1}</legend><div className="grid gap-3 sm:grid-cols-2"><SGFSelect fullWidth disabled={save.isPending} label="Secretaria" placeholder="Selecione" value={line.department_id} options={departments.map(d=>({value:d.id,label:d.name}))} onChange={value=>change(index,{department_id:value})}/><SGFSelect fullWidth disabled={save.isPending} label="Categoria" value={line.category} options={options} onChange={value=>change(index,{category:value as InstrumentBudgetLine['category']})}/><SGFInput fullWidth required maxLength={150} label="Dotação orçamentária" value={line.appropriation} onChange={e=>change(index,{appropriation:e.target.value})}/><SGFInput fullWidth required maxLength={30} label="Fonte de recursos" value={line.funding_source} onChange={e=>change(index,{funding_source:e.target.value})}/><SGFInput fullWidth label="Código da dotação SIM-AM (opcional)" maxLength={28} pattern="[0-9]{28}" value={line.simam_code} onChange={e=>change(index,{simam_code:e.target.value})}/><SGFInput fullWidth required type="number" min="0" step="0.01" label="Teto desta dotação (R$)" value={line.spending_limit} onChange={e=>change(index,{spending_limit:Number(e.target.value)})}/></div><SGFButton type="button" size="sm" variant="ghost" onClick={()=>{setForm({...form,allocations:form.allocations.filter((_,i)=>i!==index)});setPage(Math.min(page,Math.max(0,Math.ceil((form.allocations.length-1)/5)-1)));}}>Remover dotação</SGFButton></fieldset>;})}</div>
      <Paging page={page} total={form.allocations.length} size={5} change={setPage}/><SGFButton type="button" variant="secondary" disabled={form.allocations.length>=200} onClick={()=>{setForm({...form,allocations:[...form.allocations,{department_id:'',category:'fuel',spending_limit:0,appropriation:'',funding_source:'',simam_code:''}]});setPage(Math.floor(form.allocations.length/5));}}>Adicionar dotação / fonte</SGFButton>
      <SGFInput fullWidth required minLength={3} maxLength={500} label="Documento que autoriza a distribuição" value={form.document_reference} onChange={e=>setForm({...form,document_reference:e.target.value})}/><SGFInput fullWidth required minLength={3} maxLength={1000} label="Justificativa do cadastro ou remanejamento" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/>
    </fieldset>{save.isError&&<p role="alert" className="text-red-700">{save.error.message || 'Não foi possível salvar o planejamento. Verifique sua conexão e tente novamente.'}</p>}<div className="flex justify-end gap-2"><SGFButton type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>Cancelar</SGFButton><SGFButton type="submit" loading={save.isPending} disabled={!form.allocations.length||form.allocations.some(a=>!a.department_id)}>Salvar planejamento</SGFButton></div>
  </form></Modal>;
}
function describe(value:unknown):string {
  if(!value||typeof value!=='object')return 'Sem registro anterior';
  const row=value as Record<string,unknown>;
  const lines=[`Teto do exercício: ${money(Number(row.total_limit??0))}`,`Documento: ${String(row.document_reference??'')}`];
  if(Array.isArray(row.allocations))for(const entry of row.allocations){if(!entry||typeof entry!=='object')continue;const a=entry as Record<string,unknown>;lines.push(`${a.department_name} · ${ITEM_CATEGORIES[a.category as keyof typeof ITEM_CATEGORIES]??a.category}: ${money(Number(a.spending_limit))} · Dotação ${a.appropriation} · Fonte ${a.funding_source}`);}
  return lines.join('\n');
}
function PlanHistory({plan,onClose}: {plan:InstrumentBudget;onClose:()=>void}) {
  const {user}=useAuth();const [page,setPage]=useState(0);
  const query=useQuery({queryKey:['instrument-budgets',user?.tenantId,user?.id,'events',plan.id,page],queryFn:()=>api.events(plan.id,page*20)});
  return <Modal isOpen onClose={onClose} title={`Histórico do planejamento · ${plan.reference}`} size="xl">{query.isPending?<p>Carregando histórico…</p>:query.isError?<p role="alert">{query.error.message}</p>:<><div className="space-y-3">{query.data.items.map(event=><details key={event.id} className="rounded-xl border bg-white p-3 text-sm"><summary>{new Date(event.occurred_at).toLocaleString('pt-BR')} · {event.actor_name} · {event.reason}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><strong>Antes</strong><p className="whitespace-pre-wrap">{describe(event.before_value)}</p></div><div><strong>Depois</strong><p className="whitespace-pre-wrap">{describe(event.after_value)}</p></div></div></details>)}</div><Paging page={page} total={query.data.total} size={20} change={setPage}/></>}</Modal>;
}
