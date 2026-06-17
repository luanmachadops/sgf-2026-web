import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFButton } from '@/components/sgf/SGFButton';
import { VehiclePickerField } from '@/components/sgf/VehiclePickerField';
import { Loader2, Save, Fuel, Calendar, User, Receipt, DollarSign, ArrowUpRight, Camera, X } from '@/components/sgf/icons';
import { refuelingsApi, stationsApi, vehiclesApi } from '@/lib/supabase-api';
import { supabase } from '@/lib/supabase';
import { resizeAndConvertToWebP, isImageFile } from '@/lib/imageUtils';
import { formatPlate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/hooks/useSettings';

// Slot de foto: faz upload ao selecionar e devolve a URL pública.
function PhotoUpload({ label, hint, url, onChange }: { label: string; hint: string; url: string; onChange: (u: string) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!isImageFile(file)) { toast.error('Selecione uma imagem válida.'); return; }
        try {
            setLoading(true);
            const blob = await resizeAndConvertToWebP(file, 1000);
            const fileName = `fuelings/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
            const { error } = await supabase.storage.from('fotos').upload(fileName, blob, { contentType: 'image/webp', upsert: true });
            if (error) throw error;
            onChange(supabase.storage.from('fotos').getPublicUrl(fileName).data.publicUrl);
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao enviar a foto.');
        } finally {
            setLoading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };
    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600">{label}</label>
            <div
                onClick={() => inputRef.current?.click()}
                className={'relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed flex items-center justify-center transition-all ' + (url ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/20')}
            >
                {url ? (
                    <>
                        <img src={url} alt={label} className="absolute inset-0 h-full w-full object-cover" />
                        <button type="button" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-white hover:bg-black/70">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </>
                ) : (
                    <div className="px-2 text-center">
                        {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-500" /> : <Camera className="mx-auto h-6 w-6 text-slate-300" />}
                        <p className="mt-1 text-[11px] font-medium text-slate-500">{loading ? 'Enviando...' : hint}</p>
                    </div>
                )}
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handle} />
            </div>
        </div>
    );
}

interface NewRefuelingFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

const FUEL_OPTIONS = [
    { value: 'Gasolina', label: 'Gasolina' },
    { value: 'Etanol', label: 'Etanol' },
    { value: 'Diesel', label: 'Diesel' },
    { value: 'GNV', label: 'GNV' },
];

export function NewRefuelingForm({ onSuccess, onCancel }: NewRefuelingFormProps) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { data: settings } = useAppSettings();
    const contractMode = settings?.fuelPriceMode === 'contract';

    // Listas reais para os selects
    const { data: vehicles = [] } = useQuery({
        queryKey: ['vehicles', 'form-list'],
        queryFn: () => vehiclesApi.getAll(),
    });
    const { data: stations = [] } = useQuery({
        queryKey: ['stations', 'form-list'],
        queryFn: () => stationsApi.getAll({ activeOnly: true }),
    });

    const [vehicleId, setVehicleId] = useState('');
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [fuelType, setFuelType] = useState('Gasolina');
    const [odometer, setOdometer] = useState<string>('');
    const [liters, setLiters] = useState<string>('');
    const [pricePerLiter, setPricePerLiter] = useState<string>('');
    const [totalValue, setTotalValue] = useState<string>('');
    const [stationId, setStationId] = useState<string>('');
    const [station, setStation] = useState<string>('');
    const [requisitionUrl, setRequisitionUrl] = useState('');
    const [odometerPhotoUrl, setOdometerPhotoUrl] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [askConfirm, setAskConfirm] = useState(false);

    // Auto-calcula total = litros × R$/L (preserva valor manual se usuário digitar diferente)
    useEffect(() => {
        const l = Number(liters);
        const p = Number(pricePerLiter);
        if (l > 0 && p > 0) {
            setTotalValue((l * p).toFixed(2));
        }
    }, [liters, pricePerLiter]);

    // Pré-preenche o odômetro com o atual do veículo selecionado.
    useEffect(() => {
        if (!vehicleId) return;
        const v = vehicles.find((x) => x.id === vehicleId);
        if (v && v.current_odometer != null && !odometer) {
            setOdometer(String(v.current_odometer));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vehicleId]);

    // Combustível segue o veículo: específico → trava; flex → só Gasolina/Etanol.
    const FUEL_BY_VEHICLE: Record<string, string> = { DIESEL: 'Diesel', GASOLINA: 'Gasolina', ETANOL: 'Etanol' };
    const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);
    const vFuel = String((selectedVehicle as { fuel_type?: string } | undefined)?.fuel_type ?? '').toUpperCase();
    const lockedFuel = FUEL_BY_VEHICLE[vFuel]; // undefined quando flex/desconhecido
    const isFlex = vFuel === 'FLEX';
    const fuelOptions = useMemo(() => {
        if (lockedFuel) return [{ value: lockedFuel, label: lockedFuel }];
        if (isFlex) return [
            { value: 'Gasolina', label: 'Gasolina' },
            { value: 'Etanol', label: 'Etanol' },
        ];
        return FUEL_OPTIONS;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lockedFuel, isFlex]);

    // Ao trocar o veículo, ajusta o combustível: trava no do veículo; flex => Gasolina por padrão.
    useEffect(() => {
        if (!vehicleId) return;
        if (lockedFuel) setFuelType(lockedFuel);
        else if (isFlex) setFuelType((cur) => (cur === 'Gasolina' || cur === 'Etanol' ? cur : 'Gasolina'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vehicleId, lockedFuel, isFlex]);

    // Preço da licitação (contrato) do posto para o combustível selecionado.
    const contractPrice = useMemo(() => {
        if (!contractMode || !stationId) return 0;
        const st = stations.find((s) => s.id === stationId);
        const prices = (st as { fuel_prices?: Record<string, number> } | undefined)?.fuel_prices ?? {};
        return Number(prices[fuelType] ?? 0);
    }, [contractMode, stationId, fuelType, stations]);

    const priceLocked = contractMode && contractPrice > 0;
    // Posto selecionado sem preço de licitação para o combustível escolhido.
    const noContractForFuel = contractMode && !!stationId && contractPrice <= 0;

    useEffect(() => {
        if (priceLocked) setPricePerLiter(String(contractPrice));
    }, [priceLocked, contractPrice]);

    // Reabre a confirmação se mudar posto/combustível/veículo.
    useEffect(() => { setAskConfirm(false); }, [stationId, fuelType, vehicleId]);

    // Anomalia: litros acima da capacidade do tanque (quando habilitado nas configurações).
    const tankCapacity = useMemo(() => {
        const v = vehicles.find((x) => x.id === vehicleId);
        return v?.tank_capacity ? Number(v.tank_capacity) : 0;
    }, [vehicles, vehicleId]);
    const overflow = Boolean(settings?.tankOverflowAlert) && tankCapacity > 0 && Number(liters) > tankCapacity;

    const createMutation = useMutation({
        mutationFn: refuelingsApi.create,
    });

    const isSaving = createMutation.isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!vehicleId) return setError('Selecione o veículo.');
        // Bloqueio: posto sem licitação para este combustível exige confirmação explícita.
        if (noContractForFuel && !askConfirm) { setAskConfirm(true); return; }
        if (!user?.id) return setError('Sessão expirada. Faça login novamente.');
        if (!liters || Number(liters) <= 0) return setError('Informe a quantidade de litros.');
        if (!pricePerLiter || Number(pricePerLiter) <= 0) return setError('Informe o preço por litro.');
        if (!odometer || Number(odometer) < 0) return setError('Informe o odômetro.');

        try {
            await createMutation.mutateAsync({
                vehicle_id: vehicleId,
                driver_id: user.id,
                fuel_type: fuelType,
                liters: Number(liters),
                price_per_liter: Number(pricePerLiter),
                total_cost: Number(totalValue),
                odometer: Number(odometer),
                station_id: stationId || null,
                // Snapshot do nome do posto (caso o cadastro mude depois)
                station: stationId ? (stations.find((s) => s.id === stationId)?.name ?? null) : (station.trim() || null),
                date,
                photo_requisition_url: requisitionUrl || null,
                photo_dashboard_url: odometerPhotoUrl || null,
                require_validation: Boolean(settings?.requireFuelValidation),
                has_anomaly: overflow,
                anomaly_type: overflow ? 'Litros acima da capacidade do tanque' : null,
            });
            await queryClient.invalidateQueries({ queryKey: ['refuelings'] });
            await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            await queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] });
            toast.success(settings?.requireFuelValidation
                ? 'Abastecimento enviado para validação!'
                : 'Abastecimento registrado com sucesso!');
            if (overflow) toast.warning('Atenção: litros acima da capacidade do tanque — marcado como anomalia.');
            onSuccess();
        } catch (err) {
            const message = (err as { message?: string })?.message ?? 'Erro ao registrar o abastecimento.';
            setError(message);
            toast.error(message);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <VehiclePickerField
                    vehicles={vehicles}
                    value={vehicleId}
                    onChange={setVehicleId}
                />

                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Motorista</p>
                        <p className="truncate text-sm font-semibold text-slate-800">{user?.name ?? 'Você'} (você)</p>
                    </div>
                </div>

                <SGFInput
                    label="Data do Abastecimento"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    fullWidth
                    icon={Calendar}
                />
                <SGFSelect
                    label={lockedFuel ? 'Combustível (do veículo)' : isFlex ? 'Combustível (Flex)' : 'Combustível'}
                    options={fuelOptions}
                    value={fuelType}
                    onChange={(val) => setFuelType(val)}
                    disabled={!!lockedFuel}
                    fullWidth
                    icon={Fuel}
                />

                <SGFInput
                    label="Odômetro Atual (km)"
                    type="number"
                    placeholder="Ex: 45230"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    fullWidth
                    icon={ArrowUpRight}
                />
                <SGFSelect
                    label="Posto"
                    options={[
                        { value: '', label: 'Outro / livre' },
                        ...stations.map((s) => ({ value: s.id, label: `${s.name}${s.code ? ` (${s.code})` : ''}` })),
                    ]}
                    value={stationId}
                    onChange={(val) => setStationId(val)}
                    placeholder="Selecione o posto..."
                    fullWidth
                />
                {!stationId && (
                    <SGFInput
                        label="Nome do posto (livre)"
                        placeholder="Ex.: Auto Posto Central"
                        value={station}
                        onChange={(e) => setStation(e.target.value)}
                        fullWidth
                    />
                )}

                <div className="grid grid-cols-2 gap-4">
                    <SGFInput
                        label="Litros"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={liters}
                        onChange={(e) => setLiters(e.target.value)}
                        fullWidth
                    />
                    <SGFInput
                        label="Preço por Litro"
                        type="number"
                        step="0.001"
                        placeholder="0.000"
                        value={pricePerLiter}
                        onChange={(e) => setPricePerLiter(e.target.value)}
                        fullWidth
                        disabled={priceLocked}
                        hint={
                            contractMode
                                ? (priceLocked
                                    ? 'Preço da licitação (fixo)'
                                    : noContractForFuel
                                        ? `Sem licitação de ${fuelType} neste posto — informe o preço`
                                        : 'Selecione um posto com preço de licitação cadastrado')
                                : undefined
                        }
                    />
                </div>

                <div className="md:col-span-2">
                    <SGFInput
                        label="Valor Total (R$)"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={totalValue}
                        onChange={(e) => setTotalValue(e.target.value)}
                        fullWidth
                        icon={DollarSign}
                    />
                </div>
            </div>

            {/* Comprovantes (igual ao app do motorista) */}
            <div className="rounded-2xl border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-bold text-slate-700">Comprovantes</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <PhotoUpload label="Foto da requisição" hint="Toque para foto/galeria" url={requisitionUrl} onChange={setRequisitionUrl} />
                    <PhotoUpload label="Foto do odômetro" hint="Painel com a quilometragem" url={odometerPhotoUrl} onChange={setOdometerPhotoUrl} />
                </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3">
                <Receipt className="h-5 w-5 text-slate-400" />
                <p className="text-xs text-slate-500 font-medium">
                    O km/L será calculado automaticamente a partir do último abastecimento deste veículo.
                </p>
            </div>

            {overflow && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                    Os litros informados ({Number(liters).toLocaleString('pt-BR')} L) ultrapassam a capacidade do tanque ({tankCapacity} L). O registro será marcado como anomalia.
                </div>
            )}

            {askConfirm && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                    <p className="font-bold">Posto sem licitação para {fuelType || 'este combustível'}</p>
                    <p className="mt-1 text-amber-700">
                        O posto selecionado não possui preço de licitação cadastrado para <strong>{fuelType}</strong>. Deseja prosseguir mesmo assim e informar o preço manualmente?
                    </p>
                    <div className="mt-3 flex gap-2">
                        <SGFButton type="button" variant="ghost" className="!text-slate-600" onClick={() => setAskConfirm(false)}>
                            Não, cancelar
                        </SGFButton>
                        <SGFButton type="submit" className="!bg-amber-600 hover:!bg-amber-700" disabled={isSaving}>
                            Sim, abastecer assim mesmo
                        </SGFButton>
                    </div>
                </div>
            )}

            {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                    {error}
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <SGFButton type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
                    Cancelar
                </SGFButton>
                <SGFButton type="submit" icon={isSaving ? Loader2 : Save} disabled={isSaving}>
                    {isSaving ? 'Registrando...' : 'Registrar Abastecimento'}
                </SGFButton>
            </div>
        </form>
    );
}
