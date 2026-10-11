import type { Tables, Json } from '@/types/database.types';
import { MapPin, Users, Route, Clock, ShieldCheck, FileText } from '@/components/sgf/icons';
import { toast } from 'sonner';
import { openPrivateDocument } from '@/lib/docStorage';
import { formatDateTime } from '@/lib/utils';
import { ChecklistExtras } from '@/components/checklists/ChecklistExtras';
import { ChecklistItemsList } from '@/components/checklists/ChecklistItemsList';
import type { TripChecklistRecord, TripCorrectionRecord } from '@/lib/supabase-api';
import { PURPOSE_CATEGORY_LABEL } from '@/lib/tripPurpose';


const CORRECTION_FIELD_LABEL: Record<string, string> = {
    start_odometer: 'Km inicial',
    end_odometer: 'Km final',
    destination: 'Destino',
    start_at: 'Início',
    end_at: 'Fim',
    notes: 'Observações',
};

const DATE_FIELDS = new Set(['start_at', 'end_at']);

function formatCorrectionValue(field: string, value: string | null): string {
    if (value == null || value === '') return '—';
    if (DATE_FIELDS.has(field)) return formatDateTime(value);
    return value;
}

interface Passenger {
    nome: string;
    documento?: string;
}

function parsePassengers(value: Json | null | undefined): Passenger[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): Passenger[] => {
        if (typeof entry === 'string') return [{ nome: entry }];
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            const record = entry as Record<string, Json | undefined>;
            const nome = String(record.nome ?? record.name ?? '').trim();
            if (!nome) return [];
            const documento = record.documento ?? record.document;
            return [{ nome, documento: documento ? String(documento) : undefined }];
        }
        return [];
    });
}

function Field({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            {value ? (
                <p className="break-words text-sm font-medium text-slate-900">{value}</p>
            ) : (
                <p className="text-sm text-slate-400">Não informado</p>
            )}
        </div>
    );
}

type PurposeTrip = Pick<
    Tables<'trips'>,
    'origin' | 'destination' | 'purpose' | 'purpose_category' | 'passenger_count' | 'passengers' | 'cargo_description'
>;

