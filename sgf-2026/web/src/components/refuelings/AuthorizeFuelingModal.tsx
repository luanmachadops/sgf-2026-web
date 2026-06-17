import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Car, Fuel, User } from '@/components/sgf/icons';
import { driversApi, stationsApi, vehiclesApi } from '@/lib/supabase-api';
import { useCreateFuelAuthorization } from '@/hooks/useRefuelings';
import { useAuth } from '@/contexts/AuthContext';
import { formatPlate } from '@/lib/utils';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

/** Map DB fuel_type values to the label used in the authorization form. */
const DB_FUEL_TO_LABEL: Record<string, string> = {
    diesel: 'Diesel',
    gasolina: 'Gasolina',
    etanol: 'Etanol',
    // UPPERCASE variants coming from decorateVehicle / webToDb mappings
    DIESEL: 'Diesel',
    GASOLINE: 'Gasolina',
    ETHANOL: 'Etanol',
};

const ALL_FUEL_OPTIONS = [
    { value: '', label: 'Qualquer (motorista decide)' },
    { value: 'Gasolina', label: 'Gasolina' },
    { value: 'Etanol', label: 'Etanol' },
    { value: 'Diesel', label: 'Diesel' },
    { value: 'GNV', label: 'GNV' },
];

export function AuthorizeFuelingModal({ isOpen, onClose }: Props) {
    const { user } = useAuth();
    const createAuth = useCreateFuelAuthorization();

    const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles', 'all'], queryFn: () => vehiclesApi.getAll() });
    const { data: drivers = [] }  = useQuery({ queryKey: ['drivers', 'all'], queryFn: () => driversApi.getAll() });
    const { data: stations = [] } = useQuery({ queryKey: ['stations', { activeOnly: true }], queryFn: () => stationsApi.getAll({ activeOnly: true }) });

    const vehicleOptions = useMemo(
        () => vehicles.map((v) => ({
            value: v.id,
            label: `${formatPlate(v.plate) || v.unit_code} — ${v.brand ?? ''} ${v.model ?? ''}`.trim(),
        })),
        [vehicles],
    );
    const driverOptions = useMemo(
        () => drivers.map((d) => ({ value: d.id, label: (d as { full_name?: string; name?: string }).full_name ?? d.name ?? 'Motorista' })),
        [drivers],
    );

    const [vehicleId, setVehicleId] = useState('');
    const [driverId, setDriverId] = useState('');
    const [stationId, setStationId] = useState('');
    const [fuelType, setFuelType] = useState('');
    const [maxLiters, setMaxLiters] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);

    // ── Derive fuel options based on selected vehicle ──────────────────
    const selectedVehicle = useMemo(
        () => vehicles.find((v) => v.id === vehicleId),
        [vehicles, vehicleId],
    );

    const rawFuelType = selectedVehicle?.fuel_type as string | null | undefined;
    const normalizedFuel = (rawFuelType ?? '').toLowerCase();
    const isFlex = normalizedFuel === 'flex';
    const isSpecific = !isFlex && !!DB_FUEL_TO_LABEL[rawFuelType ?? ''];
    const specificLabel = isSpecific ? DB_FUEL_TO_LABEL[rawFuelType!] : null;

    const allowedFuels = useMemo(() => {
        if (!vehicleId || !rawFuelType) return null; // all allowed
        if (isFlex) return ['Gasolina', 'Etanol'];
        if (isSpecific && specificLabel) {
            // Se for Diesel, pode ser que o posto tenha 'Diesel' ou 'Diesel S10' (baseado nas strings do admin)
            if (specificLabel === 'Diesel') return ['Diesel', 'Diesel S10'];
            return [specificLabel];
        }
        return null;
    }, [vehicleId, rawFuelType, isFlex, isSpecific, specificLabel]);

    const fuelOptions = useMemo(() => {
        if (!vehicleId || !rawFuelType) return ALL_FUEL_OPTIONS;           // sem veículo → todas
        if (isSpecific && specificLabel) return [{ value: specificLabel, label: specificLabel }]; // travado
        if (isFlex) return [                                               // flex → só Gasolina/Etanol
            { value: 'Gasolina', label: 'Gasolina' },
            { value: 'Etanol', label: 'Etanol' },
        ];
        return ALL_FUEL_OPTIONS;                                           // qualquer outro caso
    }, [vehicleId, rawFuelType, isSpecific, specificLabel, isFlex]);

    const isFuelLocked = isSpecific && !!specificLabel;

    const stationOptions = useMemo(() => {
        const filteredStations = stations.filter(s => {
            if (!allowedFuels) return true; // Veículo não selecionado ou sem restrição
            const sFuels = s.fuel_types || [];
            if (sFuels.length === 0) return false; // Posto sem combustíveis licitados não pode ser usado
            return allowedFuels.some(f => sFuels.includes(f));
        });

        return [
            { value: '', label: 'Qualquer (motorista decide)' },
            ...filteredStations.map((s) => ({ value: s.id, label: `${s.name}${s.code ? ` (${s.code})` : ''}` })),
        ];
    }, [stations, allowedFuels]);

    // Auto-set fuel and clear invalid station when vehicle changes
    useEffect(() => {
        // Clear station if the selected station is no longer in the valid options
        if (stationId) {
            const isValidStation = stationOptions.some(opt => opt.value === stationId);
            if (!isValidStation) setStationId('');
        }

        if (!vehicleId || !rawFuelType) { setFuelType(''); return; }
        if (isSpecific && specificLabel) { setFuelType(specificLabel); return; }
        if (isFlex) { setFuelType(''); return; }                          // motorista decide entre Gasolina/Etanol
        setFuelType('');
    }, [vehicleId, rawFuelType, isSpecific, specificLabel, isFlex, stationOptions, stationId]);

    // Reset all fields when modal opens
    useEffect(() => {
        if (!isOpen) return;
        setVehicleId('');
        setDriverId('');
        setStationId('');
        setFuelType('');
        setMaxLiters('');
        setNotes('');
        setError(null);
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!vehicleId) return setError('Selecione o veículo.');
        if (!driverId) return setError('Selecione o motorista.');
        if (!user?.id) return setError('Sessão inválida — faça login novamente.');

        try {
            await createAuth.mutateAsync({
                vehicle_id: vehicleId,
                driver_id: driverId,
                authorized_by: user.id,
                station_id: stationId || null,
                fuel_type: fuelType || null,
                max_liters: maxLiters ? Number(maxLiters) : null,
                notes: notes.trim() || null,
            });
            toast.success('Autorização criada. O motorista verá no app.');
            onClose();
        } catch (err) {
            const message = (err as { message?: string })?.message ?? 'Erro ao criar autorização.';
            setError(message);
            toast.error(message);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Autorizar abastecimento"
            description="Pré-libere um abastecimento para que o motorista realize no posto."
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose} disabled={createAuth.isPending}>Cancelar</SGFButton>
                    <SGFButton onClick={handleSubmit as unknown as () => void} disabled={createAuth.isPending}>
                        {createAuth.isPending ? 'Enviando...' : 'Enviar autorização'}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFSelect
                        label="Veículo"
                        options={vehicleOptions}
                        value={vehicleId}
                        onChange={setVehicleId}
                        placeholder="Selecione o veículo..."
                        fullWidth
                        icon={Car}
                    />
                    <SGFSelect
                        label="Motorista"
                        options={driverOptions}
                        value={driverId}
                        onChange={setDriverId}
                        placeholder="Selecione o motorista..."
                        fullWidth
                        icon={User}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFSelect
                        label="Posto (opcional)"
                        options={stationOptions}
                        value={stationId}
                        onChange={setStationId}
                        placeholder="Selecione o posto..."
                        fullWidth
                        icon={Fuel}
                    />
                    <div>
                        <SGFSelect
                            label="Combustível"
                            options={fuelOptions}
                            value={fuelType}
                            onChange={setFuelType}
                            fullWidth
                            disabled={isFuelLocked}
                        />
                        {isFuelLocked && (
                            <p className="mt-1 text-xs text-amber-600 font-medium">
                                🔒 Combustível definido pelo cadastro do veículo ({specificLabel})
                            </p>
                        )}
                        {isFlex && (
                            <p className="mt-1 text-xs text-blue-600 font-medium">
                                ⛽ Veículo flex — selecione Gasolina ou Etanol
                            </p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="Limite de litros (opcional)"
                        type="number"
                        step="0.01"
                        value={maxLiters}
                        onChange={(e) => setMaxLiters(e.target.value)}
                        placeholder="Ex.: 50 — deixe vazio para sem limite"
                        fullWidth
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold uppercase mb-2 text-slate-500">Observações para o motorista (opcional)</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500"
                        placeholder="Ex.: Abastecer com 30 L de Etanol e voltar para a Secretaria."
                    />
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs text-emerald-700">
                    <strong>Como funciona:</strong> o motorista verá a autorização no app, vai até o posto, abastece e
                    envia a foto da requisição + foto do painel. O abastecimento volta para você validar.
                </div>

                {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                        {error}
                    </div>
                )}
            </form>
        </Modal>
    );
}

export default AuthorizeFuelingModal;

