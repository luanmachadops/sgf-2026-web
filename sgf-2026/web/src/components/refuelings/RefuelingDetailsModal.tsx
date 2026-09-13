import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import {
    Fuel,
    GasPump,
    Car,
    User,
    MapPin,
    AlertTriangle,
    Gauge,
    Building2,
    ShieldCheck,
    AlertCircle,
    Calendar,
    Printer,
    Upload,
    Sparkles,
} from '@/components/sgf/icons';
import { refuelingsApi } from '@/lib/supabase-api';
import { formatCurrency, formatDate, formatPlate, cn } from '@/lib/utils';
import { useValidateRefueling, useCancelFuelAuthorization } from '@/hooks/useRefuelings';

export type WorkflowStatus =
    | 'autorizado'
    | 'concluido'
    | 'rejeitado_motorista'
    | 'validado'
    | 'rejeitado_admin'
    | 'lancado_direto';

export interface RefuelingData {
    id: string;
    date?: string | null;
    created_at?: string | null;
    filled_at?: string | null;
    vehicle?: string;
    vehicleModel?: string;
    vehiclePhoto?: string | null;
    vehiclePlate?: string | null;
    vehicleTankCapacity?: number | null;
    vehicleExpectedConsumption?: number | null;
    vehicleDepartment?: string | null;
    driver?: string;
    driverPhoto?: string | null;
    driverCpf?: string | null;
    driverCnh?: string | null;
    station?: string;
    stationName?: string | null;
    stationCnpj?: string | null;
    stationCode?: string | null;
    liters: number;
    maxLiters?: number | null;
    fullTank?: boolean | null;
    cost: number;
    total_cost?: number | null;
    pricePerLiter: number;
    price_per_liter?: number | null;
    odometer: number;
    fuelType?: string | null;
    fuel_type?: string | null;
    consumption?: number | null;
    km_per_liter?: number | null;
    isValidated?: boolean;
    hasAnomaly?: boolean;
    has_anomaly?: boolean | null;
    anomalyType?: string | null;
    anomaly_type?: string | null;
    workflowStatus?: WorkflowStatus;
    workflow_status?: WorkflowStatus;
    photoRequisition?: string | null;
    photo_requisition_url?: string | null;
    photoDashboard?: string | null;
    photo_dashboard_url?: string | null;
    photoPump?: string | null;
    photo_pump_url?: string | null;
    photoReceipt?: string | null;
    photo_receipt_url?: string | null;
    receiptNumber?: string | null;
    pump_receipt_number?: string | null;
    notes?: string | null;
    authorization_note?: string | null;
    cancellation_reason?: string | null;
    vehicles?: {
        id?: string;
        plate?: string | null;
        brand?: string | null;
        model?: string | null;
        photo_url?: string | null;
        tank_capacity?: number | null;
        expected_km_per_liter?: number | null;
        department?: string | null;
        departments?: { id: string; name: string } | null;
    } | null;
    profiles?: {
        id?: string;
        full_name?: string | null;
        photo_url?: string | null;
        cpf?: string | null;
        phone?: string | null;
    } | null;
    drivers?: {
        id?: string;
        name?: string | null;
        photo_url?: string | null;
    } | null;
    station_relation?: {
        id: string;
        name: string;
        code: string | null;
        cnpj?: string | null;
    } | null;
    fuel_stations?: {
        id: string;
        name: string;
        code: string | null;
        cnpj?: string | null;
    } | null;
}

export interface RefuelingDetailsModalProps {
    refuelingId?: string | null;
    refueling?: RefuelingData | null;
    isOpen?: boolean;
    onClose: () => void;
    onUpdated?: () => void;
    allowActions?: boolean;
}

const FUEL_LABELS: Record<string, string> = {
    diesel: 'Diesel',
    diesel_s10: 'Diesel S10',
    diesel_s500: 'Diesel S500',
    gasolina: 'Gasolina Comum',
    gasolina_aditivada: 'Gasolina Aditivada',
    etanol: 'Etanol',
    flex: 'Flex',
    gnv: 'GNV',
    arla32: 'ARLA 32',
};

