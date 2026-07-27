import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import {
    Building2,
    Calendar,
    Car,
    DollarSign,
    Edit,
    FileText,
    Gauge,
    ShieldCheck,
    User,
    Wrench,
    X,
} from '@/components/sgf/icons';
import { maintenancesApi } from '@/lib/supabase-api';
import { useAuthorizeMaintenance, useCancelMaintenance } from '@/hooks/useMaintenances';
import { useRepairShops } from '@/hooks/useRepairShops';
import { ServiceOrderFiscalPanel } from './ServiceOrderFiscalPanel';
import { formatCurrency, formatDate, getPriorityStyles } from '@/lib/utils';
import type { Tables } from '@/types/database.types';
import type { FinStatus, OpStatus } from '@/lib/supabase-api';

interface Props {
    maintenanceId: string | null;
    onClose: () => void;
    onEdit?: (maintenance: Row) => void;
}

const PRIORITY_LABEL: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
const ORIGIN_LABEL: Record<string, string> = {
    driver: 'Solicitação do motorista',
    checklist: 'Gerada por checklist',
    manager: 'Aberta pelo gestor',
};
const OP_LABEL: Record<OpStatus, string> = {
    pending: 'Em triagem',
    authorized: 'Autorizada',
    at_shop: 'Na oficina',
    awaiting_quote_approval: 'Orçamento em análise',
    in_progress: 'Em execução',
    ready: 'Pronta para retirada',
    received: 'Veículo recebido',
    cancelled: 'Cancelada',
};
const FIN_LABEL: Record<FinStatus, string> = {
    not_started: 'Financeiro não iniciado',
    awaiting_commitment: 'Aguardando empenho',
    committed: 'Empenhada',
    invoiced: 'Faturada',
    attested: 'Atestada',
    paid: 'Paga',
};

export type MaintenanceDetailsRow = Tables<'service_orders'> & {
    vehicles?: {
        plate: string;
        brand: string | null;
        model: string | null;
        photo_url?: string | null;
        departments?: { name: string } | null;
    } | null;
    profiles?: { full_name: string; photo_url?: string | null } | null;
};

type Row = MaintenanceDetailsRow;

export function MaintenanceDetailsModal(props: Props) {
    return (
        <MaintenanceDetailsModalContent
            key={props.maintenanceId ?? 'closed'}
            {...props}
        />
    );
}

