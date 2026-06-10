import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { FileText, Plus, X, Download, Loader2, Camera } from '@/components/sgf/icons';
import { departmentsApi, vehiclesApi } from '@/lib/supabase-api';
import { supabase } from '@/lib/supabase';
import { resizeAndConvertToWebP, isImageFile, prepareUpload } from '@/lib/imageUtils';
import type { Tables, TablesUpdate } from '@/types/database.types';

// Mesma lista usada no cadastro (Novo Veículo). + "Outro" para digitar livre.
const KNOWN_BRANDS = [
    'Fiat', 'Volkswagen', 'Chevrolet', 'Ford', 'Renault', 'Toyota', 'Hyundai',
    'Honda', 'Nissan', 'Citroën', 'Peugeot', 'Mitsubishi', 'Jeep', 'Kia',
    'Mercedes-Benz', 'Iveco', 'Scania', 'Volvo', 'MAN', 'JAC',
] as const;
const OTHER_BRAND_VALUE = '__other__';

type Vehicle = Tables<'vehicles'>;

export interface EditVehicleModalProps {
    isOpen: boolean;
    onClose: () => void;
    vehicle: Vehicle;
}

export function EditVehicleModal({ isOpen, onClose, vehicle }: EditVehicleModalProps) {
    const queryClient = useQueryClient();

    const [plate, setPlate] = useState('');
    const [brandSelect, setBrandSelect] = useState('');
    const [brand, setBrand] = useState('');
    const [model, setModel] = useState('');
    const [year, setYear] = useState<string>('');
    const [vehicleType, setVehicleType] = useState('');
    const [fuelType, setFuelType] = useState<'DIESEL' | 'GASOLINE' | 'ETHANOL' | 'FLEX'>('FLEX');
    const [tankCapacity, setTankCapacity] = useState<string>('');
    const [currentOdometer, setCurrentOdometer] = useState<string>('');
    const [departmentId, setDepartmentId] = useState('');
    const [status, setStatus] = useState<'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE'>('AVAILABLE');
    const [insuranceExpiry, setInsuranceExpiry] = useState<string>('');
    const [color, setColor] = useState<string>('');
    const [renavam, setRenavam] = useState<string>('');
    const [chassis, setChassis] = useState<string>('');
    const [documentUrl, setDocumentUrl] = useState<string>('');
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [photoUrl, setPhotoUrl] = useState<string>('');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const docInputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const { data: departments = [] } = useQuery({
        queryKey: ['departments', 'list-all'],
        queryFn: () => departmentsApi.getAll(),
    });

    const brandOptions = useMemo(
        () => [
            ...KNOWN_BRANDS.map((b) => ({ value: b, label: b })),
            { value: OTHER_BRAND_VALUE, label: 'Outro (digitar)' },
        ],
        [],
    );

    const departmentOptions = useMemo(
        () => departments.map((d) => ({ value: d.id, label: d.name })),
        [departments],
    );

    // Carrega valores do veículo quando o modal abrir
    useEffect(() => {
        if (!isOpen) return;
        setPlate(vehicle.plate ?? '');
        const knownBrand = (KNOWN_BRANDS as readonly string[]).includes(vehicle.brand ?? '');
        setBrandSelect(knownBrand ? (vehicle.brand ?? '') : (vehicle.brand ? OTHER_BRAND_VALUE : ''));
        setBrand(vehicle.brand ?? '');
        setModel(vehicle.model ?? '');
        setYear(vehicle.year != null ? String(vehicle.year) : '');
        setVehicleType(vehicle.vehicle_type ?? '');
        // O VehicleRecord (decorado) traz status/fuel_type em UPPERCASE EN.
        // Já o Tables<'vehicles'> bruto trá em pt-BR — aceitamos os dois.
        const ft = String(vehicle.fuel_type ?? '').toLowerCase();
        setFuelType(
            ft === 'diesel' ? 'DIESEL'
            : ft === 'gasolina' ? 'GASOLINE'
            : ft === 'etanol' ? 'ETHANOL'
            : ft === 'flex' ? 'FLEX'
            : (vehicle.fuel_type as 'DIESEL' | 'GASOLINE' | 'ETHANOL' | 'FLEX') ?? 'FLEX'
        );
        setTankCapacity(vehicle.tank_capacity != null ? String(vehicle.tank_capacity) : '');
        setCurrentOdometer(vehicle.current_odometer != null ? String(vehicle.current_odometer) : '0');
        setDepartmentId(vehicle.department_id ?? '');
        const s = String(vehicle.status ?? '').toLowerCase();
        setStatus(
            s === 'liberado' ? 'AVAILABLE'
            : s === 'manutencao' ? 'MAINTENANCE'
            : s === 'bloqueado' ? 'INACTIVE'
            : (vehicle.status as 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE') ?? 'AVAILABLE'
        );
        setInsuranceExpiry(vehicle.insurance_expiry ?? '');
        setColor((vehicle as { color?: string | null }).color ?? '');
        setRenavam((vehicle as { renavam?: string | null }).renavam ?? '');
        setChassis((vehicle as { chassis?: string | null }).chassis ?? '');
        setDocumentUrl((vehicle as { document_url?: string | null }).document_url ?? '');
        setPhotoUrl((vehicle as { photo_url?: string | null }).photo_url ?? '');
        setError(null);
    }, [isOpen, vehicle]);

    const uploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingDoc(true);
            const prepared = await prepareUpload(file, { maxSize: 1400, quality: 0.8 });
            const safe = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.\-]+/g, '_');
            const fileName = `vehicle-docs/${vehicle.id}-${Date.now()}-${safe}.${prepared.ext}`;
            const { error: upErr } = await supabase.storage.from('fotos').upload(fileName, prepared.blob, {
                contentType: prepared.contentType,
                upsert: true,
            });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
            setDocumentUrl(publicUrl);
            toast.success('Documento anexado. Salve para confirmar.');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao enviar o documento.');
        } finally {
            setUploadingDoc(false);
            if (docInputRef.current) docInputRef.current.value = '';
        }
    };

    const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!isImageFile(file)) { toast.error('Selecione uma imagem válida.'); return; }
        try {
            setUploadingPhoto(true);
            const blob = await resizeAndConvertToWebP(file, 1000);
            const fileName = `vehicles/${vehicle.id}-${Date.now()}.webp`;
            const { error: upErr } = await supabase.storage.from('fotos').upload(fileName, blob, { contentType: 'image/webp', upsert: true });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
            setPhotoUrl(publicUrl);
            toast.success('Foto anexada. Salve para confirmar.');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao enviar a foto.');
        } finally {
            setUploadingPhoto(false);
            if (photoInputRef.current) photoInputRef.current.value = '';
        }
    };

    const updateMutation = useMutation({
        mutationFn: (payload: TablesUpdate<'vehicles'>) => vehiclesApi.update(vehicle.id, payload),
    });

    const isSaving = updateMutation.isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!brand.trim()) return setError('Informe a marca do veículo.');
        if (!model.trim()) return setError('Informe o modelo.');
        if (!year || Number(year) < 1900) return setError('Ano inválido.');
        if (!tankCapacity || Number(tankCapacity) <= 0) return setError('Informe a capacidade do tanque.');
        if (!departmentId) return setError('Selecione a secretaria.');

        const payload: TablesUpdate<'vehicles'> = {
            plate: plate.trim().toUpperCase() || null,
            brand: brand.trim(),
            model: model.trim(),
            year: Number(year),
            vehicle_type: vehicleType.trim() || null,
            fuel_type: fuelType as unknown as TablesUpdate<'vehicles'>['fuel_type'],
            tank_capacity: Number(tankCapacity),
            current_odometer: Number(currentOdometer) || 0,
            department_id: departmentId,
            status: status as unknown as TablesUpdate<'vehicles'>['status'],
            insurance_expiry: insuranceExpiry || null,
            color: color.trim() || null,
            renavam: renavam.trim() || null,
            chassis: chassis.trim() || null,
            document_url: documentUrl || null,
            photo_url: photoUrl || null,
        };

        try {
            await updateMutation.mutateAsync(payload);
            await queryClient.invalidateQueries({ queryKey: ['vehicle', vehicle.id] });
            await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            toast.success('Veículo atualizado com sucesso!');
            onClose();
        } catch (err) {
            const message = (err as { message?: string })?.message ?? 'Erro ao atualizar o veículo.';
            setError(message);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Editar veículo"
            description="Atualize os dados do veículo."
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</SGFButton>
                    <SGFButton onClick={handleSubmit as unknown as () => void} disabled={isSaving}>
                        {isSaving ? 'Salvando...' : 'Salvar alterações'}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="Placa"
                        value={plate}
                        onChange={(e) => setPlate(e.target.value.toUpperCase())}
                        placeholder="ABC-1234"
                        fullWidth
                    />
                    <div className="space-y-2">
                        <SGFSelect
                            label="Marca"
                            options={brandOptions}
                            value={brandSelect}
                            onChange={(val) => {
                                setBrandSelect(val);
                                if (val === OTHER_BRAND_VALUE) setBrand('');
                                else setBrand(val);
                            }}
                            placeholder="Selecione a marca"
                            fullWidth
                        />
                        {brandSelect === OTHER_BRAND_VALUE && (
                            <SGFInput
                                placeholder="Digite a marca"
                                value={brand}
                                onChange={(e) => setBrand(e.target.value)}
                                fullWidth
                                autoFocus
                            />
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="Modelo"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        fullWidth
                    />
                    <SGFInput
                        label="Ano"
                        type="number"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        fullWidth
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFSelect
                        label="Combustível"
                        options={[
                            { value: 'GASOLINE', label: 'Gasolina' },
                            { value: 'ETHANOL', label: 'Etanol' },
                            { value: 'DIESEL', label: 'Diesel' },
                            { value: 'FLEX', label: 'Flex' },
                        ]}
                        value={fuelType}
                        onChange={(val) => setFuelType(val as typeof fuelType)}
                        fullWidth
                    />
                    <SGFInput
                        label="Capacidade do tanque (L)"
                        type="number"
                        step="0.01"
                        value={tankCapacity}
                        onChange={(e) => setTankCapacity(e.target.value)}
                        fullWidth
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="Odômetro atual (km)"
                        type="number"
                        value={currentOdometer}
                        onChange={(e) => setCurrentOdometer(e.target.value)}
                        fullWidth
                    />
                    <SGFInput
                        label="Tipo / Categoria"
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        placeholder="Ex.: Pickup, Caminhão, SUV"
                        fullWidth
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFSelect
                        label="Secretaria"
                        options={departmentOptions}
                        value={departmentId}
                        onChange={(val) => setDepartmentId(val)}
                        placeholder="Selecione a secretaria"
                        fullWidth
                    />
                    <SGFSelect
                        label="Status"
                        options={[
                            { value: 'AVAILABLE', label: 'Disponível' },
                            { value: 'IN_USE', label: 'Em uso' },
                            { value: 'MAINTENANCE', label: 'Manutenção' },
                            { value: 'INACTIVE', label: 'Inativo' },
                        ]}
                        value={status}
                        onChange={(val) => setStatus(val as typeof status)}
                        fullWidth
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput label="Cor" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Ex.: Branco" fullWidth />
                    <SGFInput label="Vencimento do seguro" type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} fullWidth />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput label="RENAVAM" value={renavam} onChange={(e) => setRenavam(e.target.value)} fullWidth />
                    <SGFInput label="Chassi" value={chassis} onChange={(e) => setChassis(e.target.value)} fullWidth />
                </div>

                {/* Foto do veículo */}
                <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center gap-4">
                        <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            {photoUrl ? (
                                <img src={photoUrl} alt="Foto do veículo" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-300"><Camera className="h-7 w-7" /></div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-slate-700">Foto do veículo</h4>
                            <p className="text-xs text-slate-400">Aparece na ficha e nas listagens.</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <SGFButton type="button" variant="secondary" size="sm" icon={uploadingPhoto ? Loader2 : Camera} disabled={uploadingPhoto} onClick={() => photoInputRef.current?.click()}>
                                {uploadingPhoto ? 'Enviando...' : (photoUrl ? 'Trocar foto' : 'Adicionar')}
                            </SGFButton>
                            {photoUrl && (
                                <button type="button" onClick={() => setPhotoUrl('')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600" title="Remover">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            <input ref={photoInputRef} type="file" accept="image/*" onChange={uploadPhoto} className="hidden" />
                        </div>
                    </div>
                </div>

                {/* Documento (PDF) */}
                <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h4 className="text-sm font-bold text-slate-700">Documento do veículo (PDF)</h4>
                            <p className="text-xs text-slate-400">CRLV ou outro documento. Disponível para download na ficha.</p>
                        </div>
                        <SGFButton type="button" variant="secondary" size="sm" icon={uploadingDoc ? Loader2 : Plus} disabled={uploadingDoc} onClick={() => docInputRef.current?.click()}>
                            {uploadingDoc ? 'Enviando...' : (documentUrl ? 'Substituir' : 'Anexar')}
                        </SGFButton>
                        <input ref={docInputRef} type="file" accept="application/pdf,image/*" onChange={uploadDocument} className="hidden" />
                    </div>
                    {documentUrl ? (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">Documento anexado</span>
                            <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-emerald-600" title="Baixar">
                                <Download className="h-4 w-4" />
                            </a>
                            <button type="button" onClick={() => setDocumentUrl('')} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600" title="Remover">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400">Nenhum documento anexado.</p>
                    )}
                </div>

                {error && (
                    <div className="rounded-[var(--sgf-radius-base)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                        {error}
                    </div>
                )}
            </form>
        </Modal>
    );
}

export default EditVehicleModal;
