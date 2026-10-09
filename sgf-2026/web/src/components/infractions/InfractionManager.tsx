import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { DriverCell } from '@/components/sgf/EntityCells';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { WorkshopModalShell } from '@/components/partners/workshop/WorkshopModalShell';
import { LocationPicker } from '@/components/sgf/LocationPicker';
import { AlertTriangle, DollarSign, Car, MapPin, Calendar, CheckCircle, Route, FileText, X, Eye } from '@/components/sgf/icons';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { infractionsApi, driversApi, type InfractionCandidate } from '@/lib/supabase-api';
import { formatCurrency, formatDriverLabel, formatCPF, matchesSearch } from '@/lib/utils';
import { useSyncOnChange } from '@/hooks/useSyncOnChange';
import { STATUS_META, fmtDateTime, fmtDateTimeLong, type InfractionRow } from '@/lib/infractionFormat';
import { generateFiciPdf } from '@/lib/ficiPdf';

/** Dias até a data (negativo = já passou). */
function daysUntil(date: string): number {
    const [y, m, d] = date.slice(0, 10).split('-').map(Number);
    const target = new Date(y, m - 1, d).getTime();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((target - today.getTime()) / 86_400_000);
}

function fmtDateOnly(date: string): string {
    const [y, m, d] = date.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
}

const INFRACTION_STEPS = ['Registrada', 'Condutor indicado', 'Aprovada'];

function infractionNextStep(status: string, hasDriver: boolean): { text: string; mine: boolean } {
    if (status === 'rejeitada') return { text: 'Infração rejeitada', mine: false };
    if (status === 'aprovada' || status === 'paga') return { text: 'Indicação aprovada', mine: false };
    if (status === 'indicada') return { text: 'Conferir e aprovar a indicação do condutor', mine: true };
    return { text: hasDriver ? 'Confirmar o condutor sugerido' : 'Indicar o condutor responsável', mine: true };
}

