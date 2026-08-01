import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import {
    Building2,
    Calendar,
    Car,
    Edit,
    FileText,
    Gauge,
    Printer,
    ShieldCheck,
    User,
    Wrench,
    X,
} from '@/components/sgf/icons';
import { maintenancesApi } from '@/lib/supabase-api';
import { useAuthorizeMaintenance, useCancelMaintenance } from '@/hooks/useMaintenances';
import { useRepairShops } from '@/hooks/useRepairShops';
import { ServiceOrderFiscalPanel } from './ServiceOrderFiscalPanel';
import { DossierPrintViewerModal } from './DossierPrintViewerModal';
import { WorkshopModalShell } from '@/components/partners/workshop/WorkshopModalShell';
import { formatDate, getPriorityStyles } from '@/lib/utils';
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
    repair_shops?: { id: string; name: string; photo_url?: string | null } | null;
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
    const [showCancelInput, setShowCancelInput] = useState(false);
    const [showDossier, setShowDossier] = useState(false);
    const authorize = useAuthorizeMaintenance();
    const cancel = useCancelMaintenance();
    const { data: repairShops = [], isLoading: shopsLoading } = useRepairShops({ activeOnly: true });
    const { data, isLoading } = useQuery({
        queryKey: ['maintenance', maintenanceId],
        queryFn: () => maintenancesApi.getById(maintenanceId!),
        enabled: Boolean(maintenanceId),
    });
    const m = data as Row | undefined;

    const shopPhotoUrl = m?.repair_shops?.photo_url || repairShops.find((s) => s.id === m?.repair_shop_id || s.name === m?.repair_shop)?.photo_url;

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
            setShowCancelInput(false);
            toast.success('Ordem de serviço cancelada.');
        } catch (error) {
            toast.error((error as { message?: string }).message ?? 'Não foi possível cancelar a OS.');
        }
    };

    if (!maintenanceId) return null;

    return (
        <WorkshopModalShell
            onClose={onClose}
            eyebrow="Ordem de serviço"
            title={m?.vehicles
                ? `${m.vehicles.plate} · ${m.vehicles.brand ?? ''} ${m.vehicles.model ?? ''}`.trim()
                : 'Carregando ordem de serviço…'}
            subtitle={m ? `Aberta em ${formatDate(m.created_at, 'dd/MM/yyyy, HH:mm')}` : undefined}
            busy={busy}
            maxWidthClass="sm:max-w-4xl"
            zIndexClass="z-50"
            footer={
                showCancelInput ? (
                        <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center">
                            <div className="flex-1">
                                <SGFInput
                                    placeholder="Justificativa do cancelamento (obrigatório)..."
                                    value={cancelReason}
                                    onChange={(event) => setCancelReason(event.target.value)}
                                    fullWidth
                                    autoFocus
                                />
                            </div>
                            <div className="flex items-center justify-end gap-2 shrink-0">
                                <SGFButton
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setShowCancelInput(false);
                                        setCancelReason('');
                                    }}
                                >
                                    Voltar
                                </SGFButton>
                                <SGFButton
                                    size="sm"
                                    variant="ghost"
                                    icon={X}
                                    disabled={busy || !cancelReason.trim()}
                                    className="!text-red-600 hover:!bg-red-50 focus:!ring-red-500/20 font-semibold"
                                    onClick={handleCancel}
                                >
                                    Confirmar cancelamento
                                </SGFButton>
                            </div>
                        </div>
                    ) : (
                        <div className="flex w-full flex-wrap items-center justify-end gap-2">
                                <SGFButton variant="ghost" onClick={onClose}>Fechar</SGFButton>
                                {onEdit && m && op === 'pending' && (
                                    <SGFButton size="sm" variant="outline" icon={Edit} onClick={() => onEdit(m)}>
                                        Editar solicitação
                                    </SGFButton>
                                )}
                                {canCancel && (
                                    <SGFButton
                                        size="sm"
                                        variant="ghost"
                                        icon={X}
                                        disabled={busy}
                                        className="!text-red-600 hover:!bg-red-50 focus:!ring-red-500/20 font-semibold"
                                        onClick={() => setShowCancelInput(true)}
                                    >
                                        Cancelar OS
                                    </SGFButton>
                                )}
                                {op === 'pending' && (
                                    <SGFButton
                                        size="sm"
                                        icon={ShieldCheck}
                                        disabled={busy || !repairShopId}
                                        onClick={handleAuthorize}
                                    >
                                        Autorizar e encaminhar
                                    </SGFButton>
                                )}
                        </div>
                    )
            }
        >
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
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                {shopPhotoUrl ? (
                                    <img src={shopPhotoUrl} alt="Oficina" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                                        <Building2 className="h-5 w-5" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Oficina</p>
                                <p className="truncate font-bold text-slate-800">{m.repair_shops?.name ?? m.repair_shop ?? 'Aguardando triagem'}</p>
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
                                <SGFInput
                                    label="Orientação para a oficina (opcional)"
                                    placeholder="Orientação para a oficina..."
                                    value={managerNote}
                                    onChange={(event) => setManagerNote(event.target.value)}
                                    fullWidth
                                />
                            </div>
                        </section>
                    )}

                    {op !== 'pending' && op !== 'cancelled' && (
                        <ServiceOrderFiscalPanel
                            orderId={m.id}
                            operationalStatus={op}
                            financialStatus={fin}
                            commitmentNumber={m.commitment_number}
                            commitmentDocumentPath={m.commitment_document_path}
                            tenantId={m.tenant_id}
                        />
                    )}

                    {m.admin_note && op === 'cancelled' && (
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-red-500">Motivo do cancelamento</p>
                            <p className="text-sm text-red-900">{m.admin_note}</p>
                        </div>
                    )}

                    {/* Bloco Dossiê de Prestação de Contas / Processo PDF */}
                    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700">
                                <Printer className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-base font-bold text-slate-950">Dossiê e prestação de contas</p>
                                <p className="mt-1 text-sm leading-5 text-slate-500">
                                    Gerar relatório consolidado com capa oficial, orçamentos, empenhos, NFs e fotos em 1 único PDF.
                                </p>
                            </div>
                        </div>
                        <SGFButton
                            variant="primary"
                            icon={Printer}
                            onClick={() => setShowDossier(true)}
                            className="shrink-0 font-semibold"
                        >
                            Imprimir Dossiê OS
                        </SGFButton>
                    </div>
                </div>
            )}

            <DossierPrintViewerModal
                orderId={showDossier && m ? m.id : null}
                onClose={() => setShowDossier(false)}
            />
        </WorkshopModalShell>
    );
}

export default MaintenanceDetailsModal;
