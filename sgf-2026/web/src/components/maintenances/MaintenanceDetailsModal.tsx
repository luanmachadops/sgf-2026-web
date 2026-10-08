import { useMemo, useState } from 'react';
import { EntityAvatar } from '@/components/sgf/EntityAvatar';
import { maintenanceManagerNextAction } from '@/lib/maintenance-status';
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
    Gauge,
    Printer,
    ShieldCheck,
    User,
    X,
} from '@/components/sgf/icons';
import { maintenancesApi } from '@/lib/supabase-api';
import { useAuthorizeMaintenance, useCancelMaintenance } from '@/hooks/useMaintenances';
import { useRepairShops } from '@/hooks/useRepairShops';
import { ServiceOrderFiscalPanel } from './ServiceOrderFiscalPanel';
import { DossierPrintViewerModal } from './DossierPrintViewerModal';
import { WorkshopModalShell } from '@/components/partners/workshop/WorkshopModalShell';
import { formatDate, getPriorityStyles, NO_DRIVER_LABEL } from '@/lib/utils';
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
            media={m?.vehicles ? <VehicleHeaderPhoto url={m.vehicles.photo_url} /> : undefined}
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
                <div className="space-y-5">
                    {/* Próxima etapa: o que precisa acontecer agora */}
                    {(() => {
                        const next = maintenanceManagerNextAction(op, fin);
                        const mine = ['pending', 'authorized', 'ready'].includes(op)
                            || (op === 'awaiting_quote_approval' && ['not_started', 'awaiting_commitment'].includes(fin))
                            || (op === 'received' && ['invoiced', 'attested'].includes(fin));
                        return (
                            <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                                op === 'cancelled' ? 'border-red-200 bg-red-50/60'
                                    : mine ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50/70'
                            }`}>
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-slate-500">{mine ? 'Próxima etapa · sua ação' : 'Próxima etapa'}</p>
                                    <p className={`text-base font-bold ${op === 'cancelled' ? 'text-red-700' : mine ? 'text-amber-800' : 'text-slate-800'}`}>{next}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <SGFBadge variant={op === 'cancelled' ? 'error' : op === 'received' ? 'success' : 'info'}>{OP_LABEL[op]}</SGFBadge>
                                    <SGFBadge variant={fin === 'paid' ? 'success' : fin === 'not_started' ? 'default' : 'warning'}>{FIN_LABEL[fin]}</SGFBadge>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Etapas do processo */}
                    {op !== 'cancelled' && (() => {
                        const steps = ['Solicitação', 'Na oficina', 'Em conserto', 'Concluída', 'Pago'];
                        const current = op === 'pending' ? 0
                            : ['authorized', 'at_shop', 'awaiting_quote_approval'].includes(op) ? 1
                            : ['in_progress', 'ready'].includes(op) ? 2
                            : fin === 'paid' ? 4 : 3;
                        return (
                            <ol className="flex items-center gap-1.5">
                                {steps.map((label, i) => (
                                    <li key={label} className="flex min-w-0 flex-1 flex-col gap-1.5">
                                        <span className={`h-1.5 rounded-full ${i < current ? 'bg-[var(--sgf-primary)]' : i === current ? 'bg-[var(--sgf-accent)]' : 'bg-slate-200'}`} />
                                        <span className={`truncate text-[11px] ${i === current ? 'font-bold text-slate-800' : i < current ? 'font-medium text-slate-600' : 'text-slate-400'}`}>{label}</span>
                                    </li>
                                ))}
                            </ol>
                        );
                    })()}

                    {/* Dados da OS num card só */}
                    <div className="rounded-2xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-100 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-slate-500">
                                        {ORIGIN_LABEL[m.origin] ?? 'Ordem de serviço'} · OS {m.id.slice(0, 8).toUpperCase()}
                                    </p>
                                    <p className="text-base font-bold text-slate-900">{m.category ?? 'Sem categoria'}</p>
                                </div>
                                {(() => {
                                    const pStyle = getPriorityStyles(m.priority);
                                    return (
                                        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${pStyle.bg} ${pStyle.border} ${pStyle.text}`}>
                                            Prioridade {(PRIORITY_LABEL[m.priority] ?? m.priority).toLowerCase()}
                                        </span>
                                    );
                                })()}
                            </div>
                            {m.description && (
                                <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{m.description}</p>
                            )}
                        </div>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
                            <div className="flex items-center gap-3">
                                <EntityAvatar url={shopPhotoUrl} icon={Building2} alt="Oficina" square size="sm" />
                                <div className="min-w-0">
                                    <dt className="text-xs text-slate-500">Oficina</dt>
                                    <dd className="truncate font-semibold text-slate-800">{m.repair_shops?.name ?? m.repair_shop ?? 'A definir na análise'}</dd>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <EntityAvatar url={m.profiles?.photo_url} icon={User} alt="Motorista" size="sm" />
                                <div className="min-w-0">
                                    <dt className="text-xs text-slate-500">Motorista</dt>
                                    <dd className={`truncate font-semibold ${m.profiles?.full_name ? 'text-slate-800' : 'italic text-slate-400'}`}>{m.profiles?.full_name ?? NO_DRIVER_LABEL}</dd>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"><Gauge className="h-4 w-4" /></span>
                                <div className="min-w-0">
                                    <dt className="text-xs text-slate-500">Hodômetro na abertura</dt>
                                    <dd className="font-semibold text-slate-800">{m.odometer ? `${Number(m.odometer).toLocaleString('pt-BR')} km` : 'Não informado'}</dd>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"><Calendar className="h-4 w-4" /></span>
                                <div className="min-w-0">
                                    <dt className="text-xs text-slate-500">Em aberto há</dt>
                                    <dd className="font-semibold text-slate-800">
                                        {openSinceLabel(m.created_at)}
                                    </dd>
                                </div>
                            </div>
                        </dl>
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

/** Foto do veículo no cabeçalho da OS; sem foto, ícone do carro. */
function VehicleHeaderPhoto({ url }: { url?: string | null }) {
    const [failed, setFailed] = useState(false);
    if (!url || failed) {
        return (
            <div className="grid h-16 w-20 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                <Car className="h-7 w-7" />
            </div>
        );
    }
    return <img src={url} alt="Veículo" onError={() => setFailed(true)} className="h-16 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200" />;
}

/** "Aberta hoje" / "12 dias" desde a abertura da OS. */
function openSinceLabel(iso: string): string {
    const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
    return d === 0 ? 'Aberta hoje' : `${d} dia${d > 1 ? 's' : ''}`;
}