export function TripPurposeSection({ trip, stops }: { trip: PurposeTrip; stops: Tables<'trip_stops'>[] }) {
    const passengers = parsePassengers(trip.passengers);
    const passengerCount = trip.passenger_count ?? (passengers.length > 0 ? passengers.length : null);

    return (
        <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Route className="h-4 w-4 text-emerald-600" /> Finalidade do deslocamento
            </p>
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Origem" value={trip.origin} />
                    <Field label="Destino" value={trip.destination} />
                    <Field label="Categoria" value={trip.purpose_category ? PURPOSE_CATEGORY_LABEL[trip.purpose_category] ?? trip.purpose_category : null} />
                    <Field label="Finalidade" value={trip.purpose} />
                    <Field label="Carga transportada" value={trip.cargo_description} />
                    <Field label="Passageiros" value={passengerCount != null ? String(passengerCount) : null} />
                </div>

                {passengers.length > 0 && (
                    <div>
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                            <Users className="h-3.5 w-3.5" /> Lista de passageiros
                        </p>
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                            {passengers.map((p, index) => (
                                <li key={`${p.nome}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <span className="font-medium text-slate-800">{p.nome}</span>
                                    {p.documento && <span className="font-mono text-xs text-slate-500">{p.documento}</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <MapPin className="h-3.5 w-3.5" /> Paradas
                    </p>
                    {stops.length === 0 ? (
                        <p className="text-sm text-slate-400">Nenhuma parada registrada.</p>
                    ) : (
                        <ol className="space-y-1.5">
                            {stops.map((stop) => (
                                <li key={stop.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">
                                        {stop.seq}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="break-words text-sm font-medium text-slate-900">{stop.description || 'Parada sem descrição'}</p>
                                        <p className="text-xs text-slate-500">
                                            {stop.source === 'gps' ? 'Detectada pelo GPS' : 'Declarada pelo motorista'}
                                            {stop.arrived_at && ` · chegada ${formatDateTime(stop.arrived_at)}`}
                                            {stop.left_at && ` · saída ${formatDateTime(stop.left_at)}`}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    );
}

export function TripCorrectionsSection({ corrections, loading }: { corrections: TripCorrectionRecord[]; loading: boolean }) {
    return (
        <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Histórico de retificações
            </p>
            {loading ? (
                <p className="text-sm text-slate-400">Carregando…</p>
            ) : corrections.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">
                    Nenhuma retificação registrada. Os dados desta viagem estão como foram enviados.
                </p>
            ) : (
                <ul className="space-y-2">
                    {corrections.map((c) => (
                        <li key={c.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900">{CORRECTION_FIELD_LABEL[c.field] ?? c.field}</p>
                                <p className="flex items-center gap-1 text-xs text-slate-500">
                                    <Clock className="h-3.5 w-3.5" /> {formatDateTime(c.corrected_at)} · {c.corrected_by_name ?? 'Usuário removido'}
                                </p>
                            </div>
                            <p className="mt-1 text-sm text-slate-700">
                                <span className="text-slate-500 line-through">{formatCorrectionValue(c.field, c.old_value)}</span>
                                <span className="mx-2 text-slate-400">→</span>
                                <span className="font-semibold">{formatCorrectionValue(c.field, c.new_value)}</span>
                            </p>
                            <p className="mt-1 text-xs text-slate-500"><span className="font-semibold">Motivo:</span> {c.reason}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function TripChecklistSection({ checklist }: { checklist: TripChecklistRecord }) {
    const items = [...(checklist.checklist_items ?? [])].sort((a, b) => a.item_key.localeCompare(b.item_key));
    return (
        <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Checklist da viagem
                <span className="text-xs font-normal text-slate-400">{formatDateTime(checklist.created_at)}</span>
            </p>
            <div className="space-y-3">
                <ChecklistExtras checklist={checklist} />
                {checklist.notes && (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">{checklist.notes}</p>
                )}
                <ChecklistItemsList items={items} />
            </div>
        </div>
    );
}

type RecordTrip = Pick<
    Tables<'trips'>,
    'start_at' | 'end_at' | 'server_started_at' | 'server_ended_at' | 'is_retroactive' | 'justification' | 'retroactive_document_path'
>;

/** Diferença acima disso entre relógio do aparelho e do servidor é destacada. */
const CLOCK_SKEW_ALERT_MS = 5 * 60 * 1000;

function clockSkew(device: string | null, server: string | null): number | null {
    if (!device || !server) return null;
    const diff = new Date(device).getTime() - new Date(server).getTime();
    return Number.isFinite(diff) ? diff : null;
}

function skewLabel(ms: number): string {
    const min = Math.round(Math.abs(ms) / 60000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return `${h} h ${min % 60} min`;
}

function TimeRow({ label, device, server }: { label: string; device: string | null; server: string | null }) {
    const skew = clockSkew(device, server);
    const alert = skew != null && Math.abs(skew) > CLOCK_SKEW_ALERT_MS;
    return (
        <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="text-sm text-slate-900">
                Aparelho: <span className="font-medium">{device ? formatDateTime(device) : '—'}</span>
            </p>
            <p className="text-sm text-slate-900">
                Servidor: <span className="font-medium">{server ? formatDateTime(server) : 'Sem registro'}</span>
            </p>
            {alert && (
                <p className="mt-1 text-xs font-semibold text-amber-700">
                    Relógio do aparelho {skew! > 0 ? 'adiantado' : 'atrasado'} em {skewLabel(skew!)}
                </p>
            )}
        </div>
    );
}

/**
 * Procedência do registro: lançamento retroativo (folha de papel) e as horas
 * do servidor ao lado das do aparelho (P2.1). Viagens anteriores a 11/10/2026
 * não têm a hora do servidor.
 */
export function TripRecordSection({ trip, registeredByName }: { trip: RecordTrip; registeredByName?: string | null }) {
    const openDoc = async () => {
        if (!trip.retroactive_document_path) return;
        try {
            await openPrivateDocument(trip.retroactive_document_path);
        } catch {
            toast.error('Não foi possível abrir a folha de papel.');
        }
    };

    if (trip.is_retroactive) {
        return (
            <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <FileText className="h-4 w-4 text-amber-600" /> Lançamento retroativo (folha de papel)
                </p>
                <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <Field label="Justificativa" value={trip.justification} />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Lançada por" value={registeredByName ?? null} />
                        <Field label="Lançada em (servidor)" value={trip.server_started_at ? formatDateTime(trip.server_started_at) : null} />
                    </div>
                    {trip.retroactive_document_path && (
                        <button
                            type="button"
                            onClick={openDoc}
                            className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                        >
                            <FileText className="h-4 w-4" /> Ver folha de papel
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (!trip.server_started_at && !trip.server_ended_at) return null;

    return (
        <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Clock className="h-4 w-4 text-emerald-600" /> Horário do registro
            </p>
            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <TimeRow label="Início" device={trip.start_at} server={trip.server_started_at} />
                <TimeRow label="Fim" device={trip.end_at} server={trip.server_ended_at} />
            </div>
        </div>
    );
}
