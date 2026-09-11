import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { SGFButton, SGFInput, SGFSelect } from '@/components/sgf';
import { procurementItemsApi, ITEM_CATEGORIES } from '@/lib/procurement-items-api';
import { instrumentBudgetApi, type InstrumentBudget } from '@/lib/instrument-budget-api';

const money = (value: number) => value.toLocaleString('pt-BR', {style:'currency',currency:'BRL'});

export function ProcurementPreflight({plan,onClose}:{plan:InstrumentBudget;onClose:()=>void}) {
  const {user}=useAuth();
  const [date,setDate]=useState(`${plan.fiscal_year}-01-01`);
  const [page,setPage]=useState(0);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('');
  const [itemId,setItemId]=useState('');
  const [allocationId,setAllocationId]=useState('');
  const [quantity,setQuantity]=useState('');
  const [base,setBase]=useState('');
  const items=useQuery({queryKey:['procurement-preflight-items',user?.tenantId,user?.id,plan.instrument_id,page,filter,date],queryFn:()=>procurementItemsApi.list(plan.instrument_id,page*20,filter,date),enabled:Boolean(date)});
  const item=items.data?.items.find(i=>i.id===itemId);
  const preview=useMutation({mutationFn:()=>instrumentBudgetApi.preview({item_id:itemId,allocation_id:allocationId,operation_date:date,quantity:Number(quantity),...(item?.price?.pricing_mode==='discount' && base!=='' ? {base_price:Number(base),table_reference:item.price.table_reference??''}: {})})});
  const reset=()=>preview.reset();
  const changePage=(next:number)=>{setPage(next);setItemId('');reset();};
  return <Modal isOpen onClose={onClose} title={`Simular operação · Contrato ${plan.reference}`} size="xl">
    <p className="mb-4 text-sm text-slate-600">Confira uma operação contra o planejamento em rascunho. A simulação não reserva valores, não emite autorização e não considera gastos ou reservas do sistema atual. A disponibilidade deverá ser revalidada na autorização após a integração.</p>
    <form className="space-y-4" onSubmit={event=>{event.preventDefault();preview.mutate();}}>
      <fieldset disabled={preview.isPending} className="space-y-4">
        <SGFInput fullWidth required type="date" label="Data prevista da operação" value={date} onChange={e=>{setDate(e.target.value);setItemId('');setPage(0);reset();}}/>
        <div className="flex items-end gap-2"><SGFInput fullWidth label="Buscar item ou lote" value={search} onChange={e=>setSearch(e.target.value)}/><SGFButton type="button" variant="secondary" onClick={()=>{setFilter(search);changePage(0);}}>Buscar</SGFButton></div>
        {items.isPending?<p role="status">Carregando itens…</p>:items.isError?<p role="alert">{items.error.message}</p>:<>
          <SGFSelect fullWidth disabled={preview.isPending} label="Item e fornecedor" placeholder="Selecione um item" value={itemId} options={items.data.items.map(i=>({value:i.id,label:`${i.reference} · ${i.description} · ${i.partner_name}`}))} onChange={value=>{setItemId(value);setBase('');setAllocationId('');reset();}}/>
          <div className="flex items-center justify-between text-sm"><span>{items.data.total} item(ns) · Página {page+1}</span><div className="flex gap-2"><SGFButton type="button" variant="ghost" disabled={!page} onClick={()=>changePage(page-1)}>Anterior</SGFButton><SGFButton type="button" variant="ghost" disabled={(page+1)*20>=items.data.total} onClick={()=>changePage(page+1)}>Próxima</SGFButton></div></div>
        </>}
        {item && <p className="text-sm">{ITEM_CATEGORIES[item.category]} · Quantidade cadastrada: {item.quantity.toLocaleString('pt-BR')} {item.unit}. {item.price ? `Condição vigente desde ${item.price.effective_on} · revisão ${item.price.revision}.` : 'Sem preço aplicável na data selecionada.'}</p>}
        <SGFSelect fullWidth disabled={preview.isPending} label="Secretaria, dotação e fonte" placeholder="Selecione uma dotação" value={allocationId} options={plan.allocations.filter(a=>!item||a.category===item.category).map(a=>({value:a.id,label:`${a.department_name} · ${a.appropriation} · Fonte ${a.funding_source} · ${money(a.spending_limit)}`}))} onChange={value=>{setAllocationId(value);reset();}}/>
        <SGFInput fullWidth required type="number" min="0.001" step="0.001" label={`Quantidade (${item?.unit??'unidade do item'})`} value={quantity} onChange={e=>{setQuantity(e.target.value);reset();}}/>
        {item?.price?.pricing_mode==='discount' && <><p className="text-sm">Desconto: {item.price.discount_percent}% · Tabela: {item.price.table_reference}</p><SGFInput fullWidth type="number" min="0" step="0.000001" label="Preço-base unitário da tabela (informado para esta simulação)" value={base} onChange={e=>{setBase(e.target.value);reset();}}/></>}
      </fieldset>
      {preview.isError && <p role="alert" className="text-red-700">{preview.error.message}</p>}
      {preview.data && <div role="status" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-semibold">{preview.data.planning_compatible?'Compatível com o planejamento':'Revisar antes da operação'}</h3>{preview.data.estimated_total!==null&&<p>Valor estimado: <strong>{money(preview.data.estimated_total)}</strong></p>}<p>Teto cadastrado da dotação: {money(preview.data.allocation_limit)}</p>{preview.data.issues.length>0&&<ul className="list-disc pl-5">{preview.data.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}<p className="text-xs text-slate-600">Planejamento revisão {preview.data.plan_version} · Item versão {preview.data.item_version} · Preço revisão {preview.data.price_revision??'indisponível'}. Nenhuma reserva realizada.</p></div>}
      <div className="flex justify-end gap-2"><SGFButton type="button" variant="ghost" onClick={onClose}>Fechar</SGFButton><SGFButton type="submit" disabled={!item||!allocationId||!date} loading={preview.isPending}>Conferir planejamento</SGFButton></div>
    </form>
  </Modal>;
}
