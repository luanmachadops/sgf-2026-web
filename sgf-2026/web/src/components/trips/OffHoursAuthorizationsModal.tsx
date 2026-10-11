import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import { VehiclePickerField } from '@/components/sgf/VehiclePickerField';
import { Plus } from '@/components/sgf/icons';
import { useAuth } from '@/contexts/AuthContext';
import { useDrivers } from '@/hooks/useDrivers';
import { useVehicles } from '@/hooks/useVehicles';
import {
    MIN_REASON_LENGTH,
    authorizationState,
    offHoursAuthorizationsApi,
    type AuthorizationState,
    type OffHoursAuthorizationRow,
} from '@/lib/alerts-api';
import { formatDateTime } from '@/lib/utils';

const STATE_META: Record<AuthorizationState, { label: string; variant: 'success' | 'info' | 'default' | 'error' }> = {
    vigente: { label: 'Vigente', variant: 'success' },
    futura: { label: 'Futura', variant: 'info' },
    expirada: { label: 'Expirada', variant: 'default' },
    revogada: { label: 'Revogada', variant: 'error' },
};
const STATE_ORDER: AuthorizationState[] = ['vigente', 'futura', 'expirada', 'revogada'];
const TABS: { value: AuthorizationState | 'todas'; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    ...STATE_ORDER.map((s) => ({ value: s, label: STATE_META[s].label })),
];

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

