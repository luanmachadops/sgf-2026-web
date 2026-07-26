import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { SGFBadge, SGFButton, SGFCard, SGFInput } from '@/components/sgf';
import {
    AlertCircle,
    Calendar,
    Camera,
    Car,
    CheckCircle,
    Clock,
    Droplet,
    FileText,
    Fuel,
    Home,
    Info,
    LogOut,
    Receipt,
    RefreshCw,
    User,
    X,
} from '@/components/sgf/icons';
import {
    stationPortalApi,
    type StationAuthorization,
    type StationHistoryItem,
} from '@/lib/station-portal-api';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const PAGE_SIZE = 25;

type PortalTab = 'pending' | 'history' | 'details';

function isoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function tabFromPath(path: string): PortalTab {
    if (path.endsWith('/historico')) return 'history';
    if (path.endsWith('/dados')) return 'details';
    return 'pending';
}

function pathForTab(tab: PortalTab): string {
    if (tab === 'history') return '/posto/historico';
    if (tab === 'details') return '/posto/dados';
    return '/posto';
}

function safeDateTime(value: string | null): string {
    if (!value) return 'Sem prazo';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed);
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
    return (
        <SGFCard className="border border-red-100 text-center" padding="xl">
            <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
            <h2 className="mt-3 font-bold text-slate-900">Não foi possível carregar</h2>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{message}</p>
            <SGFButton className="mt-5" variant="outline" icon={RefreshCw} onClick={retry}>
                Tentar novamente
            </SGFButton>
        </SGFCard>
    );
}

function LoadingCards() {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-3xl bg-white shadow-sm" />
            ))}
        </div>
    );
}