function MaintenanceDetailsModalContent({ maintenanceId, onClose, onEdit }: Props) {
    const [repairShopId, setRepairShopId] = useState('');
    const [managerNote, setManagerNote] = useState('');
    const [cancelReason, setCancelReason] = useState('');
    const authorize = useAuthorizeMaintenance();
    const cancel = useCancelMaintenance();
    const { data: repairShops = [], isLoading: shopsLoading } = useRepairShops({ activeOnly: true });
    const { data, isLoading } = useQuery({
        queryKey: ['maintenance', maintenanceId],
        queryFn: () => maintenancesApi.getById(maintenanceId!),
        enabled: Boolean(maintenanceId),
    });
    const m = data as Row | undefined;

    const shopOptions = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return repairShops.map((shop) => {
            const expired = Boolean(shop.contract_end && shop.contract_end < today);
            return {
                value: shop.id,
                label: `${shop.name}${shop.contract_number ? ` · contrato ${shop.contract_number}` : ''}`,
                photoUrl: shop.photo_url,
                disabled: expired,
                disabledReason: expired ? 'Contrato vencido' : undefined,
            };
        });
    }, [repairShops]);

    const op = (m?.operational_status ?? 'pending') as OpStatus;
    const fin = (m?.financial_status ?? 'not_started') as FinStatus;
    const canCancel = ['pending', 'authorized', 'at_shop', 'awaiting_quote_approval'].includes(op)
        && ['not_started', 'awaiting_commitment'].includes(fin);
    const busy = authorize.isPending || cancel.isPending;

    const handleAuthorize = async () => {
        if (!m || !repairShopId) return;
        try {
            await authorize.mutateAsync({ id: m.id, repairShopId, note: managerNote });
            setManagerNote('');
            toast.success('OS autorizada e enviada para a oficina.');
        } catch (error) {
            toast.error((error as { message?: string }).message ?? 'Não foi possível autorizar a OS.');
        }
    };

    const handleCancel = async () => {
        if (!m || !cancelReason.trim()) return;
        try {
            await cancel.mutateAsync({ id: m.id, reason: cancelReason });
            setCancelReason('');
            toast.success('Ordem de serviço cancelada.');
        } catch (error) {
            toast.error((error as { message?: string }).message ?? 'Não foi possível cancelar a OS.');
        }
    };

    return (
        <Modal isOpen={Boolean(maintenanceId)} onClose={onClose} title="Fluxo da ordem de serviço" size="xl">
            {isLoading || !m ? (
                <p className="py-8 text-center text-sm text-slate-400">Carregando…</p>
            ) : (
                <div className="space-y-6">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
                                <Wrench className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    {ORIGIN_LABEL[m.origin] ?? 'Ordem de serviço'}
                                </p>
                                <p className="font-bold text-slate-800">{m.category ?? 'Sem categoria'}</p>
                                <p className="text-xs text-slate-500">OS {m.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <SGFBadge variant={op === 'cancelled' ? 'error' : op === 'received' ? 'success' : 'info'}>
                                {OP_LABEL[op]}
                            </SGFBadge>
                            <SGFBadge variant={fin === 'paid' ? 'success' : fin === 'not_started' ? 'default' : 'warning'}>
                                {FIN_LABEL[fin]}
                            </SGFBadge>
                            {onEdit && op === 'pending' && (
                                <SGFButton size="sm" variant="outline" icon={Edit} onClick={() => onEdit(m)}>
                                    Editar solicitação
                                </SGFButton>
                            )}
                        </div>
                    </div>

                    {m.description && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                <FileText className="h-3.5 w-3.5" /> Relato da avaria
                            </p>
                            <p className="text-sm text-slate-700">{m.description}</p>
                        </div>
                    )}

                    {/* Bloco 1: Veículo e Oficina */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Veículo com foto */}
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                {m.vehicles?.photo_url ? (
                                    <img src={m.vehicles.photo_url} alt="Veículo" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                                        <Car className="h-5 w-5" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Veículo</p>
                                <p className="truncate font-bold text-slate-800">
                                    {m.vehicles ? `${m.vehicles.brand ?? ''} ${m.vehicles.model ?? ''} · ${m.vehicles.plate}`.trim() : '—'}
                                </p>
                            </div>
                        </div>

                        {/* Oficina */}
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                                <Building2 className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Oficina</p>
                                <p className="truncate font-bold text-slate-800">{m.repair_shop ?? 'Aguardando triagem'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Bloco 2: Aberta em, Hodômetro, Motorista e Prioridade */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {/* Aberta em */}
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                                <Calendar className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Aberta em</p>
                                <p className="truncate font-bold text-slate-800">{formatDate(m.created_at)}</p>
                            </div>
                        </div>

                        {/* Odômetro / Hodômetro */}
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                                <Gauge className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hodômetro</p>
                                <p className="truncate font-bold text-slate-800">{m.odometer != null ? `${Number(m.odometer).toLocaleString('pt-BR')} km` : 'Não informado'}</p>
                            </div>
                        </div>

                        {/* Motorista com foto */}
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                                {m.profiles?.photo_url ? (
                                    <img src={m.profiles.photo_url} alt="Motorista" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                                        <User className="h-5 w-5" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Motorista</p>
                                <p className="truncate font-bold text-slate-800">{m.profiles?.full_name ?? '—'}</p>
                            </div>
                        </div>

                        {/* Prioridade com cor específica do nível */}
                        {(() => {
                            const pStyle = getPriorityStyles(m.priority);
                            return (
                                <div className={`flex items-center gap-3 rounded-2xl border p-3.5 shadow-xs transition-colors ${pStyle.bg} ${pStyle.border}`}>
                                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${pStyle.iconBg}`}>
                                        <Wrench className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Prioridade</p>
                                        <p className={`truncate font-bold ${pStyle.text}`}>{PRIORITY_LABEL[m.priority] ?? m.priority}</p>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {op === 'pending' && (
                        <section className="rounded-2xl border border-emerald-300/80 bg-white p-5 shadow-xs">
                            <div className="mb-4">
                                <h3 className="text-sm font-bold text-emerald-950">Triagem e autorização do gestor</h3>
                                <p className="text-xs text-slate-500">
                                    Confirme a solicitação e vincule uma oficina ativa com contrato vigente.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <SGFSelect
                                    label="Oficina responsável"
                                    options={shopOptions}
                                    value={repairShopId}
                                    onChange={setRepairShopId}
                                    placeholder={shopsLoading ? 'Carregando...' : 'Selecione a oficina'}
                                    disabled={shopsLoading}
                                    fullWidth
                                    icon={Building2}
                                />
                                <SGFTextarea
                                    label="Orientação para a oficina (opcional)"
                                    value={managerNote}
                                    onChange={(event) => setManagerNote(event.target.value)}
                                    rows={2}
                                    fullWidth
                                />
                            </div>
                            <SGFButton
                                className="mt-3"
                                size="sm"
                                icon={ShieldCheck}
                                disabled={busy || !repairShopId}
                                onClick={handleAuthorize}
                            >
                                Autorizar e encaminhar
                            </SGFButton>
                        </section>
                    )}

                    {op !== 'pending' && op !== 'cancelled' && (
                        <ServiceOrderFiscalPanel
                            orderId={m.id}
                            operationalStatus={op}
                            financialStatus={fin}
                            commitmentNumber={m.commitment_number}
                        />
                    )}

                    {canCancel && (
                        <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-xs">
                            <h3 className="text-sm font-bold text-red-950">Cancelar esta ordem de serviço</h3>
                            <p className="mb-4 text-xs text-slate-500">
                                O motivo fica registrado na trilha de auditoria e é enviado aos envolvidos.
                            </p>
                            <div className="flex flex-col items-end gap-3 md:flex-row">
                                <SGFTextarea
                                    label="Motivo obrigatório"
                                    value={cancelReason}
                                    onChange={(event) => setCancelReason(event.target.value)}
                                    rows={2}
                                    fullWidth
                                />
                                <SGFButton
                                    className="shrink-0"
                                    size="sm"
                                    variant="danger"
                                    icon={X}
                                    disabled={busy || !cancelReason.trim()}
                                    onClick={handleCancel}
                                >
                                    Cancelar OS
                                </SGFButton>
                            </div>
                        </section>
                    )}

                    {m.admin_note && op === 'cancelled' && (
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-red-500">Motivo do cancelamento</p>
                            <p className="text-sm text-red-900">{m.admin_note}</p>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}

export default MaintenanceDetailsModal;
