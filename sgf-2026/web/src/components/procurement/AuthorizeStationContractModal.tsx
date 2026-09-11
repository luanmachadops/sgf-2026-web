import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { SGFButton, SGFInput, SGFSelect } from '@/components/sgf';
import { useAuth } from '@/contexts/AuthContext';
import { useDrivers } from '@/hooks/useDrivers';
import { vehiclesApi } from '@/lib/supabase-api';
import { stationOperationsApi } from '@/lib/station-operations-api';
import type { ProcurementItem } from '@/lib/procurement-items-api';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function expiry() {
  const date = new Date(Date.now() + 86400000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function AuthorizeStationContractModal({ item, allocationId, initialQuantity, onClose }: {
  item: ProcurementItem; allocationId: string; initialQuantity: string; onClose: () => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [requestId] = useState(() => crypto.randomUUID());
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [catalogId, setCatalogId] = useState('');
  const [quantity, setQuantity] = useState(initialQuantity);
  const [expiresAt, setExpiresAt] = useState(expiry);
  const [note, setNote] = useState('');
  const vehicles = useQuery({ queryKey: ['contract-operation-vehicles', user?.tenantId, user?.id], queryFn: () => vehiclesApi.getAll() });
  const drivers = useDrivers({ status: 'ACTIVE' });
  const catalog = useQuery({ queryKey: ['contract-operation-catalog', user?.tenantId, user?.id, item.partner_id], queryFn: () => stationOperationsApi.listCatalog(item.partner_id) });
  const kind = item.category === 'arla' ? 'arla' : item.category === 'lubricant' ? 'lubrificante' : 'servico';
  const unit = item.unit === 'SERV' ? 'SERVICO' : item.unit;
  const options = (catalog.data ?? []).filter(row => row.active && row.kind === kind && row.unit === unit);
  const authorize = useMutation({
    mutationFn: () => stationOperationsApi.authorizeContract(requestId, { itemId: item.id, allocationId, vehicleId, driverId, catalogItemId: catalogId, quantity: Number(quantity), expiresAt: new Date(expiresAt).toISOString(), note: note.trim() }),
    onSuccess: () => {
      toast.success('Autorização complementar vinculada enviada ao posto.');
      void client.invalidateQueries({ queryKey: ['station-operations'] });
      onClose();
    },
  });
  const ready = vehicleId && driverId && options.some(row => row.itemId === catalogId) && Number(quantity) > 0 && expiresAt;
  return <Modal isOpen onClose={() => { if (!authorize.isPending) onClose(); }} title="Autorizar item ou serviço do contrato" size="lg">
    <p className="mb-4 text-sm text-slate-600"><strong>{item.reference} · {item.description}</strong> · {item.partner_name}. A autorização reserva o item e a dotação selecionados. Exige contrato habilitado e saldo de empenho; o servidor confere o preço vigente na emissão de hoje.</p>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (ready) authorize.mutate(); }}>
      <fieldset disabled={authorize.isPending} className="space-y-4">
        {catalog.isPending || vehicles.isPending || drivers.isLoading ? <p role="status">Carregando opções…</p> : null}
        {catalog.isError || vehicles.isError || drivers.isError ? <p role="alert" className="text-red-700">Não foi possível carregar todas as opções. Feche e tente novamente.</p> : null}
        <SGFSelect fullWidth label="Item correspondente no catálogo do posto" value={catalogId} onChange={setCatalogId} placeholder="Selecione o item conferido" options={options.map(row => ({ value: row.itemId, label: `${row.name} · ${row.unit}` }))}/>
        <p className="text-xs text-slate-500">Confira se o item do catálogo corresponde à especificação contratada. O preço utilizado será o do contrato.</p>
        {!catalog.isPending && !catalog.isError && options.length === 0 && <p role="alert">Não há item ativo com categoria e unidade compatíveis no catálogo deste posto.</p>}
        <SGFSelect fullWidth label="Veículo" value={vehicleId} onChange={setVehicleId} placeholder="Selecione o veículo" options={(vehicles.data ?? []).map(row => ({ value: row.id, label: `${row.plate} · ${row.brand} ${row.model}` }))}/>
        <SGFSelect fullWidth label="Motorista responsável" value={driverId} onChange={setDriverId} placeholder="Selecione o motorista" options={(drivers.data ?? []).map(row => ({ value: row.id, label: row.full_name }))}/>
        <div className="grid gap-4 sm:grid-cols-2">
          <SGFInput fullWidth required type="number" min="0.001" step="0.001" label={`Quantidade (${unit})`} value={quantity} onChange={event => setQuantity(event.target.value)}/>
          <SGFInput fullWidth required type="datetime-local" label="Validade" value={expiresAt} onChange={event => setExpiresAt(event.target.value)}/>
        </div>
        <SGFInput fullWidth maxLength={1000} label="Observação" value={note} onChange={event => setNote(event.target.value)}/>
      </fieldset>
      <p className="rounded-xl bg-slate-50 p-3 text-sm">Estimativa pelo preço da simulação: <strong>{money(Number(quantity || 0) * (item.price?.unit_price ?? 0))}</strong>. O preço e os saldos serão revalidados na emissão.</p>
      {authorize.isError && <p role="alert" className="text-red-700">{authorize.error.message}</p>}
      <div className="flex justify-end gap-2"><SGFButton type="button" variant="ghost" disabled={authorize.isPending} onClick={onClose}>Cancelar</SGFButton><SGFButton type="submit" disabled={!ready || catalog.isError || vehicles.isError || drivers.isError} loading={authorize.isPending}>Enviar autorização</SGFButton></div>
    </form>
  </Modal>;
}