function FuelingModal({
    authorization,
    tenantId,
    stationId,
    onClose,
}: {
    authorization: StationAuthorization;
    tenantId: string;
    stationId: string;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [liters, setLiters] = useState('');
    const [odometer, setOdometer] = useState('');
    const [receiptNo, setReceiptNo] = useState('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [error, setError] = useState('');

    const litersValue = Number(liters.replace(',', '.'));
    const odometerValue = Number(odometer);
    const estimatedTotal = Number.isFinite(litersValue) && authorization.pricePerLiter
        ? litersValue * authorization.pricePerLiter
        : 0;

    const mutation = useMutation({
        mutationFn: async () => {
            if (!Number.isFinite(litersValue) || litersValue <= 0) {
                throw new Error('Informe uma quantidade válida de litros.');
            }
            if (authorization.maxLiters != null && litersValue > authorization.maxLiters) {
                throw new Error(`O máximo autorizado é ${number.format(authorization.maxLiters)} L.`);
            }
            if (!Number.isInteger(odometerValue) || odometerValue <= 0) {
                throw new Error('Informe o hodômetro em quilômetros inteiros.');
            }
            if (!receiptNo.trim()) throw new Error('Informe o número do cupom.');
            if (!photo) throw new Error('Tire ou selecione a foto do bico da bomba.');

            return stationPortalApi.completeFueling({
                authorization,
                liters: litersValue,
                odometer: odometerValue,
                receiptNo,
                photo,
                tenantId,
                stationId,
            });
        },
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: ['station-pending'] });
            void queryClient.invalidateQueries({ queryKey: ['station-history'] });
            toast.success(`Abastecimento registrado: ${currency.format(result.totalCost)}.`);
            onClose();
        },
        onError: (reason) => setError(reason instanceof Error ? reason.message : 'Falha ao registrar abastecimento.'),
    });

    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !mutation.isPending) onClose();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [mutation.isPending, onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fueling-title"
                className="max-h-[95vh] w-full overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:max-w-xl sm:rounded-[2rem]"
            >
                <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-600">Autorização</p>
                        <h2 id="fueling-title" className="mt-1 text-xl font-bold text-slate-950">
                            Registrar {authorization.plate}
                        </h2>
                        <p className="text-sm text-slate-500">{authorization.brand} {authorization.model}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="Fechar"
                        disabled={mutation.isPending}
                        onClick={onClose}
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form
                    className="space-y-5 p-6"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setError('');
                        mutation.mutate();
                    }}
                >
                    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-amber-50 p-4">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Combustível</p>
                            <p className="mt-1 font-bold capitalize text-slate-900">{authorization.fuelType}</p>
                        </div>
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Limite</p>
                            <p className="mt-1 font-bold text-slate-900">
                                {authorization.maxLiters == null ? 'Sem teto' : `${number.format(authorization.maxLiters)} L`}
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="flex gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <SGFInput
                            label="Litros abastecidos"
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            step="0.01"
                            max={authorization.maxLiters ?? undefined}
                            value={liters}
                            onChange={(event) => setLiters(event.target.value)}
                            placeholder="0,00"
                            required
                            fullWidth
                        />
                        <SGFInput
                            label="Hodômetro (km)"
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            value={odometer}
                            onChange={(event) => setOdometer(event.target.value)}
                            placeholder="000000"
                            required
                            fullWidth
                        />
                    </div>

                    <SGFInput
                        label="Número do cupom"
                        value={receiptNo}
                        onChange={(event) => setReceiptNo(event.target.value)}
                        maxLength={100}
                        icon={Receipt}
                        placeholder="Número impresso no comprovante"
                        required
                        fullWidth
                    />

                    <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-800">Foto do bico da bomba</label>
                        <label className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition ${
                            photo ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/50'
                        }`}>
                            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                                photo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {photo ? <CheckCircle className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-800">
                                    {photo ? photo.name : 'Tirar ou selecionar foto'}
                                </span>
                                <span className="block text-xs text-slate-500">Imagem de até 10 MB</span>
                            </span>
                            <input
                                className="sr-only"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                                required
                            />
                        </label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-4 text-sm">
                            <span className="text-slate-500">Preço contratual</span>
                            <strong className="text-slate-900">
                                {authorization.pricePerLiter == null
                                    ? 'Não cadastrado'
                                    : `${currency.format(authorization.pricePerLiter)}/L`}
                            </strong>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                            <span className="font-semibold text-slate-600">Total calculado</span>
                            <strong className="text-xl text-slate-950">{currency.format(estimatedTotal)}</strong>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                            Preço e total são calculados pelo contrato no servidor e não podem ser alterados aqui.
                        </p>
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <SGFButton type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>
                            Cancelar
                        </SGFButton>
                        <SGFButton type="submit" loading={mutation.isPending} icon={Fuel}>
                            Confirmar abastecimento
                        </SGFButton>
                    </div>
                </form>
            </div>
        </div>
    );
}

function PendingAuthorizations({
    tenantId,
    stationId,
}: {
    tenantId: string;
    stationId: string;
}) {
    const [selected, setSelected] = useState<StationAuthorization | null>(null);
    const query = useQuery({
        queryKey: ['station-pending'],
        queryFn: stationPortalApi.getPending,
        refetchInterval: 30_000,
        staleTime: 10_000,
    });

    if (query.isLoading) return <LoadingCards />;
    if (query.error) {
        return <ErrorState message={(query.error as Error).message} retry={() => void query.refetch()} />;
    }
    const authorizations = query.data ?? [];

    return (
        <>
            {authorizations.length === 0 ? (
                <SGFCard className="border border-dashed border-slate-200 text-center" padding="xl">
                    <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
                    <h2 className="mt-4 text-lg font-bold text-slate-900">Tudo em dia</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Não há autorizações aguardando abastecimento neste posto.
                    </p>
                </SGFCard>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {authorizations.map((item) => (
                        <SGFCard key={item.fuelingId} className="border border-slate-100 shadow-sm" padding="lg">
                            <div className="flex items-start justify-between gap-3">
                                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                                    <Car className="h-6 w-6" />
                                </div>
                                <SGFBadge variant="warning" dot>Aguardando</SGFBadge>
                            </div>
                            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">{item.plate}</h2>
                            <p className="text-sm text-slate-500">{item.brand} {item.model}</p>

                            <dl className="mt-5 space-y-3 border-y border-slate-100 py-4 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="flex items-center gap-2 text-slate-500"><Droplet className="h-4 w-4" /> Combustível</dt>
                                    <dd className="font-semibold capitalize text-slate-800">{item.fuelType}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="flex items-center gap-2 text-slate-500"><Fuel className="h-4 w-4" /> Limite</dt>
                                    <dd className="font-semibold text-slate-800">
                                        {item.maxLiters == null ? 'Sem teto' : `${number.format(item.maxLiters)} L`}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="flex items-center gap-2 text-slate-500"><Clock className="h-4 w-4" /> Expira</dt>
                                    <dd className="text-right font-semibold text-slate-800">{safeDateTime(item.expiresAt)}</dd>
                                </div>
                            </dl>

                            {item.note && (
                                <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                    <strong>Observação:</strong> {item.note}
                                </p>
                            )}

                            <SGFButton
                                className="mt-5"
                                fullWidth
                                icon={Fuel}
                                disabled={item.pricePerLiter == null}
                                onClick={() => setSelected(item)}
                            >
                                {item.pricePerLiter == null ? 'Preço não cadastrado' : 'Registrar abastecimento'}
                            </SGFButton>
                        </SGFCard>
                    ))}
                </div>
            )}

            {selected && (
                <FuelingModal
                    authorization={selected}
                    tenantId={tenantId}
                    stationId={stationId}
                    onClose={() => setSelected(null)}
                />
            )}
        </>
    );
}

function historyStatus(item: StationHistoryItem): {
    label: string;
    variant: 'success' | 'warning' | 'error' | 'default';
} {
    if (item.workflowStatus === 'validado') return { label: 'Validado', variant: 'success' };
    if (item.workflowStatus === 'rejeitado_admin') return { label: 'Rejeitado', variant: 'error' };
    if (item.workflowStatus === 'concluido') return { label: 'Aguardando validação', variant: 'warning' };
    return { label: item.workflowStatus.replaceAll('_', ' '), variant: 'default' };
}

function StationHistory() {
    const today = useMemo(() => new Date(), []);
    const initialFrom = useMemo(() => {
        const value = new Date(today);
        value.setDate(value.getDate() - 30);
        return isoDate(value);
    }, [today]);
    const [from, setFrom] = useState(initialFrom);
    const [to, setTo] = useState(isoDate(today));
    const [page, setPage] = useState(0);

    const query = useQuery({
        queryKey: ['station-history', from, to, page],
        queryFn: () => stationPortalApi.getHistory({ from, to, page, pageSize: PAGE_SIZE }),
        placeholderData: (previous) => previous,
    });

    const items = query.data?.items ?? [];
    const total = query.data?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="space-y-4">
            <SGFCard className="border border-slate-100 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <SGFInput label="De" type="date" value={from} max={to} onChange={(event) => {
                        setFrom(event.target.value);
                        setPage(0);
                    }} fullWidth />
                    <SGFInput label="Até" type="date" value={to} min={from} max={isoDate(today)} onChange={(event) => {
                        setTo(event.target.value);
                        setPage(0);
                    }} fullWidth />
                    <SGFButton variant="outline" icon={RefreshCw} loading={query.isFetching} onClick={() => void query.refetch()}>
                        Atualizar
                    </SGFButton>
                </div>
            </SGFCard>

            {query.isLoading ? <LoadingCards /> : query.error ? (
                <ErrorState message={(query.error as Error).message} retry={() => void query.refetch()} />
            ) : items.length === 0 ? (
                <SGFCard className="border border-dashed border-slate-200 text-center" padding="xl">
                    <Clock className="mx-auto h-11 w-11 text-slate-300" />
                    <h2 className="mt-3 font-bold text-slate-900">Nenhum registro no período</h2>
                    <p className="mt-1 text-sm text-slate-500">Ajuste as datas para consultar outros abastecimentos.</p>
                </SGFCard>
            ) : (
                <>
                    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
                        <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr_1fr] gap-4 border-b border-slate-100 bg-slate-50 px-6 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
                            <span>Veículo</span><span>Data</span><span>Quantidade</span><span>Total</span><span>Situação</span>
                        </div>
                        {items.map((item) => {
                            const status = historyStatus(item);
                            return (
                                <div key={item.fuelingId} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr] lg:items-center lg:gap-4 lg:px-6">
                                    <div>
                                        <p className="font-black text-slate-900">{item.plate}</p>
                                        <p className="text-xs text-slate-500">{item.brand} {item.model} · <span className="capitalize">{item.fuelType}</span></p>
                                    </div>
                                    <div className="flex items-center justify-between text-sm lg:block">
                                        <span className="text-xs font-semibold text-slate-400 lg:hidden">Data</span>
                                        <span className="text-slate-700">{safeDateTime(item.filledAt)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm lg:block">
                                        <span className="text-xs font-semibold text-slate-400 lg:hidden">Quantidade</span>
                                        <span className="font-semibold text-slate-700">{number.format(item.liters)} L</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm lg:block">
                                        <span className="text-xs font-semibold text-slate-400 lg:hidden">Total</span>
                                        <span className="font-semibold text-slate-900">{currency.format(item.totalCost)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 lg:block">
                                        <span className="text-xs font-semibold text-slate-400 lg:hidden">Situação</span>
                                        <SGFBadge variant={status.variant}>{status.label}</SGFBadge>
                                    </div>
                                    {item.rejectionReason && (
                                        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 lg:col-span-5">
                                            <strong>Motivo:</strong> {item.rejectionReason}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <p className="text-xs text-slate-500">{total} registro{total === 1 ? '' : 's'} no período</p>
                        <div className="flex items-center gap-2">
                            <SGFButton variant="ghost" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => value - 1)}>
                                Anterior
                            </SGFButton>
                            <span className="text-xs font-semibold text-slate-500">{page + 1} / {pages}</span>
                            <SGFButton variant="ghost" size="sm" disabled={page + 1 >= pages || query.isFetching} onClick={() => setPage((value) => value + 1)}>
                                Próxima
                            </SGFButton>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function StationDetails({ stationId }: { stationId: string }) {
    const query = useQuery({
        queryKey: ['station-details', stationId],
        queryFn: () => stationPortalApi.getDetails(stationId),
    });

    if (query.isLoading) return <LoadingCards />;
    if (query.error || !query.data) {
        return <ErrorState message={(query.error as Error)?.message ?? 'Cadastro não encontrado.'} retry={() => void query.refetch()} />;
    }

    const station = query.data;
    const prices = station.fuelPrices && typeof station.fuelPrices === 'object' && !Array.isArray(station.fuelPrices)
        ? Object.entries(station.fuelPrices)
        : [];

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <SGFCard className="border border-slate-100 shadow-sm" padding="lg">
                <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                        <User className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Fornecedor</p>
                        <h2 className="font-bold text-slate-900">{station.name}</h2>
                    </div>
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                    {[
                        ['CNPJ', station.cnpj],
                        ['Telefone', station.phone],
                        ['Cidade', station.city],
                        ['Endereço', station.address],
                    ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
                            <dt className="text-slate-500">{label}</dt>
                            <dd className="text-right font-semibold text-slate-800">{value || '—'}</dd>
                        </div>
                    ))}
                </dl>
            </SGFCard>

            <SGFCard className="border border-slate-100 shadow-sm" padding="lg">
                <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                        <FileText className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Contrato</p>
                        <h2 className="font-bold text-slate-900">{station.contractNumber || 'Sem número informado'}</h2>
                    </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                        <dt className="text-xs text-slate-500">Início</dt>
                        <dd className="mt-1 font-bold text-slate-800">{station.contractStart ? date.format(new Date(`${station.contractStart}T12:00:00`)) : '—'}</dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                        <dt className="text-xs text-slate-500">Vencimento</dt>
                        <dd className="mt-1 font-bold text-slate-800">{station.contractEnd ? date.format(new Date(`${station.contractEnd}T12:00:00`)) : '—'}</dd>
                    </div>
                </dl>
            </SGFCard>

            <SGFCard className="border border-slate-100 shadow-sm lg:col-span-2" padding="lg">
                <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                        <Droplet className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Preços vigentes</p>
                        <h2 className="font-bold text-slate-900">Valores definidos no contrato</h2>
                    </div>
                </div>
                {prices.length === 0 ? (
                    <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
                        Nenhum preço foi cadastrado. Procure a prefeitura antes de abastecer.
                    </p>
                ) : (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {prices.map(([fuelType, value]) => (
                            <div key={fuelType} className="rounded-2xl border border-slate-100 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{fuelType}</p>
                                <p className="mt-1 text-xl font-black text-slate-900">
                                    {currency.format(Number(value))}<span className="text-xs font-medium text-slate-400"> / litro</span>
                                </p>
                            </div>
                        ))}
                    </div>
                )}
                <div className="mt-5 flex gap-2 rounded-2xl bg-blue-50 p-4 text-sm text-blue-700">
                    <Info className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>Alterações de preço são feitas pela prefeitura. O valor aplicado a cada abastecimento é calculado no servidor.</p>
                </div>
            </SGFCard>
        </div>
    );
}

export default function StationPortal() {
    const { user, logout } = useAuth();
    const { branding } = useBranding();
    const location = useLocation();
    const navigate = useNavigate();
    const activeTab = tabFromPath(location.pathname);

    const contextQuery = useQuery({
        queryKey: ['station-context', user?.id],
        queryFn: stationPortalApi.getContext,
        staleTime: 5 * 60_000,
    });
    const context = contextQuery.data;

    const tabs: { id: PortalTab; label: string; icon: typeof Home }[] = [
        { id: 'pending', label: 'Autorizações', icon: Home },
        { id: 'history', label: 'Histórico', icon: Clock },
        { id: 'details', label: 'Meus dados', icon: User },
    ];

    return (
        <div className="min-h-screen bg-[#F5F7F9]">
            <header className="border-b border-white/10 bg-[var(--sgf-dark)] text-white shadow-lg">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/10">
                            {branding.logoUrl || branding.sealUrl ? (
                                <img src={branding.logoUrl || branding.sealUrl} alt="" className="h-full w-full object-contain p-1" />
                            ) : (
                                <Fuel className="h-6 w-6 text-amber-400" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white/60">{branding.name}</p>
                            <h1 className="truncate text-base font-bold sm:text-lg">Sistema de Abastecimento</h1>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void logout()}
                        className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                    >
                        <LogOut className="h-5 w-5" />
                        <span className="hidden sm:inline">Sair</span>
                    </button>
                </div>
            </header>

            <div className="border-b border-slate-200 bg-white">
                <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 py-2 sm:px-6" aria-label="Navegação do posto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => navigate(pathForTab(tab.id))}
                                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                                    active
                                        ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
                                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
                <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">
                            {context?.stationName || 'Portal do posto'}
                        </p>
                        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                            {activeTab === 'pending' && 'Autorizações pendentes'}
                            {activeTab === 'history' && 'Histórico de abastecimentos'}
                            {activeTab === 'details' && 'Dados do fornecedor'}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {activeTab === 'pending' && 'Registre apenas abastecimentos previamente autorizados pela prefeitura.'}
                            {activeTab === 'history' && 'Acompanhe a validação dos lançamentos feitos por este posto.'}
                            {activeTab === 'details' && 'Consulte contrato, vencimento e preços vigentes.'}
                        </p>
                    </div>
                    {activeTab === 'pending' && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Atualização automática a cada 30 s
                        </div>
                    )}
                </div>

                {contextQuery.isLoading ? (
                    <LoadingCards />
                ) : contextQuery.error || !context ? (
                    <ErrorState
                        message={(contextQuery.error as Error)?.message ?? 'Vínculo do posto não encontrado.'}
                        retry={() => void contextQuery.refetch()}
                    />
                ) : activeTab === 'pending' ? (
                    <PendingAuthorizations tenantId={context.tenantId} stationId={context.stationId} />
                ) : activeTab === 'history' ? (
                    <StationHistory />
                ) : (
                    <StationDetails stationId={context.stationId} />
                )}
            </main>

            <footer className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-8 text-xs text-slate-400 sm:px-6">
                <span>SGF 2026 · {branding.name}</span>
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Portal do parceiro</span>
            </footer>
        </div>
    );
}
