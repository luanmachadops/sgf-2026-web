import { useEffect, useMemo, useState, useRef } from 'react';
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
import { getStationUnavailableReason } from '@/lib/stationStatus';

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
    // Busca todos os postos (inclusive inativos) para poder listá-los desabilitados/opacos em vez de escondê-los.
    const { data: stations = [] } = useQuery({ queryKey: ['stations', { activeOnly: false }], queryFn: () => stationsApi.getAll() });

    const stationOptions = useMemo(
        () => [
            { value: '', label: 'Qualquer (motorista decide)' },
            ...stations.map((s) => {
                const unavailable = getStationUnavailableReason(s);
                return {
                    value: s.id,
                    label: `${s.name}${s.code ? ` (${s.code})` : ''}${unavailable ? ` — ${unavailable}` : ''}`,
                    disabled: !!unavailable,
                    disabledReason: unavailable ?? undefined,
                };
            }),
        ],
        [stations],
    );

    const [vehicleId, setVehicleId] = useState('');
    const [vehicleSearch, setVehicleSearch] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    const [stationId, setStationId] = useState('');
    const [fuelType, setFuelType] = useState('');
    const [maxLiters, setMaxLiters] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);

    const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);

    const filteredVehicles = useMemo(() => {
        const search = vehicleSearch.toLowerCase().trim();
        if (!search) return vehicles;
        return vehicles.filter(
            (v) =>
                (v.plate || '').toLowerCase().includes(search) ||
                (v.brand || '').toLowerCase().includes(search) ||
                (v.model || '').toLowerCase().includes(search) ||
                (v.unit_code || '').toLowerCase().includes(search)
        );
    }, [vehicles, vehicleSearch]);

    // Combustível segue o veículo: específico → trava; flex → só Gasolina/Etanol.
    const FUEL_BY_VEHICLE: Record<string, string> = { DIESEL: 'Diesel', GASOLINE: 'Gasolina', ETHANOL: 'Etanol' };
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

    // Fecha a lista de sugestões ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Ao trocar o veículo: trava no combustível dele (ou limpa, no flex/sem veículo).
    useEffect(() => {
        setFuelType(lockedFuel ?? '');
    }, [vehicleId, lockedFuel]);

    useEffect(() => {
        if (!isOpen) return;
        setVehicleId('');
        setVehicleSearch('');
        setShowSuggestions(false);
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

        if (stationId) {
            const chosenStation = stations.find((s) => s.id === stationId);
            const unavailable = chosenStation ? getStationUnavailableReason(chosenStation) : null;
            if (unavailable) return setError(`Não é possível autorizar neste posto: ${unavailable}.`);
        }

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
                {/* Seleção do Veículo com fotos (list box idêntico ao de Infrações) */}
                {selectedVehicle ? (
                    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3.5 animate-in fade-in duration-200">
                        {selectedVehicle.photo_url ? (
                            <img
                                src={selectedVehicle.photo_url}
                                alt={`${selectedVehicle.brand} ${selectedVehicle.model}`}
                                className="h-12 w-12 shrink-0 rounded-xl object-cover border border-slate-100 shadow-sm"
                            />
                        ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                                <Car className="h-6 w-6" />
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="font-mono text-base font-bold text-slate-900">
                                {formatPlate(selectedVehicle.plate) || selectedVehicle.unit_code}
                            </p>
                            <p className="text-xs font-semibold text-slate-700">
                                {selectedVehicle.brand} {selectedVehicle.model}
                            </p>
                            {selectedVehicle.departments?.name && (
                                <p className="text-[11px] text-slate-400">{selectedVehicle.departments.name}</p>
                            )}
                        </div>
                        <SGFButton
                            type="button"
                            variant="outline"
                            size="sm"
                            className="!text-rose-600 !border-rose-200 hover:!bg-rose-50 !rounded-full shrink-0"
                            onClick={() => {
                                setVehicleId('');
                                setVehicleSearch('');
                            }}
                        >
                            Alterar veículo
                        </SGFButton>
                    </div>
                ) : (
                    <div className="relative" ref={suggestionsRef}>
                        <SGFInput
                            label="Veículo"
                            value={vehicleSearch}
                            onChange={(e) => {
                                setVehicleSearch(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            placeholder="Buscar por placa ou modelo..."
                            fullWidth
                            icon={Car}
                        />
                        {showSuggestions && filteredVehicles.length > 0 && (
                            <div className="absolute z-[3000] left-0 right-0 top-full mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-lg custom-scrollbar">
                                {filteredVehicles.map((v) => (
                                    <button
                                        key={v.id}
                                        type="button"
                                        onClick={() => {
                                            setVehicleId(v.id);
                                            setShowSuggestions(false);
                                        }}
                                        className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-left hover:bg-emerald-50 transition-colors cursor-pointer"
                                    >
                                        {v.photo_url ? (
                                            <img
                                                src={v.photo_url}
                                                alt={`${v.brand} ${v.model}`}
                                                className="h-8 w-8 shrink-0 rounded-full object-cover border border-slate-100"
                                            />
                                        ) : (
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                                <Car className="h-4.5 w-4.5" />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-mono text-sm font-bold text-slate-900">
                                                {formatPlate(v.plate) || v.unit_code}
                                                {v.departments?.name && (
                                                    <span className="ml-2 font-sans text-xs font-normal text-slate-400">
                                                        · {v.departments.name}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-slate-500 truncate">
                                                {v.brand} {v.model}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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
