import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Car, Fuel, User } from '@/components/sgf/icons';
import { stationsApi, vehiclesApi } from '@/lib/supabase-api';
import { useCreateFuelAuthorization } from '@/hooks/useRefuelings';
import { useAuth } from '@/contexts/AuthContext';
import { formatPlate } from '@/lib/utils';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const FUEL_OPTIONS = [
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
    const { data: stations = [] } = useQuery({ queryKey: ['stations', { activeOnly: true }], queryFn: () => stationsApi.getAll({ activeOnly: true }) });

    const vehicleOptions = useMemo(
        () => vehicles.map((v) => ({
            value: v.id,
            label: `${formatPlate(v.plate) || v.unit_code} — ${v.brand ?? ''} ${v.model ?? ''}`.trim(),
        })),
        [vehicles],
    );
    const stationOptions = useMemo(
        () => [
            { value: '', label: 'Qualquer (motorista decide)' },
            ...stations.map((s) => ({ value: s.id, label: `${s.name}${s.code ? ` (${s.code})` : ''}` })),
        ],
        [stations],
    );

    const [vehicleId, setVehicleId] = useState('');
    const [stationId, setStationId] = useState('');
    const [fuelType, setFuelType] = useState('');
    const [maxLiters, setMaxLiters] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Combustível segue o veículo: específico → trava; flex → só Gasolina/Etanol.
    const FUEL_BY_VEHICLE: Record<string, string> = { DIESEL: 'Diesel', GASOLINE: 'Gasolina', ETHANOL: 'Etanol' };
    const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);
    const vFuel = String((selectedVehicle as { fuel_type?: string } | undefined)?.fuel_type ?? '').toUpperCase();
    const lockedFuel = FUEL_BY_VEHICLE[vFuel]; // undefined quando flex/desconhecido
    const isFlex = vFuel === 'FLEX';

    const fuelOptions = useMemo(() => {
        if (lockedFuel) return [{ value: lockedFuel, label: lockedFuel }];
        if (isFlex) return [
            { value: '', label: 'Selecione (Gasolina ou Etanol)' },
            { value: 'Gasolina', label: 'Gasolina' },
            { value: 'Etanol', label: 'Etanol' },
        ];
        return FUEL_OPTIONS;
    }, [lockedFuel, isFlex]);

    // Ao trocar o veículo: trava no combustível dele (ou limpa, no flex/sem veículo).
    useEffect(() => {
        setFuelType(lockedFuel ?? '');
    }, [vehicleId, lockedFuel]);

    useEffect(() => {
        if (!isOpen) return;
        setVehicleId('');
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
        if (!user?.id) return setError('Sessão inválida — faça login novamente.');

        try {
            await createAuth.mutateAsync({
                vehicle_id: vehicleId,
                // Sem motorista: a autorização fica ligada ao veículo.
                driver_id: null,
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
                <SGFSelect
                    label="Veículo"
                    options={vehicleOptions}
                    value={vehicleId}
                    onChange={setVehicleId}
                    placeholder="Selecione o veículo..."
                    fullWidth
                    icon={Car}
                />
                <p className="-mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    Sem motorista: a autorização aparece para quem estiver com este veículo no app.
                </p>

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
                    <SGFSelect
                        label={lockedFuel ? 'Combustível (do veículo)' : isFlex ? 'Combustível (Flex)' : 'Combustível (opcional)'}
                        options={fuelOptions}
                        value={fuelType}
                        onChange={setFuelType}
                        disabled={!!lockedFuel}
                        fullWidth
                    />
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
