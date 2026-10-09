import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import { AlertTriangle } from '@/components/sgf/icons';
import { useCancelTrip, useCorrectTrip } from '@/hooks/useTrips';
import type { TripCorrectionPatch } from '@/lib/supabase-api';

export const MIN_REASON_LENGTH = 10;

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

/** ISO -> valor de <input type="datetime-local"> no fuso local. */
function toLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
    return new Date(value).toISOString();
}

// ─────────────────────────────────────────────────────────────────
// Cancelar viagem
// ─────────────────────────────────────────────────────────────────
interface CancelTripModalProps {
    tripId: string;
    inProgress: boolean;
    isOpen: boolean;
    onClose: () => void;
}

export function CancelTripModal({ tripId, inProgress, isOpen, onClose }: CancelTripModalProps) {
    const [reason, setReason] = useState('');
    const cancelMutation = useCancelTrip();
    const trimmed = reason.trim();
    const tooShort = trimmed.length < MIN_REASON_LENGTH;

    const handleClose = () => {
        if (cancelMutation.isPending) return;
        setReason('');
        onClose();
    };

    const handleConfirm = () => {
        if (tooShort) return;
        cancelMutation.mutate(
            { tripId, reason: trimmed },
            {
                onSuccess: () => {
                    toast.success('Viagem cancelada.');
                    setReason('');
                    onClose();
                },
                onError: (error) => toast.error(errorMessage(error, 'Não foi possível cancelar a viagem.')),
            },
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Cancelar viagem"
            description="O cancelamento é definitivo e fica registrado com o seu nome."
            size="md"
            footer={
                <div className="flex justify-end gap-2">
                    <SGFButton variant="outline" onClick={handleClose} disabled={cancelMutation.isPending}>Voltar</SGFButton>
                    <SGFButton variant="danger" onClick={handleConfirm} loading={cancelMutation.isPending} disabled={tooShort}>
                        Cancelar viagem
                    </SGFButton>
                </div>
            }
        >
            <div className="space-y-4">
                {inProgress && (
                    <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>Esta viagem está em andamento. Ao cancelar, o rastreio será encerrado e o motorista será notificado.</p>
                    </div>
                )}
                <SGFTextarea
                    label="Motivo do cancelamento"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    fullWidth
                    maxLength={500}
                    placeholder="Explique por que a viagem está sendo cancelada."
                    hint={`Mínimo de ${MIN_REASON_LENGTH} caracteres.`}
                    error={reason.length > 0 && tooShort ? `Faltam ${MIN_REASON_LENGTH - trimmed.length} caracteres.` : undefined}
                />
            </div>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────
// Retificar viagem
// ─────────────────────────────────────────────────────────────────
export interface CorrectableTrip {
    id: string;
    start_odometer: number | null;
    end_odometer: number | null;
    destination: string;
    start_at: string;
    end_at: string | null;
    notes: string | null;
}

interface CorrectTripModalProps {
    trip: CorrectableTrip;
    isOpen: boolean;
    onClose: () => void;
}

interface FormState {
    start_odometer: string;
    end_odometer: string;
    destination: string;
    start_at: string;
    end_at: string;
    notes: string;
}

function initialForm(trip: CorrectableTrip): FormState {
    return {
        start_odometer: trip.start_odometer != null ? String(trip.start_odometer) : '',
        end_odometer: trip.end_odometer != null ? String(trip.end_odometer) : '',
        destination: trip.destination ?? '',
        start_at: toLocalInput(trip.start_at),
        end_at: toLocalInput(trip.end_at),
        notes: trip.notes ?? '',
    };
}

/** Monta o patch só com o que mudou; devolve erro de validação quando houver. */
function buildPatch(trip: CorrectableTrip, form: FormState): { patch: TripCorrectionPatch; error?: string } {
    const initial = initialForm(trip);
    const patch: TripCorrectionPatch = {};

    for (const key of ['start_odometer', 'end_odometer'] as const) {
        if (form[key] === initial[key]) continue;
        if (form[key].trim() === '') return { patch, error: 'Não é possível apagar um valor de hodômetro já registrado.' };
        const value = Number(form[key].replace(',', '.'));
        if (!Number.isFinite(value) || value < 0) return { patch, error: 'Informe um valor de hodômetro válido.' };
        patch[key] = value;
    }
    if (form.destination !== initial.destination) {
        if (!form.destination.trim()) return { patch, error: 'O destino não pode ficar vazio.' };
        patch.destination = form.destination.trim();
    }
    if (form.start_at !== initial.start_at) {
        if (!form.start_at) return { patch, error: 'Informe a data e hora de início.' };
        patch.start_at = fromLocalInput(form.start_at);
    }
    if (form.end_at !== initial.end_at) {
        if (!form.end_at) return { patch, error: 'Não é possível apagar a data de fim já registrada.' };
        patch.end_at = fromLocalInput(form.end_at);
    }
    if (form.notes !== initial.notes) {
        patch.notes = form.notes.trim() ? form.notes.trim() : null;
    }

    const finalStart = patch.start_odometer ?? trip.start_odometer;
    const finalEnd = patch.end_odometer ?? trip.end_odometer;
    if (finalStart != null && finalEnd != null && finalEnd < finalStart) {
        return { patch, error: 'O hodômetro final não pode ser menor que o inicial.' };
    }
    const startIso = patch.start_at ?? trip.start_at;
    const endIso = patch.end_at ?? trip.end_at;
    if (endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) {
        return { patch, error: 'O fim da viagem não pode ser anterior ao início.' };
    }
    return { patch };
}

export function CorrectTripModal({ trip, isOpen, onClose }: CorrectTripModalProps) {
    const [form, setForm] = useState<FormState>(() => initialForm(trip));
    const [reason, setReason] = useState('');
    const correctMutation = useCorrectTrip();

    const trimmed = reason.trim();
    const tooShort = trimmed.length < MIN_REASON_LENGTH;
    const { patch, error: validationError } = buildPatch(trip, form);
    const changed = Object.keys(patch).length > 0;

    const set = (key: keyof FormState) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

    const handleClose = () => {
        if (correctMutation.isPending) return;
        onClose();
    };

    const handleConfirm = () => {
        if (validationError) return toast.error(validationError);
        if (!changed) return toast.error('Altere ao menos um campo para retificar.');
        if (tooShort) return toast.error(`Informe o motivo (mínimo de ${MIN_REASON_LENGTH} caracteres).`);
        correctMutation.mutate(
            { tripId: trip.id, patch, reason: trimmed },
            {
                onSuccess: () => {
                    toast.success('Viagem retificada. A alteração ficou registrada no histórico.');
                    onClose();
                },
                onError: (error) => toast.error(errorMessage(error, 'Não foi possível retificar a viagem.')),
            },
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Retificar viagem"
            description="Cada campo alterado fica registrado no histórico de retificações, com o valor anterior e o motivo."
            size="lg"
            footer={
                <div className="flex justify-end gap-2">
                    <SGFButton variant="outline" onClick={handleClose} disabled={correctMutation.isPending}>Voltar</SGFButton>
                    <SGFButton onClick={handleConfirm} loading={correctMutation.isPending} disabled={!changed || tooShort || Boolean(validationError)}>
                        Salvar retificação
                    </SGFButton>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <SGFInput label="Km inicial" type="number" inputMode="decimal" min={0} value={form.start_odometer} onChange={(e) => set('start_odometer')(e.target.value)} fullWidth />
                    <SGFInput label="Km final" type="number" inputMode="decimal" min={0} value={form.end_odometer} onChange={(e) => set('end_odometer')(e.target.value)} fullWidth />
                    <SGFInput label="Início" type="datetime-local" value={form.start_at} onChange={(e) => set('start_at')(e.target.value)} fullWidth />
                    <SGFInput label="Fim" type="datetime-local" value={form.end_at} onChange={(e) => set('end_at')(e.target.value)} fullWidth />
                </div>
                <SGFInput label="Destino" value={form.destination} onChange={(e) => set('destination')(e.target.value)} fullWidth />
                <SGFTextarea label="Observações" value={form.notes} onChange={(e) => set('notes')(e.target.value)} rows={3} fullWidth />
                <SGFTextarea
                    label="Motivo da retificação"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    fullWidth
                    maxLength={500}
                    placeholder="Ex.: hodômetro digitado errado pelo motorista na saída."
                    hint={`Obrigatório, mínimo de ${MIN_REASON_LENGTH} caracteres.`}
                    error={reason.length > 0 && tooShort ? `Faltam ${MIN_REASON_LENGTH - trimmed.length} caracteres.` : undefined}
                />
                {validationError && <p className="text-sm font-medium text-rose-600">{validationError}</p>}
            </div>
        </Modal>
    );
}