/** Date -> valor de <input type="datetime-local"> no fuso local. */
function toLocalInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function OffHoursAuthorizationsModal({ isOpen, onClose }: Props) {
    const qc = useQueryClient();
    const { user } = useAuth();
    const canWrite = ['admin', 'gestor'].includes(user?.accountRole ?? '');

    const listQuery = useQuery({
        queryKey: ['off-hours-authorizations'],
        queryFn: offHoursAuthorizationsApi.list,
        enabled: isOpen,
    });

    const [tab, setTab] = useState<AuthorizationState | 'todas'>('vigente');
    const [mode, setMode] = useState<'list' | 'create'>('list');
    const [revoking, setRevoking] = useState<OffHoursAuthorizationRow | null>(null);

    const rows = useMemo(() => {
        // Referência de "agora" = momento em que a lista foi carregada.
        const now = listQuery.dataUpdatedAt;
        return (listQuery.data ?? []).map((row) => ({ row, state: authorizationState(row, now) }));
    }, [listQuery.data, listQuery.dataUpdatedAt]);
    const counts = useMemo(() => {
        const c: Record<AuthorizationState | 'todas', number> = { todas: rows.length, vigente: 0, futura: 0, expirada: 0, revogada: 0 };
        rows.forEach((r) => { c[r.state] += 1; });
        return c;
    }, [rows]);
    const visible = rows.filter((r) => tab === 'todas' || r.state === tab);

    const handleClose = () => {
        setMode('list');
        setRevoking(null);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Autorizações fora do horário"
            description="Libera o uso de um veículo fora do expediente, em feriados ou fins de semana. Viagens autorizadas não geram alerta."
            size="xl"
        >
            {mode === 'create' ? (
                <CreateForm
                    onCancel={() => setMode('list')}
                    onDone={() => {
                        setMode('list');
                        setTab('todas');
                        qc.invalidateQueries({ queryKey: ['off-hours-authorizations'] });
                    }}
                />
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {TABS.map((t) => (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => setTab(t.value)}
                                    className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                                        tab === t.value
                                            ? 'border-[var(--sgf-accent)] bg-[var(--sgf-accent)] text-[var(--sgf-accent-contrast)]'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-[var(--sgf-accent)]'
                                    }`}
                                >
                                    {t.label} <span className="ml-1 opacity-70">{counts[t.value]}</span>
                                </button>
                            ))}
                        </div>
                        {canWrite && (
                            <SGFButton icon={Plus} onClick={() => setMode('create')}>Nova autorização</SGFButton>
                        )}
                    </div>

                    {listQuery.isLoading ? (
                        <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
                    ) : listQuery.isError ? (
                        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Não foi possível carregar as autorizações.</p>
                    ) : visible.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                            Nenhuma autorização nesta aba.
                        </p>
                    ) : (
                        <ul className="space-y-2.5">
                            {visible.map(({ row, state }) => (
                                <li key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-slate-900">
                                                {row.vehicles?.plate ?? 'Veículo'}
                                                <span className="ml-2 text-sm font-normal text-slate-500">
                                                    {[row.vehicles?.brand, row.vehicles?.model].filter(Boolean).join(' ')}
                                                </span>
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {row.driver?.full_name ? `Motorista: ${row.driver.full_name}` : 'Qualquer motorista'}
                                            </p>
                                        </div>
                                        <SGFBadge variant={STATE_META[state].variant}>{STATE_META[state].label}</SGFBadge>
                                    </div>
                                    <p className="mt-2 text-sm text-slate-700">
                                        {formatDateTime(row.valid_from)} até {formatDateTime(row.valid_to)}
                                    </p>
                                    <p className="mt-1 break-words text-sm text-slate-600"><span className="font-semibold">Motivo:</span> {row.reason}</p>
                                    <p className="mt-1 text-xs text-slate-400">
                                        Autorizada por {row.authorizer?.full_name ?? 'usuário não identificado'} em {formatDateTime(row.created_at)}
                                    </p>
                                    {row.revoked_at && (
                                        <p className="mt-1 break-words text-xs text-red-700">
                                            Revogada em {formatDateTime(row.revoked_at)}: {row.revoke_reason}
                                        </p>
                                    )}
                                    {canWrite && (state === 'vigente' || state === 'futura') && (
                                        <div className="mt-3 flex justify-end">
                                            <SGFButton size="sm" variant="outline" onClick={() => setRevoking(row)}>Revogar</SGFButton>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {revoking && (
                <RevokeModal
                    row={revoking}
                    onClose={() => setRevoking(null)}
                    onDone={() => {
                        setRevoking(null);
                        qc.invalidateQueries({ queryKey: ['off-hours-authorizations'] });
                    }}
                />
            )}
        </Modal>
    );
}

function CreateForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
    const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
    const { data: drivers = [] } = useDrivers();
    const [vehicleId, setVehicleId] = useState('');
    const [driverId, setDriverId] = useState('');
    const [validFrom, setValidFrom] = useState(() => toLocalInput(new Date()));
    const [validTo, setValidTo] = useState(() => toLocalInput(new Date(Date.now() + 8 * 3600_000)));
    const [reason, setReason] = useState('');

    const mutation = useMutation({
        mutationFn: () => offHoursAuthorizationsApi.create({
            vehicleId,
            driverId: driverId || null,
            validFrom: new Date(validFrom).toISOString(),
            validTo: new Date(validTo).toISOString(),
            reason,
        }),
        onSuccess: () => {
            toast.success('Autorização criada.');
            onDone();
        },
        onError: (e) => toast.error(errorMessage(e, 'Não foi possível criar a autorização.')),
    });

    const trimmed = reason.trim();
    const periodInvalid = !validFrom || !validTo || new Date(validTo) <= new Date(validFrom);
    const canSubmit = Boolean(vehicleId) && !periodInvalid && trimmed.length >= MIN_REASON_LENGTH;

    return (
        <div className="space-y-4">
            <VehiclePickerField vehicles={vehicles} value={vehicleId} onChange={setVehicleId} loading={vehiclesLoading} />
            <SGFSelect
                label="Motorista (opcional)"
                searchable
                fullWidth
                value={driverId}
                onChange={setDriverId}
                options={[
                    { value: '', label: 'Qualquer motorista' },
                    ...drivers.map((d) => ({ value: d.id, label: d.name ?? d.full_name ?? 'Motorista' })),
                ]}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SGFInput label="Início da vigência" type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} fullWidth />
                <SGFInput
                    label="Fim da vigência"
                    type="datetime-local"
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                    error={validFrom && validTo && periodInvalid ? 'O fim deve ser depois do início.' : undefined}
                    fullWidth
                />
            </div>
            <SGFTextarea
                label="Motivo"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                fullWidth
                maxLength={500}
                placeholder="Ex.: Plantão de fim de semana da Defesa Civil."
                hint={`Mínimo de ${MIN_REASON_LENGTH} caracteres.`}
                error={reason.length > 0 && trimmed.length < MIN_REASON_LENGTH ? `Faltam ${MIN_REASON_LENGTH - trimmed.length} caracteres.` : undefined}
            />
            <div className="flex justify-end gap-2">
                <SGFButton variant="outline" onClick={onCancel} disabled={mutation.isPending}>Voltar</SGFButton>
                <SGFButton onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>Criar autorização</SGFButton>
            </div>
        </div>
    );
}

function RevokeModal({ row, onClose, onDone }: { row: OffHoursAuthorizationRow; onClose: () => void; onDone: () => void }) {
    const [reason, setReason] = useState('');
    const trimmed = reason.trim();
    const tooShort = trimmed.length < MIN_REASON_LENGTH;
    const mutation = useMutation({
        mutationFn: () => offHoursAuthorizationsApi.revoke(row.id, reason),
        onSuccess: () => {
            toast.success('Autorização revogada.');
            onDone();
        },
        onError: (e) => toast.error(errorMessage(e, 'Não foi possível revogar a autorização.')),
    });

    return (
        <Modal
            isOpen
            onClose={() => { if (!mutation.isPending) onClose(); }}
            title="Revogar autorização"
            description={`${row.vehicles?.plate ?? 'Veículo'} · a revogação é definitiva e fica registrada.`}
            size="md"
            footer={
                <div className="flex justify-end gap-2">
                    <SGFButton variant="outline" onClick={onClose} disabled={mutation.isPending}>Voltar</SGFButton>
                    <SGFButton variant="danger" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={tooShort}>Revogar</SGFButton>
                </div>
            }
        >
            <SGFTextarea
                label="Motivo da revogação"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                fullWidth
                maxLength={500}
                hint={`Mínimo de ${MIN_REASON_LENGTH} caracteres.`}
                error={reason.length > 0 && tooShort ? `Faltam ${MIN_REASON_LENGTH - trimmed.length} caracteres.` : undefined}
            />
        </Modal>
    );
}
