import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import { VehiclePickerField } from '@/components/sgf/VehiclePickerField';
import { FileText } from '@/components/sgf/icons';
import { useAuth } from '@/contexts/AuthContext';
import { useDrivers } from '@/hooks/useDrivers';
import { useVehicles } from '@/hooks/useVehicles';
import { PURPOSE_CATEGORY_LABEL } from '@/lib/tripPurpose';
import { MIN_RETROACTIVE_TEXT, createRetroactiveTrip } from '@/lib/retroactive-trips-api';
import type { Database } from '@/types/database.types';

type PurposeCategory = Database['public']['Enums']['trip_purpose_category'];

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

function shortfall(value: string): string | undefined {
    const n = value.trim().length;
    return value.length > 0 && n < MIN_RETROACTIVE_TEXT ? `Faltam ${MIN_RETROACTIVE_TEXT - n} caracteres.` : undefined;
}

/**
 * Lançamento retroativo (P2.6): passa para o sistema uma viagem anotada na
 * folha de papel no período de transição. Exige o scan da folha e uma
 * justificativa; a viagem nasce concluída, marcada como retroativa e não
 * pode ser apagada (só cancelada/retificada, como as demais).
 */
export function RetroactiveTripModal({ isOpen, onClose }: Props) {
    const qc = useQueryClient();
    const { user } = useAuth();
    const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
    const { data: drivers = [] } = useDrivers();

    const [vehicleId, setVehicleId] = useState('');
    const [driverId, setDriverId] = useState('');
    const [startAt, setStartAt] = useState('');
    const [endAt, setEndAt] = useState('');
    const [startOdo, setStartOdo] = useState('');
    const [endOdo, setEndOdo] = useState('');
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [category, setCategory] = useState<string>('');
    const [purpose, setPurpose] = useState('');
    const [passengers, setPassengers] = useState('');
    const [justification, setJustification] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const reset = () => {
        setVehicleId(''); setDriverId(''); setStartAt(''); setEndAt(''); setStartOdo(''); setEndOdo('');
        setOrigin(''); setDestination(''); setCategory(''); setPurpose(''); setPassengers(''); setJustification(''); setFile(null);
    };

    const startOdometer = startOdo === '' ? NaN : Number(startOdo);
    const endOdometer = endOdo === '' ? NaN : Number(endOdo);
    const periodInvalid = Boolean(startAt && endAt && new Date(endAt) < new Date(startAt));
    const futureStart = Boolean(startAt && new Date(startAt) > new Date());
    const odoInvalid = Number.isFinite(startOdometer) && Number.isFinite(endOdometer) && endOdometer < startOdometer;

    const canSubmit = Boolean(vehicleId && driverId && startAt && endAt && file && destination.trim())
        && !periodInvalid && !futureStart
        && Number.isFinite(startOdometer) && Number.isFinite(endOdometer) && !odoInvalid
        && purpose.trim().length >= MIN_RETROACTIVE_TEXT
        && justification.trim().length >= MIN_RETROACTIVE_TEXT;

    const mutation = useMutation({
        mutationFn: () => createRetroactiveTrip({
            vehicleId,
            driverId,
            startAt: new Date(startAt).toISOString(),
            endAt: new Date(endAt).toISOString(),
            startOdometer,
            endOdometer,
            origin,
            destination,
            purpose,
            purposeCategory: (category || null) as PurposeCategory | null,
            passengerCount: passengers === '' ? null : Number(passengers),
            justification,
            document: file as File,
            tenantId: user?.tenantId ?? '',
        }),
        onSuccess: () => {
            toast.success('Viagem retroativa lançada.');
            qc.invalidateQueries({ queryKey: ['trips'] });
            reset();
            onClose();
        },
        onError: (e) => toast.error(e instanceof Error && e.message ? e.message : 'Não foi possível lançar a viagem.'),
    });

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!mutation.isPending) onClose(); }}
            title="Lançar viagem da folha de papel"
            description="Registra no sistema uma viagem anotada em papel durante a transição. Ela fica marcada como retroativa, com o scan da folha anexado, e não pode ser apagada."
            size="xl"
        >
            <div className="space-y-4">
                <VehiclePickerField vehicles={vehicles} value={vehicleId} onChange={setVehicleId} loading={vehiclesLoading} />
                <SGFSelect
                    label="Motorista"
                    searchable
                    fullWidth
                    value={driverId}
                    onChange={setDriverId}
                    options={[
                        { value: '', label: 'Selecione o motorista' },
                        ...drivers.map((d) => ({ value: d.id, label: d.name ?? d.full_name ?? 'Motorista' })),
                    ]}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <SGFInput label="Saída" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} fullWidth
                        error={futureStart ? 'A saída não pode ser no futuro.' : undefined} />
                    <SGFInput label="Chegada" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} fullWidth
                        error={periodInvalid ? 'A chegada deve ser depois da saída.' : undefined} />
                    <SGFInput label="Km na saída" type="number" min={0} value={startOdo} onChange={(e) => setStartOdo(e.target.value)} fullWidth />
                    <SGFInput label="Km na chegada" type="number" min={0} value={endOdo} onChange={(e) => setEndOdo(e.target.value)} fullWidth
                        error={odoInvalid ? 'O km de chegada deve ser maior ou igual ao de saída.' : undefined} />
                    <SGFInput label="Origem" value={origin} onChange={(e) => setOrigin(e.target.value)} fullWidth placeholder="Ex.: Garagem municipal" />
                    <SGFInput label="Destino" value={destination} onChange={(e) => setDestination(e.target.value)} fullWidth placeholder="Ex.: Hospital Regional" />
                    <SGFSelect
                        label="Categoria da finalidade"
                        fullWidth
                        value={category}
                        onChange={setCategory}
                        options={[
                            { value: '', label: 'Não informada na folha' },
                            ...Object.entries(PURPOSE_CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
                        ]}
                    />
                    <SGFInput label="Passageiros (quantidade)" type="number" min={0} value={passengers} onChange={(e) => setPassengers(e.target.value)} fullWidth />
                </div>
                <SGFTextarea
                    label="Finalidade"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    rows={2}
                    fullWidth
                    maxLength={500}
                    placeholder="Como está escrito na folha. Ex.: Levar paciente para consulta."
                    hint={`Mínimo de ${MIN_RETROACTIVE_TEXT} caracteres.`}
                    error={shortfall(purpose)}
                />
                <SGFTextarea
                    label="Justificativa do lançamento retroativo"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    rows={2}
                    fullWidth
                    maxLength={500}
                    placeholder="Ex.: Período de operação paralela papel + app, folha de setembro/2026."
                    hint={`Mínimo de ${MIN_RETROACTIVE_TEXT} caracteres.`}
                    error={shortfall(justification)}
                />
                <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed p-4 transition ${
                    file ? 'border-emerald-400 bg-white' : 'border-slate-200 bg-white hover:border-blue-300'
                }`}>
                    <FileText className={`h-6 w-6 ${file ? 'text-emerald-600' : 'text-blue-600'}`} />
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-700">
                            {file?.name || 'Anexar scan ou foto da folha de papel (obrigatório)'}
                        </span>
                        <span className="text-xs text-slate-500">PDF ou imagem — guardado como documento privado da viagem</span>
                    </span>
                    <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="sr-only"
                        aria-label="Scan da folha de papel"
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                </label>
                <div className="flex justify-end gap-2">
                    <SGFButton variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</SGFButton>
                    <SGFButton onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>Lançar viagem</SGFButton>
                </div>
            </div>
        </Modal>
    );
}