function getFuelBadge(rawFuel?: string | null) {
    if (!rawFuel) return { label: 'Combustível', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    const lower = rawFuel.toLowerCase().trim();
    const label = FUEL_LABELS[lower] ?? rawFuel;

    if (lower.includes('diesel')) {
        return { label, bg: 'bg-amber-50 text-amber-800 border-amber-200' };
    }
    if (lower.includes('gasolina')) {
        return { label, bg: 'bg-blue-50 text-blue-800 border-blue-200' };
    }
    if (lower.includes('etanol') || lower.includes('alcool')) {
        return { label, bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    }
    if (lower.includes('arla')) {
        return { label, bg: 'bg-cyan-50 text-cyan-800 border-cyan-200' };
    }
    return { label, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
}

function getWorkflowMeta(status?: WorkflowStatus | null): {
    label: string;
    variant: 'success' | 'warning' | 'error' | 'info' | 'default';
    description: string;
} {
    switch (status) {
        case 'autorizado':
            return {
                label: 'Autorizado',
                variant: 'info',
                description: 'Autorização emitida pelo gestor. Aguardando execução no posto.',
            };
        case 'concluido':
            return {
                label: 'Aguardando Validação',
                variant: 'warning',
                description: 'Abastecimento registrado pelo posto. Pendente de conferência pelo gestor.',
            };
        case 'validado':
            return {
                label: 'Validado',
                variant: 'success',
                description: 'Abastecimento conferido e homologado no fechamento contábil.',
            };
        case 'rejeitado_admin':
            return {
                label: 'Rejeitado pelo Gestor',
                variant: 'error',
                description: 'Lançamento reprovado na auditoria com justificativa administrativa.',
            };
        case 'rejeitado_motorista':
            return {
                label: 'Recusado pelo Motorista',
                variant: 'error',
                description: 'Motorista recusou a requisição ou divergência na bomba.',
            };
        case 'lancado_direto':
            return {
                label: 'Lançamento Direto',
                variant: 'default',
                description: 'Lançamento realizado manualmente em regime de contingência.',
            };
        default:
            return {
                label: 'Processado',
                variant: 'default',
                description: 'Registro do histórico de abastecimentos.',
            };
    }
}

export function RefuelingDetailsModal({
    refuelingId,
    refueling: propRefueling,
    isOpen: propIsOpen,
    onClose,
    onUpdated,
    allowActions = true,
}: RefuelingDetailsModalProps) {
    const [reviewReason, setReviewReason] = useState('');
    const [photoViewer, setPhotoViewer] = useState<{ images: string[]; index: number } | null>(null);

    const validateMutation = useValidateRefueling();
    const cancelAuthMutation = useCancelFuelAuthorization();

    // Se temos apenas o ID, busca os dados completos no backend
    const effectiveId = refuelingId ?? propRefueling?.id ?? null;
    const isFetchNeeded = Boolean(effectiveId && !propRefueling);

    const { data: fetchedData, isLoading } = useQuery({
        queryKey: ['refueling-detail', effectiveId],
        queryFn: () => refuelingsApi.getById(effectiveId!),
        enabled: isFetchNeeded && Boolean(effectiveId),
    });

    const activeRefueling = (propRefueling || fetchedData) as RefuelingData | undefined;
    const isModalOpen = propIsOpen !== undefined ? propIsOpen : Boolean(effectiveId || propRefueling);

    // Normalização dos campos para garantir visualização consistente
    const details = useMemo(() => {
        if (!activeRefueling) return null;

        const id = activeRefueling.id;
        const dateRaw = activeRefueling.date || activeRefueling.filled_at || activeRefueling.created_at;
        const liters = Number(activeRefueling.liters ?? 0);
        const totalCost = Number(activeRefueling.total_cost ?? activeRefueling.cost ?? 0);
        const pricePerLiter =
            liters > 0
                ? totalCost / liters
                : Number(activeRefueling.price_per_liter ?? activeRefueling.pricePerLiter ?? 0);

        const vehicleObj = activeRefueling.vehicles;
        const vehiclePlate = activeRefueling.vehiclePlate || activeRefueling.vehicle || vehicleObj?.plate || 'Sem placa';
        const vehicleModel =
            activeRefueling.vehicleModel ||
            (vehicleObj ? `${vehicleObj.brand || ''} ${vehicleObj.model || ''}`.trim() : '') ||
            'Veículo não especificado';
        const vehiclePhoto = activeRefueling.vehiclePhoto || vehicleObj?.photo_url || null;
        const vehicleDepartment =
            activeRefueling.vehicleDepartment ||
            vehicleObj?.departments?.name ||
            vehicleObj?.department ||
            'Setor de Garagem / Obras';
        const tankCapacity = activeRefueling.vehicleTankCapacity ?? vehicleObj?.tank_capacity ?? null;
        const expectedConsumption =
            activeRefueling.vehicleExpectedConsumption ?? vehicleObj?.expected_km_per_liter ?? null;

        const driverObj = activeRefueling.profiles || activeRefueling.drivers;
        const driverName =
            activeRefueling.driver ||
            activeRefueling.profiles?.full_name ||
            activeRefueling.drivers?.name ||
            'Motorista não informado';
        const driverPhoto = activeRefueling.driverPhoto || driverObj?.photo_url || null;
        const driverCpf = activeRefueling.driverCpf || activeRefueling.profiles?.cpf || null;

        const stationObj = activeRefueling.station_relation || activeRefueling.fuel_stations;
        const stationName =
            activeRefueling.stationName ||
            activeRefueling.station ||
            stationObj?.name ||
            'Posto Contratado Credenciado';
        const stationCnpj = activeRefueling.stationCnpj || stationObj?.cnpj || null;
        const stationCode = activeRefueling.stationCode || stationObj?.code || null;

        const odometer = Number(activeRefueling.odometer ?? 0);
        const consumption = activeRefueling.consumption ?? activeRefueling.km_per_liter ?? null;
        const rawStatus = (activeRefueling.workflowStatus || activeRefueling.workflow_status || 'lancado_direto') as WorkflowStatus;
        const hasAnomaly = Boolean(activeRefueling.hasAnomaly || activeRefueling.has_anomaly);
        const anomalyType = activeRefueling.anomalyType || activeRefueling.anomaly_type || null;

        const photoPump = activeRefueling.photoPump || activeRefueling.photo_pump_url || null;
        const photoDashboard = activeRefueling.photoDashboard || activeRefueling.photo_dashboard_url || null;
        const photoReceipt = activeRefueling.photoReceipt || activeRefueling.photo_receipt_url || null;
        const photoRequisition = activeRefueling.photoRequisition || activeRefueling.photo_requisition_url || null;
        const receiptNumber = activeRefueling.receiptNumber || activeRefueling.pump_receipt_number || null;

        const maxLiters = activeRefueling.maxLiters ?? null;
        const fullTank = activeRefueling.fullTank ?? null;
        const notes = activeRefueling.notes || activeRefueling.authorization_note || activeRefueling.cancellation_reason || null;

        return {
            id,
            date: dateRaw,
            liters,
            totalCost,
            pricePerLiter,
            vehiclePlate,
            vehicleModel,
            vehiclePhoto,
            vehicleDepartment,
            tankCapacity,
            expectedConsumption,
            driverName,
            driverPhoto,
            driverCpf,
            stationName,
            stationCnpj,
            stationCode,
            odometer,
            consumption,
            rawStatus,
            hasAnomaly,
            anomalyType,
            fuelType: activeRefueling.fuelType || activeRefueling.fuel_type || 'Diesel',
            photoPump,
            photoDashboard,
            photoReceipt,
            photoRequisition,
            receiptNumber,
            maxLiters,
            fullTank,
            notes,
        };
    }, [activeRefueling]);

    const handleCopyProtocol = () => {
        if (!details?.id) return;
        const shortId = details.id.slice(0, 8).toUpperCase();
        navigator.clipboard.writeText(`AB-${shortId}`);
        toast.success(`Protocolo AB-${shortId} copiado com sucesso!`);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleValidate = (approved: boolean) => {
        if (!details) return;
        if (!approved && !reviewReason.trim()) {
            toast.error('Informe a justificativa para rejeitar o abastecimento.');
            return;
        }
        if (approved && (!details.photoPump || !details.receiptNumber?.trim())) {
            toast.error('Evidências incompletas: foto do bico e cupom fiscal são obrigatórios.');
            return;
        }

        validateMutation.mutate(
            {
                id: details.id,
                approved,
                notes: reviewReason.trim() || undefined,
            },
            {
                onSuccess: () => {
                    toast.success(approved ? 'Abastecimento validado com sucesso!' : 'Abastecimento rejeitado.');
                    setReviewReason('');
                    onUpdated?.();
                    onClose();
                },
                onError: (err) => {
                    toast.error(`Erro ao processar validação: ${(err as Error).message}`);
                },
            }
        );
    };

    const handleCancelAuth = () => {
        if (!details) return;
        if (!reviewReason.trim()) {
            toast.error('Informe o motivo do cancelamento.');
            return;
        }

        cancelAuthMutation.mutate(
            {
                id: details.id,
                reason: reviewReason.trim(),
            },
            {
                onSuccess: () => {
                    toast.success('Autorização de abastecimento cancelada.');
                    setReviewReason('');
                    onUpdated?.();
                    onClose();
                },
                onError: (err) => {
                    toast.error(`Erro ao cancelar: ${(err as Error).message}`);
                },
            }
        );
    };

    if (!isModalOpen) return null;

    const shortProtocol = details?.id ? `AB-${details.id.slice(0, 8).toUpperCase()}` : 'AB-000000';
    const workflow = getWorkflowMeta(details?.rawStatus);
    const fuelBadge = getFuelBadge(details?.fuelType);

    // Galeria de evidências
    const galleryItems = [
        {
            key: 'pump',
            label: 'Bico da Bomba / Litragem',
            url: details?.photoPump,
            required: true,
            hint: 'Leitura visual do mostrador digital da bomba',
        },
        {
            key: 'dashboard',
            label: 'Painel / Hodômetro',
            url: details?.photoDashboard,
            required: false,
            hint: 'Quilometragem no instante do abastecimento',
        },
        {
            key: 'receipt',
            label: 'Cupom Fiscal / NFC-e',
            url: details?.photoReceipt,
            required: true,
            hint: details?.receiptNumber ? `Cupom nº ${details.receiptNumber}` : 'Comprovante impresso fiscal',
        },
        {
            key: 'requisition',
            label: 'Requisição / Ordem',
            url: details?.photoRequisition,
            required: false,
            hint: 'Autorização prévia assinada ou eletrônica',
        },
    ];

    const presentPhotos = galleryItems.filter((it): it is typeof it & { url: string } => Boolean(it.url));

    // Cálculos visuais de capacidade e eficiência
    const tankFillPercent =
        details?.tankCapacity && details.tankCapacity > 0
            ? Math.min(Math.round((details.liters / details.tankCapacity) * 100), 100)
            : null;

    const isPendingValidation = details?.rawStatus === 'concluido';
    const isPendingAuth = details?.rawStatus === 'autorizado';
    const isMissingMandatoryProofs =
        isPendingValidation && (!details?.photoPump || !details?.receiptNumber?.trim());

    return (
        <>
            <Modal
                isOpen={isModalOpen}
                onClose={onClose}
                size="xl"
                surfaceBg={true}
                showCloseButton={true}
            >
                {isLoading && !details ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                        <p className="mt-4 text-sm font-semibold text-slate-500">Carregando detalhes do abastecimento...</p>
                    </div>
                ) : !details ? (
                    <div className="py-16 text-center">
                        <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
                        <h3 className="mt-3 text-lg font-bold text-slate-800">Abastecimento não encontrado</h3>
                        <p className="mt-1 text-sm text-slate-500">O registro solicitado não foi localizado no banco de dados.</p>
                        <SGFButton variant="secondary" onClick={onClose} className="mt-5">
                            Fechar
                        </SGFButton>
                    </div>
                ) : (
                    <div className="space-y-6 pb-2">
                        {/* ─────────────────────────────────────────────────────────────
                            1. HEADER ELEVADO & STATUS LIFECYCLE
                           ───────────────────────────────────────────────────────────── */}
                        <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/60 to-emerald-50/30 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex items-start gap-3.5">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                                        <Fuel className="h-6 w-6" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs font-bold tracking-wider text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                                                {shortProtocol}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleCopyProtocol}
                                                className="text-[11px] font-semibold text-slate-400 hover:text-emerald-700 transition-colors"
                                                title="Copiar protocolo"
                                            >
                                                Copiar
                                            </button>
                                        </div>
                                        <h2 className="mt-1 text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                            <span>Detalhes do Abastecimento</span>
                                        </h2>
                                        <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                            <span className="font-medium">
                                                {details.date ? formatDate(details.date) : 'Data não informada'}
                                            </span>
                                            <span className="text-slate-300">•</span>
                                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                            <span className="font-semibold text-slate-700 truncate max-w-[280px]">
                                                {details.stationName}
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {details.hasAnomaly && (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200 animate-pulse">
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                            Anomalia Detectada
                                        </span>
                                    )}
                                    <SGFBadge variant={workflow.variant} className="!px-3.5 !py-1 !text-xs !font-bold !rounded-full">
                                        {workflow.label}
                                    </SGFBadge>
                                    <button
                                        type="button"
                                        onClick={handlePrint}
                                        className="rounded-full p-2 text-slate-400 hover:bg-white hover:text-slate-700 transition-all"
                                        title="Imprimir comprovante"
                                    >
                                        <Printer className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ─────────────────────────────────────────────────────────────
                            2. HERO CARDS (FINANÇAS, VOLUME & EFICIÊNCIA TELEMÉTRICA)
                           ───────────────────────────────────────────────────────────── */}
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Card Financeiro & Volume */}
                            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                        Resumo Financeiro & Combustível
                                    </span>
                                    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-bold border', fuelBadge.bg)}>
                                        {fuelBadge.label}
                                    </span>
                                </div>

                                <div className="mt-4 flex items-baseline justify-between border-b border-slate-100 pb-4">
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium">Valor Total Faturado</p>
                                        <p className="text-3xl font-black text-emerald-600 tracking-tight tabular-nums">
                                            {formatCurrency(details.totalCost)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-500 font-medium">Preço Unitário</p>
                                        <p className="text-base font-bold text-slate-800 tabular-nums">
                                            {formatCurrency(details.pricePerLiter)} <span className="text-xs font-normal text-slate-400">/ L</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 space-y-2.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                                            <GasPump className="h-4 w-4 text-emerald-600" />
                                            Volume Abastecido:
                                            <strong className="text-slate-900 text-sm font-black tabular-nums">
                                                {details.liters.toFixed(2)} Litros
                                            </strong>
                                        </span>
                                        <span className="text-slate-500 font-medium">
                                            {details.fullTank === true
                                                ? 'Tanque Cheio'
                                                : details.fullTank === false
                                                  ? 'Abastecimento Parcial'
                                                  : 'Registro Padrão'}
                                        </span>
                                    </div>

                                    {/* Barra de preenchimento do tanque se houver capacidade configurada */}
                                    {tankFillPercent !== null && (
                                        <div>
                                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                                <span>Carga no Tanque</span>
                                                <span>{tankFillPercent}% ({details.tankCapacity}L total)</span>
                                            </div>
                                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                                <div
                                                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                                    style={{ width: `${tankFillPercent}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Card de Eficiência & Telemetria */}
                            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                        Telemetria & Rendimento
                                    </span>
                                    <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                                        <Gauge className="h-3.5 w-3.5 text-slate-500" />
                                        <span>Odômetro Oficial</span>
                                    </div>
                                </div>

                                <div className="mt-4 flex items-baseline justify-between border-b border-slate-100 pb-4">
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium">Eficiência Calculada</p>
                                        <div className="flex items-baseline gap-2">
                                            <p
                                                className={cn(
                                                    'text-3xl font-black tracking-tight tabular-nums',
                                                    details.consumption && details.consumption > 8
                                                        ? 'text-emerald-600'
                                                        : details.consumption
                                                          ? 'text-amber-600'
                                                          : 'text-slate-400'
                                                )}
                                            >
                                                {details.consumption ? `${details.consumption.toFixed(1)}` : '—'}
                                            </p>
                                            <span className="text-sm font-bold text-slate-500">km/L</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-500 font-medium">Hodômetro Registrado</p>
                                        <p className="text-base font-black text-slate-800 tabular-nums">
                                            {details.odometer.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-400">km</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-2.5 border border-slate-100">
                                    <div className="flex items-center gap-2 text-xs">
                                        <Sparkles className="h-4 w-4 text-emerald-600" />
                                        <span className="text-slate-600 font-medium">
                                            {details.expectedConsumption
                                                ? `Consumo de referência: ${details.expectedConsumption.toFixed(1)} km/L`
                                                : 'Média de frota compatível'}
                                        </span>
                                    </div>
                                    <span
                                        className={cn(
                                            'text-xs font-bold px-2 py-0.5 rounded-full',
                                            details.consumption && details.consumption >= 8
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : 'bg-slate-200 text-slate-700'
                                        )}
                                    >
                                        {details.consumption && details.consumption >= 8 ? 'Dentro da Meta' : 'Em Análise'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ─────────────────────────────────────────────────────────────
                            3. IDENTIFICAÇÃO DOS ENVOLVIDOS (VEÍCULO, MOTORISTA E POSTO)
                           ───────────────────────────────────────────────────────────── */}
                        <div className="grid gap-4 md:grid-cols-3">
                            {/* Card do Veículo */}
                            <div className="rounded-3xl border border-slate-200/80 bg-white p-4.5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Veículo Vinculado
                                    </span>
                                    <Car className="h-4 w-4 text-slate-400" />
                                </div>
                                <div className="flex items-center gap-3">
                                    {details.vehiclePhoto ? (
                                        <img
                                            src={details.vehiclePhoto}
                                            alt={details.vehicleModel}
                                            className="h-12 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200"
                                        />
                                    ) : (
                                        <div className="flex h-12 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                                            <Car className="h-6 w-6 text-slate-400" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-900 truncate text-sm">{details.vehicleModel}</p>
                                        <div className="mt-1 flex items-center gap-1.5">
                                            <span className="font-mono text-xs font-black bg-slate-900 text-white px-2 py-0.5 rounded-md tracking-wider">
                                                {formatPlate(details.vehiclePlate)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-medium truncate">
                                    <Building2 className="inline h-3.5 w-3.5 text-slate-400 mr-1" />
                                    {details.vehicleDepartment}
                                </div>
                            </div>

                            {/* Card do Motorista */}
                            <div className="rounded-3xl border border-slate-200/80 bg-white p-4.5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Condutor Responsável
                                    </span>
                                    <User className="h-4 w-4 text-slate-400" />
                                </div>
                                <div className="flex items-center gap-3">
                                    {details.driverPhoto ? (
                                        <img
                                            src={details.driverPhoto}
                                            alt={details.driverName}
                                            className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-emerald-500/20"
                                        />
                                    ) : (
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold text-sm">
                                            {details.driverName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-900 truncate text-sm">{details.driverName}</p>
                                        <p className="text-xs text-slate-400 font-medium">
                                            {details.driverCpf ? `CPF: ${details.driverCpf}` : 'Motorista credenciado'}
                                        </p>
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                                    <span>Vínculo Operacional</span>
                                    <span className="text-emerald-700 font-semibold">Ativo na Viagem</span>
                                </div>
                            </div>

                            {/* Card do Posto / Fornecedor */}
                            <div className="rounded-3xl border border-slate-200/80 bg-white p-4.5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Estabelecimento
                                    </span>
                                    <Building2 className="h-4 w-4 text-slate-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900 truncate text-sm">{details.stationName}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {details.stationCnpj ? `CNPJ: ${details.stationCnpj}` : 'Posto credenciado'}
                                    </p>
                                </div>
                                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                                    <span>NFC-e / Cupom:</span>
                                    <span
                                        className={cn(
                                            'font-mono font-bold px-1.5 py-0.5 rounded',
                                            details.receiptNumber
                                                ? 'bg-slate-100 text-slate-800'
                                                : 'bg-rose-50 text-rose-700'
                                        )}
                                    >
                                        {details.receiptNumber || 'Não informado'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ─────────────────────────────────────────────────────────────
                            4. GALERIA DE EVIDÊNCIAS FOTOGRÁFICAS (AUDITORIA VISUAL)
                           ───────────────────────────────────────────────────────────── */}
                        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <span>Comprovantes e Evidências Fotográficas</span>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                            {presentPhotos.length} de {galleryItems.length} anexadas
                                        </span>
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Clique em qualquer imagem para inspecionar em alta resolução.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {galleryItems.map((item) => {
                                    const photoIndexInPresent = presentPhotos.findIndex((p) => p.key === item.key);

                                    if (item.url) {
                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() =>
                                                    setPhotoViewer({
                                                        images: presentPhotos.map((p) => p.url),
                                                        index: photoIndexInPresent >= 0 ? photoIndexInPresent : 0,
                                                    })
                                                }
                                                className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/5 transition-all hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            >
                                                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                                                    <img
                                                        src={item.url}
                                                        alt={item.label}
                                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />
                                                    <span className="absolute bottom-2 left-2.5 right-2.5 text-left text-[11px] font-bold text-white leading-tight">
                                                        {item.label}
                                                    </span>
                                                </div>
                                                <div className="p-2 text-[10px] text-slate-500 font-medium bg-white text-left truncate">
                                                    {item.hint}
                                                </div>
                                            </button>
                                        );
                                    }

                                    return (
                                        <div
                                            key={item.key}
                                            className={cn(
                                                'flex flex-col justify-center items-center aspect-[4/3] rounded-2xl border border-dashed p-3 text-center transition-colors',
                                                item.required
                                                    ? 'border-amber-300 bg-amber-50/40 text-amber-900'
                                                    : 'border-slate-200 bg-slate-50 text-slate-400'
                                            )}
                                        >
                                            <Upload className="h-5 w-5 text-slate-400 mb-1" />
                                            <span className="text-xs font-bold">{item.label}</span>
                                            <span className="text-[10px] text-slate-400 mt-0.5">
                                                {item.required ? 'Obrigatória para validação' : 'Não anexada'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ─────────────────────────────────────────────────────────────
                            5. DIAGNÓSTICO ANTIFRAUDE / ALERTAS DE ANOMALIA
                           ───────────────────────────────────────────────────────────── */}
                        {details.hasAnomaly && (
                            <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-4.5">
                                <div className="flex items-start gap-3">
                                    <div className="rounded-2xl bg-amber-500 p-2 text-white shrink-0">
                                        <AlertTriangle className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-black text-amber-950">
                                            Alerta de Auditoria Antifraude Detectado
                                        </h4>
                                        <p className="mt-1 text-xs font-medium text-amber-900/90 leading-relaxed">
                                            Este registro foi assinalado pelo motor de consistência do sistema. Motivos comuns
                                            incluem variação brusca de km/L, odômetro inconsistente ou volume divergente da
                                            capacidade máxima do tanque. Realize a verificação detalhada das fotos anexadas antes da
                                            aprovação.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Observações / Notas anteriores (se houver) */}
                        {details.notes && (
                            <div className="rounded-3xl border border-slate-200 bg-white p-4.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                    Observações Registradas
                                </p>
                                <p className="text-xs text-slate-700 leading-relaxed font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    {details.notes}
                                </p>
                            </div>
                        )}

                        {/* ─────────────────────────────────────────────────────────────
                            6. PAINEL DE AÇÃO DO GESTOR (VALIDAÇÃO / REJEIÇÃO / CANCELAMENTO)
                           ───────────────────────────────────────────────────────────── */}
                        {allowActions && (isPendingValidation || isPendingAuth) && (
                            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                        {isPendingValidation ? 'Parecer da Gestão de Frotas' : 'Controle da Autorização'}
                                    </span>
                                    <span className="text-[11px] text-slate-400 font-medium">
                                        {isPendingValidation
                                            ? 'Homologação para fechamento contábil'
                                            : 'Cancelamento antes do envio'}
                                    </span>
                                </div>

                                <SGFTextarea
                                    label={isPendingAuth ? 'Motivo do cancelamento' : 'Parecer / Justificativa'}
                                    value={reviewReason}
                                    onChange={(e) => setReviewReason(e.target.value)}
                                    placeholder={
                                        isPendingAuth
                                            ? 'Informe o motivo detalhado do cancelamento da autorização...'
                                            : 'Opcional para aprovação; obrigatório caso deseje rejeitar o abastecimento...'
                                    }
                                    rows={2}
                                    fullWidth
                                    className="!rounded-2xl"
                                />

                                {isMissingMandatoryProofs && (
                                    <div className="flex items-center gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 border border-amber-200 text-amber-900 text-xs font-medium">
                                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                                        <span>
                                            <strong>Aprovação bloqueada:</strong> É obrigatório que o posto envie a foto do bico da bomba e o número do cupom fiscal. Rejeite se houver irregularidade.
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ─────────────────────────────────────────────────────────────
                    7. FOOTER INTEGRADO & AÇÕES FINAIS
                   ───────────────────────────────────────────────────────────── */}
                <div className="flex w-full flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                        {allowActions && isPendingAuth && (
                            <SGFButton
                                variant="ghost"
                                className="!text-rose-600 hover:!bg-rose-50 !rounded-full text-xs font-bold"
                                onClick={handleCancelAuth}
                                loading={cancelAuthMutation.isPending}
                                disabled={!reviewReason.trim()}
                            >
                                Cancelar Autorização
                            </SGFButton>
                        )}

                        {allowActions && isPendingValidation && (
                            <>
                                <SGFButton
                                    variant="ghost"
                                    className="!text-rose-600 hover:!bg-rose-50 !rounded-full text-xs font-bold"
                                    onClick={() => handleValidate(false)}
                                    loading={validateMutation.isPending}
                                    disabled={!reviewReason.trim()}
                                >
                                    Rejeitar Lançamento
                                </SGFButton>
                                <SGFButton
                                    variant="primary"
                                    className="!rounded-full text-xs font-bold"
                                    onClick={() => handleValidate(true)}
                                    loading={validateMutation.isPending}
                                    disabled={isMissingMandatoryProofs}
                                >
                                    Validar Abastecimento
                                </SGFButton>
                            </>
                        )}
                    </div>

                    <SGFButton variant="secondary" onClick={onClose} className="!rounded-full text-xs font-semibold">
                        Fechar
                    </SGFButton>
                </div>
            </Modal>

            {/* Visualizador fullscreen de fotos */}
            <PhotoViewer
                images={photoViewer?.images}
                startIndex={photoViewer?.index ?? 0}
                onClose={() => setPhotoViewer(null)}
            />
        </>
    );
}

export default RefuelingDetailsModal;