export function ManageInfractionModal({ infraction, onClose, layout = 'modal' }: {
    infraction: InfractionRow | null;
    onClose: () => void;
    /** 'page': mesma gestão dentro da página de detalhes (sem fechar ao salvar). */
    layout?: 'modal' | 'page';
}) {
    // No modal, salvar fecha; na página, fica onde está.
    const done = layout === 'page' ? () => undefined : onClose;
    const [notifiedAt, setNotifiedAt] = useState('');
    const [generatingFici, setGeneratingFici] = useState(false);
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [driverId, setDriverId] = useState('');
    const [tripId, setTripId] = useState<string | null>(null);
    const [confirmReject, setConfirmReject] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [locationText, setLocationText] = useState('');
    const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
    const [tripQuery, setTripQuery] = useState('');
    const [confirmAction, setConfirmAction] = useState<'indicate' | 'approve' | null>(null);
    const { branding } = useBranding();

    const { data: candidates = [] } = useQuery({
        queryKey: ['infraction-candidates', infraction?.id],
        queryFn: () => infractionsApi.findCandidates(infraction!.vehicle_id!, infraction!.occurred_at),
        enabled: Boolean(infraction?.vehicle_id && infraction?.occurred_at),
    });

    const { data: drivers = [] } = useQuery({
        queryKey: ['drivers', 'all-for-infraction'],
        queryFn: () => driversApi.getAll(),
        enabled: Boolean(infraction),
    });

    useSyncOnChange(infraction, () => {
        if (infraction) {
            setDriverId(infraction.indicated_driver_id ?? infraction.suggested_driver_id ?? '');
            setTripId(infraction.indicated_trip_id ?? null);
            setConfirmReject(false);
            setConfirmRemove(false);
            setLocationText(infraction.location ?? '');
            setPin(infraction.lat != null && infraction.lng != null ? { lat: infraction.lat, lng: infraction.lng } : null);
            setTripQuery('');
            setConfirmAction(null);
            setNotifiedAt(infraction.notified_at ?? '');
        }
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['infractions'] });

    const indicateMutation = useMutation({
        mutationFn: () => infractionsApi.indicate(infraction!.id, driverId, tripId),
        onSuccess: () => { invalidate(); toast.success('Condutor indicado com sucesso.'); setConfirmAction(null); done(); },
        onError: () => toast.error('Erro ao indicar condutor.'),
    });

    const approveMutation = useMutation({
        mutationFn: async () => {
            if (driverId && driverId !== infraction!.indicated_driver_id) {
                await infractionsApi.indicate(infraction!.id, driverId, tripId);
            }
            return infractionsApi.approve(infraction!.id, user!.id);
        },
        onSuccess: () => { invalidate(); toast.success('Indicação aprovada.'); setConfirmAction(null); done(); },
        onError: () => toast.error('Erro ao aprovar.'),
    });

    const { data: recentTrips = [] } = useQuery({
        queryKey: ['infraction-trip-search'],
        queryFn: () => infractionsApi.recentTripsForSearch(),
        enabled: Boolean(infraction) && tripQuery.trim().length > 0,
        staleTime: 60_000,
    });

    const locationMutation = useMutation({
        mutationFn: () => infractionsApi.updateLocation(infraction!.id, locationText, pin?.lat ?? null, pin?.lng ?? null),
        onSuccess: () => { invalidate(); toast.success('Local da infração salvo.'); },
        onError: () => toast.error('Erro ao salvar o local.'),
    });

    const notifiedMutation = useMutation({
        mutationFn: () => infractionsApi.updateNotifiedAt(infraction!.id, notifiedAt || null),
        onSuccess: () => { invalidate(); toast.success('Data da notificação salva.'); },
        onError: () => toast.error('Erro ao salvar a data da notificação.'),
    });

    const { data: vehicleDocs } = useQuery({
        queryKey: ['infraction-vehicle-docs', infraction?.vehicle_id],
        queryFn: () => infractionsApi.vehicleRegistration(infraction!.vehicle_id!),
        enabled: Boolean(infraction?.vehicle_id),
    });

    const removeMutation = useMutation({
        mutationFn: () => infractionsApi.removeIndication(infraction!.id),
        onSuccess: () => { invalidate(); toast.success('Indicação removida. A infração voltou para pendente.'); setConfirmRemove(false); done(); },
        onError: () => toast.error('Erro ao remover a indicação.'),
    });

    const rejectMutation = useMutation({
        mutationFn: () => infractionsApi.reject(infraction!.id, 'Rejeitada pelo gestor'),
        onSuccess: () => { invalidate(); toast.success('Infração rejeitada.'); setConfirmReject(false); done(); },
        onError: () => toast.error('Erro ao rejeitar.'),
    });

    if (!infraction) return null;
    const meta = STATUS_META[infraction.status] ?? STATUS_META.pendente;
    const closed = ['aprovada', 'rejeitada', 'paga'].includes(infraction.status);
    const driverOptions = drivers.map((d) => ({
        value: d.id,
        label: formatDriverLabel(d),
        photoUrl: d.photo_url,
        description: [d.cpf ? `CPF ${formatCPF(d.cpf)}` : null, d.cnh_number ? `CNH ${d.cnh_number}` : null].filter(Boolean).join(' · ') || undefined,
        keywords: [d.cpf, d.cnh_number, (d as { registration_number?: string | null }).registration_number, (d as { email?: string | null }).email].filter(Boolean).join(' '),
    }));
    const selectedDriverObj = drivers.find((d) => d.id === driverId);
    const next = infractionNextStep(infraction.status, Boolean(driverId));
    const stepIndex = infraction.status === 'aprovada' || infraction.status === 'paga' ? 2 : infraction.status === 'indicada' ? 1 : 0;

    const rawData = infraction.raw as { attachment_url?: string; attachment_name?: string } | null;
    const attachmentUrl = rawData?.attachment_url;
    const attachmentName = rawData?.attachment_name;

    const plate = infraction.plate ? infraction.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : null;
    const vehicleName = [infraction.vehicles?.brand, infraction.vehicles?.model].filter(Boolean).join(' ');
    const busy = indicateMutation.isPending || approveMutation.isPending || rejectMutation.isPending || removeMutation.isPending;
    const hasIndication = Boolean(infraction.indicated_driver_id) && infraction.status !== 'rejeitada';

    const generateFici = async () => {
        const target = driverId || infraction.indicated_driver_id;
        if (!target) { toast.error('Escolha o condutor antes de gerar o FICI.'); return; }
        setGeneratingFici(true);
        try {
            const { blob, filename } = await generateFiciPdf({ infractionId: infraction.id, driverId: target });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (e) {
            toast.error((e as Error).message || 'Não foi possível gerar o FICI.');
        } finally {
            setGeneratingFici(false);
        }
    };

    const actions = (
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {layout === 'modal' && <SGFButton variant="ghost" onClick={onClose}>Fechar</SGFButton>}
            {!closed && (
                <>
                    <SGFButton variant="outline" onClick={() => setConfirmAction('indicate')} loading={indicateMutation.isPending} disabled={!driverId || busy}>
                        Salvar indicação
                    </SGFButton>
                    <SGFButton icon={CheckCircle} onClick={() => setConfirmAction('approve')} loading={approveMutation.isPending} disabled={!driverId || busy}>
                        Aprovar indicação
                    </SGFButton>
                </>
            )}
        </div>
    );

    const title = [plate, vehicleName].filter(Boolean).join(' · ') || 'Veículo não identificado';
    const subtitle = [infraction.ait ? `AIT ${infraction.ait}` : null, fmtDateTime(infraction.occurred_at)].filter(Boolean).join(' · ');

    const body = (
            <div className="space-y-5">
                {/* Próxima etapa */}
                <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    infraction.status === 'rejeitada' ? 'border-red-200 bg-red-50/60'
                        : next.mine ? 'border-amber-200 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/60'
                }`}>
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">{next.mine ? 'Próxima etapa · sua ação' : 'Situação'}</p>
                        <p className={`text-base font-bold ${infraction.status === 'rejeitada' ? 'text-red-700' : next.mine ? 'text-amber-800' : 'text-emerald-800'}`}>{next.text}</p>
                    </div>
                    <SGFBadge variant={meta.variant}>{meta.label}</SGFBadge>
                </div>

                {infraction.status !== 'rejeitada' && (
                    <ol className="flex items-center gap-1.5">
                        {INFRACTION_STEPS.map((label, i) => (
                            <li key={label} className="flex min-w-0 flex-1 flex-col gap-1.5">
                                <span className={`h-1.5 rounded-full ${i < stepIndex ? 'bg-[var(--sgf-primary)]' : i === stepIndex ? 'bg-[var(--sgf-accent)]' : 'bg-slate-200'}`} />
                                <span className={`truncate text-[11px] ${i === stepIndex ? 'font-bold text-slate-800' : i < stepIndex ? 'font-medium text-slate-600' : 'text-slate-400'}`}>{label}</span>
                            </li>
                        ))}
                    </ol>
                )}

                {/* Prazo de indicação ao órgão autuador */}
                {(() => {
                    const deadline = infraction.indication_deadline;
                    const days = deadline ? daysUntil(deadline) : null;
                    const urgent = days != null && days <= 3 && !closed;
                    const late = days != null && days < 0 && !closed;
                    return (
                        <div className={`rounded-2xl border p-4 ${late ? 'border-red-200 bg-red-50/60' : urgent ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-base font-bold text-slate-900">Prazo de indicação</p>
                                    <p className="text-xs text-slate-500">30 dias a partir da notificação de autuação recebida pela prefeitura.</p>
                                </div>
                                {deadline && (
                                    <div className="text-right">
                                        <p className={`text-lg font-black ${late ? 'text-red-700' : urgent ? 'text-amber-700' : 'text-slate-900'}`}>
                                            {closed ? 'Concluído' : late ? `Vencido há ${Math.abs(days!)} dia${Math.abs(days!) === 1 ? '' : 's'}` : days === 0 ? 'Vence hoje' : `${days} dia${days === 1 ? '' : 's'}`}
                                        </p>
                                        <p className="text-xs text-slate-500">até {fmtDateOnly(deadline)}</p>
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 flex flex-wrap items-end gap-2">
                                <div className="w-48">
                                    <SGFInput label="Data da notificação" type="date" value={notifiedAt} onChange={(e) => setNotifiedAt(e.target.value)} fullWidth />
                                </div>
                                {notifiedAt !== (infraction.notified_at ?? '') && (
                                    <SGFButton size="sm" loading={notifiedMutation.isPending} onClick={() => notifiedMutation.mutate()}>Salvar data</SGFButton>
                                )}
                                {!deadline && notifiedAt === (infraction.notified_at ?? '') && (
                                    <p className="pb-2 text-xs text-amber-700">Informe a data em que a notificação chegou para controlar o prazo.</p>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* Dados da multa */}
                <div className="rounded-2xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 p-4">
                        <p className="text-xs font-medium text-slate-500">{infraction.code ? `Código ${infraction.code}` : 'Infração'}</p>
                        <p className="text-base font-bold text-slate-900">{infraction.description || 'Infração de trânsito'}</p>
                    </div>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-[1.4fr_1fr_1fr]">
                        <InfoItem icon={Calendar} label="Data e hora" value={fmtDateTimeLong(infraction.occurred_at)} nowrap />
                        <InfoItem icon={DollarSign} label="Valor" value={formatCurrency(Number(infraction.amount ?? 0))} strong nowrap />
                        <InfoItem icon={AlertTriangle} label="Pontos na CNH" value={infraction.points != null ? `${infraction.points} pts` : '—'} nowrap />
                    </dl>
                    {attachmentUrl && (
                        <div className="flex items-center gap-3 border-t border-slate-100 p-4">
                            <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs text-slate-500">Auto de infração</p>
                                <p className="truncate text-sm font-semibold text-slate-800">{attachmentName || 'Documento da multa'}</p>
                            </div>
                            <a href={attachmentUrl} target="_blank" rel="noopener noreferrer"
                                className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[var(--sgf-primary)] hover:text-[var(--sgf-primary)]">
                                <Eye className="h-3.5 w-3.5" /> Ver documento
                            </a>
                        </div>
                    )}
                </div>

                {/* Local da infração: texto + alfinete no mapa */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <p className="text-base font-bold text-slate-900">Local da infração</p>
                    </div>
                    <LocationPicker
                        value={pin}
                        onChange={setPin}
                        address={locationText}
                        onAddressChange={setLocationText}
                        cityHint={[branding.city, branding.state].filter(Boolean).join(', ') || undefined}
                    />
                    {(locationText !== (infraction.location ?? '') || pin?.lat !== (infraction.lat ?? undefined) || pin?.lng !== (infraction.lng ?? undefined)) && (
                        <div className="mt-3 flex justify-end gap-2">
                            <SGFButton size="sm" variant="ghost" onClick={() => {
                                setLocationText(infraction.location ?? '');
                                setPin(infraction.lat != null && infraction.lng != null ? { lat: infraction.lat, lng: infraction.lng } : null);
                            }}>Desfazer</SGFButton>
                            <SGFButton size="sm" loading={locationMutation.isPending} onClick={() => locationMutation.mutate()}>Salvar local</SGFButton>
                        </div>
                    )}
                </div>

                {/* Condutor responsável */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-base font-bold text-slate-900">Condutor responsável</p>
                    <p className="mb-3 text-xs text-slate-500">
                        {closed ? 'Condutor registrado nesta infração.' : 'Use a sugestão do GPS (quem estava em viagem no horário) ou escolha outro motorista.'}
                    </p>

                    {!closed && candidates.length > 0 && (
                        <div className="mb-3 space-y-2">
                            {candidates.map((c: InfractionCandidate) => {
                                const active = driverId === c.driverId && tripId === c.tripId;
                                return (
                                    <button
                                        key={c.tripId}
                                        type="button"
                                        onClick={() => { setDriverId(c.driverId); setTripId(c.tripId); }}
                                        className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                                            active ? 'border-[var(--sgf-primary)] bg-[var(--sgf-primary-soft)]' : 'border-slate-200 hover:border-[var(--sgf-primary)]'
                                        }`}
                                    >
                                        <DriverCell name={c.driverName} photoUrl={c.driverPhoto} subtitle={`${c.tripNumber ? `Viagem #${c.tripNumber} · ` : ''}${fmtDateTime(c.startAt)}${c.destination ? ` · ${c.destination}` : ''}`} />
                                        <span className="ml-auto shrink-0">
                                            {active
                                                ? <CheckCircle className="h-5 w-5 text-[var(--sgf-primary)]" />
                                                : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Sugerido pelo GPS</span>}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {!closed && (
                        <div className="mb-3">
                            <SGFInput
                                value={tripQuery}
                                onChange={(e) => setTripQuery(e.target.value)}
                                placeholder="Buscar viagem: nº, placa, motorista, destino ou data (dd/mm)"
                                icon={Route}
                                fullWidth
                            />
                            {tripQuery.trim() && (() => {
                                const q = tripQuery.trim().replace(/^#/, '');
                                const found = recentTrips.filter((t) =>
                                    (t.tripNumber != null && String(t.tripNumber) === q)
                                    || matchesSearch(q, t.plate, t.vehicleName, t.driverName, t.destination, fmtDateTime(t.startAt))
                                ).slice(0, 6);
                                return (
                                    <div className="mt-2 space-y-1.5">
                                        {found.length === 0 && <p className="px-1 text-xs text-slate-400">Nenhuma viagem encontrada.</p>}
                                        {found.map((t) => {
                                            const active = tripId === t.tripId;
                                            return (
                                                <button
                                                    key={t.tripId}
                                                    type="button"
                                                    onClick={() => { setDriverId(t.driverId); setTripId(t.tripId); setTripQuery(''); }}
                                                    className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                                                        active ? 'border-[var(--sgf-primary)] bg-[var(--sgf-primary-soft)]' : 'border-slate-200 hover:border-[var(--sgf-primary)]'
                                                    }`}
                                                >
                                                    <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700">#{t.tripNumber ?? '—'}</span>
                                                    <DriverCell
                                                        name={t.driverName}
                                                        photoUrl={t.driverPhoto}
                                                        subtitle={[t.plate, fmtDateTime(t.startAt), t.destination].filter(Boolean).join(' · ')}
                                                    />
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {!closed && (
                        <SGFSelect
                            options={driverOptions}
                            value={driverId}
                            onChange={(v) => { setDriverId(v); setTripId(null); }}
                            placeholder="Escolher outro motorista"
                            searchable
                            searchPlaceholder="Buscar por nome, CPF ou CNH"
                            fullWidth
                        />
                    )}

                    {selectedDriverObj && (
                        <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                            <DriverCell
                                name={selectedDriverObj.name || selectedDriverObj.full_name}
                                photoUrl={selectedDriverObj.photo_url}
                                subtitle={[selectedDriverObj.cnh_number ? `CNH ${selectedDriverObj.cnh_number}` : null, selectedDriverObj.cnh_category ? `cat. ${selectedDriverObj.cnh_category}` : null].filter(Boolean).join(' · ') || null}
                            />
                            <span className="ml-auto shrink-0 rounded-full bg-[var(--sgf-primary)] px-2.5 py-1 text-[10px] font-bold text-white">
                                {closed ? 'Responsável' : 'Selecionado'}
                            </span>
                        </div>
                    )}

                    {/* Remover a indicação gravada: volta a infração para pendente */}
                    {hasIndication && (
                        confirmRemove ? (
                            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-amber-900">
                                    Remover a indicação{infraction.status === 'aprovada' ? ' e a aprovação' : ''}? A infração volta para pendente.
                                </p>
                                <div className="flex shrink-0 gap-2">
                                    <SGFButton size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Voltar</SGFButton>
                                    <SGFButton size="sm" variant="outline" loading={removeMutation.isPending} onClick={() => removeMutation.mutate()}>
                                        Remover indicação
                                    </SGFButton>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmRemove(true)}
                                className="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline disabled:opacity-50"
                            >
                                Remover indicação
                            </button>
                        )
                    )}
                </div>

                {/* Documentos para o órgão autuador */}
                {(() => {
                    const target = drivers.find((dr) => dr.id === (driverId || infraction.indicated_driver_id));
                    const missing = [
                        !vehicleDocs?.renavam ? 'RENAVAM do veículo' : null,
                        target && !target.cpf ? 'CPF do condutor' : null,
                        target && !target.cnh_number ? 'nº da CNH do condutor' : null,
                        target && !(target as { cnh_uf?: string | null }).cnh_uf ? 'UF da CNH do condutor' : null,
                        !infraction.ait ? 'nº do AIT' : null,
                    ].filter(Boolean) as string[];
                    return (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-base font-bold text-slate-900">Formulário de indicação (FICI)</p>
                                    <p className="text-xs text-slate-500">PDF pré-preenchido com infração, veículo, prefeitura e condutor, para assinar e protocolar.</p>
                                </div>
                                <SGFButton variant="outline" icon={FileText} loading={generatingFici} disabled={!target} onClick={() => void generateFici()}>
                                    Gerar FICI
                                </SGFButton>
                            </div>
                            {!target && <p className="mt-2 text-xs text-slate-500">Escolha o condutor para gerar o formulário.</p>}
                            {target && missing.length > 0 && (
                                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    Falta preencher: {missing.join(', ')}. O formulário sai com esses campos em branco.
                                </p>
                            )}
                        </div>
                    );
                })()}

                {/* Confirmação da indicação (texto antes de gravar) */}
                {confirmAction && selectedDriverObj && (() => {
                    const trip = candidates.find((c) => c.tripId === tripId) ?? recentTrips.find((t) => t.tripId === tripId);
                    const driverName = selectedDriverObj.name || selectedDriverObj.full_name;
                    return (
                        <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="rounded-2xl border-2 border-[var(--sgf-primary)] bg-[var(--sgf-primary-soft)] p-4">
                            <p className="text-sm font-bold text-slate-900">
                                {confirmAction === 'approve' ? 'Confirmar e aprovar a indicação?' : 'Confirmar a indicação?'}
                            </p>
                            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                                <strong>{driverName}</strong>
                                {selectedDriverObj.cnh_number ? ` (CNH ${selectedDriverObj.cnh_number})` : ''} será indicado(a) como condutor(a) responsável pela infração
                                {' '}<strong>{infraction.description || 'de trânsito'}</strong>
                                {infraction.ait ? ` (AIT ${infraction.ait})` : ''}, em {fmtDateTimeLong(infraction.occurred_at)}
                                {plate ? `, veículo ${plate}` : ''}
                                {trip ? `, viagem #${(trip as { tripNumber?: number | null }).tripNumber ?? '—'}` : ''}.
                                {confirmAction === 'approve' && ' A indicação será aprovada e a infração ficará registrada para este motorista.'}
                            </p>
                            <div className="mt-3 flex justify-end gap-2">
                                <SGFButton size="sm" variant="ghost" onClick={() => setConfirmAction(null)}>Voltar</SGFButton>
                                <SGFButton
                                    size="sm"
                                    icon={CheckCircle}
                                    loading={confirmAction === 'approve' ? approveMutation.isPending : indicateMutation.isPending}
                                    onClick={() => (confirmAction === 'approve' ? approveMutation.mutate() : indicateMutation.mutate())}
                                >
                                    {confirmAction === 'approve' ? 'Confirmar e aprovar' : 'Confirmar indicação'}
                                </SGFButton>
                            </div>
                        </div>
                    );
                })()}

                {/* Rejeitar: ação rara, discreta no fim */}
                {!closed && (
                    confirmReject ? (
                        <div className="flex flex-col gap-2 rounded-2xl border border-red-100 bg-red-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-red-800">Rejeitar esta infração? Ela sai da fila de indicação.</p>
                            <div className="flex shrink-0 gap-2">
                                <SGFButton size="sm" variant="ghost" onClick={() => setConfirmReject(false)}>Voltar</SGFButton>
                                <SGFButton size="sm" variant="ghost" icon={X} loading={rejectMutation.isPending}
                                    className="!text-red-600 hover:!bg-red-50" onClick={() => rejectMutation.mutate()}>
                                    Confirmar rejeição
                                </SGFButton>
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-center pt-1">
                            <button type="button" disabled={busy} onClick={() => setConfirmReject(true)} className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50">
                                Rejeitar infração
                            </button>
                        </div>
                    )
                )}
            </div>
    );

    if (layout === 'page') {
        return (
            <div className="space-y-5 pb-24">
                <div className="flex items-center gap-4 rounded-[var(--sgf-card-radius)] border border-slate-200 bg-white p-5">
                    <EntityAvatarLarge url={infraction.vehicles?.photo_url} />
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--sgf-primary)]">Infração de trânsito</p>
                        <h2 className="truncate text-xl font-black text-slate-950">{title}</h2>
                        <p className="text-sm text-slate-500">{subtitle}</p>
                    </div>
                </div>
                {body}
                <div className="sticky bottom-0 z-10 -mx-1 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">{actions}</div>
            </div>
        );
    }

    return (
        <WorkshopModalShell
            onClose={onClose}
            eyebrow="Infração de trânsito"
            title={title}
            subtitle={subtitle}
            busy={busy}
            maxWidthClass="sm:max-w-3xl"
            zIndexClass="z-50"
            media={<EntityAvatarLarge url={infraction.vehicles?.photo_url} />}
            footer={actions}
        >
            {body}
        </WorkshopModalShell>
    );
}

function InfoItem({ icon: Icon, label, value, strong, nowrap }: { icon: typeof Calendar; label: string; value: string; strong?: boolean; nowrap?: boolean }) {
    return (
        <div className="flex min-w-0 items-start gap-2.5">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className={`leading-snug ${nowrap ? 'whitespace-nowrap' : 'break-words'} ${strong ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{value}</dd>
            </div>
        </div>
    );
}

/** Foto do veículo no cabeçalho do modal; sem foto, o ícone. */
function EntityAvatarLarge({ url }: { url?: string | null }) {
    const [failed, setFailed] = useState(false);
    if (!url || failed) {
        return <div className="grid h-16 w-20 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Car className="h-7 w-7" /></div>;
    }
    return <img src={url} alt="Veículo" onError={() => setFailed(true)} className="h-16 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200" />;
}
