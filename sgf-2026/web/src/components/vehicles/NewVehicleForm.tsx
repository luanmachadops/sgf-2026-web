import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Save, Camera, Sparkles, X, ChevronDown } from '@/components/sgf/icons';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { departmentsApi, vehiclesApi } from '@/lib/supabase-api';
import { supabase } from '@/lib/supabase';
import { resizeAndConvertToWebP, isImageFile } from '@/lib/imageUtils';
import { uploadPrivateDoc } from '@/lib/docStorage';
import { extractVehicleFromImages, VEHICLE_TYPES } from '@/lib/vehicleAI';
import type { TablesInsert } from '@/types/database.types';
import { useAuth } from '@/contexts/AuthContext';

const KNOWN_BRANDS = [
    'Fiat', 'Volkswagen', 'Chevrolet', 'Ford', 'Renault', 'Toyota', 'Hyundai',
    'Honda', 'Nissan', 'Citroën', 'Peugeot', 'Mitsubishi', 'Jeep', 'Kia',
    'Mercedes-Benz', 'Iveco', 'Scania', 'Volvo', 'MAN', 'JAC',
] as const;
const OTHER_BRAND_VALUE = '__other__';

const vehicleSchema = z.object({
    plate: z.string().min(7, 'Placa inválida').max(8, 'Placa inválida'),
    brand: z.string().min(1, 'Marca é obrigatória'),
    model: z.string().min(1, 'Modelo é obrigatório'),
    year: z.coerce.number().min(1900, 'Ano inválido').max(new Date().getFullYear() + 1, 'Ano inválido'),
    fuelType: z.enum(['DIESEL', 'GASOLINE', 'ETHANOL', 'FLEX'], { error: 'Combustível é obrigatório' }),
    tankCapacity: z.coerce.number().min(1, 'Capacidade do tanque é obrigatória'),
    currentOdometer: z.coerce.number().min(0, 'Odômetro não pode ser negativo'),
    departmentId: z.string().uuid('Secretaria é obrigatória'),
    status: z.enum(['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE']).default('AVAILABLE'),
    vehicleType: z.string().optional(),
    color: z.string().optional(),
    renavam: z.string().optional(),
    chassis: z.string().optional(),
    insuranceExpiry: z.string().optional(),
});

type VehicleFormInput = z.input<typeof vehicleSchema>;

interface NewVehicleFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

// ── Slot de foto (câmera ou galeria, só imagem) ────────────────────────────
function PhotoSlot({
    label, hint, file, onSelect, onClear,
}: {
    label: string; hint: string; file: File | null;
    onSelect: (f: File) => void; onClear: () => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);

    useEffect(() => {
        if (!file) { setPreview(null); return; }
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result as string);
        reader.readAsDataURL(file);
    }, [file]);

    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600">{label}</label>
            <div
                onClick={() => inputRef.current?.click()}
                className={
                    'relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-all flex items-center justify-center ' +
                    (preview ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/20')
                }
            >
                {preview ? (
                    <>
                        <img src={preview} alt={label} className="absolute inset-0 h-full w-full object-cover" />
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onClear(); }}
                            className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </>
                ) : (
                    <div className="px-2 text-center">
                        <Camera className="mx-auto h-6 w-6 text-slate-300" />
                        <p className="mt-1 text-[11px] font-medium text-slate-500">{hint}</p>
                    </div>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (!isImageFile(f)) { toast.error('Selecione uma imagem válida.'); return; }
                        onSelect(f);
                        if (inputRef.current) inputRef.current.value = '';
                    }}
                />
            </div>
        </div>
    );
}

export function NewVehicleForm({ onSuccess, onCancel }: NewVehicleFormProps) {
    const { user } = useAuth();
    const [departmentOptions, setDepartmentOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [brandSelect, setBrandSelect] = useState<string>('');
    const [showMore, setShowMore] = useState(false);

    const [vehicleFile, setVehicleFile] = useState<File | null>(null);
    const [plateFile, setPlateFile] = useState<File | null>(null);
    const [docFile, setDocFile] = useState<File | null>(null);

    const brandOptions = useMemo(
        () => [
            ...KNOWN_BRANDS.map((b) => ({ value: b, label: b })),
            { value: OTHER_BRAND_VALUE, label: 'Outro (digitar)' },
        ],
        [],
    );

    const {
        register, handleSubmit, control, setValue,
        formState: { errors, isSubmitting: isFormSubmitting },
    } = useForm<VehicleFormInput>({
        resolver: zodResolver(vehicleSchema),
        defaultValues: {
            status: 'AVAILABLE',
            currentOdometer: 0,
            year: '' as unknown as number,
            departmentId: user?.departmentId ?? '',
        },
    });

    useEffect(() => {
        if (user?.departmentId) setValue('departmentId', user.departmentId);
    }, [setValue, user?.departmentId]);

    useEffect(() => {
        let mounted = true;
        departmentsApi.getAll()
            .then((deps) => { if (mounted) setDepartmentOptions(deps.map((d) => ({ value: d.id, label: d.name }))); })
            .catch(() => toast.error('Não foi possível carregar as secretarias.'));
        return () => { mounted = false; };
    }, []);

    const isSubmitting = isFormSubmitting || isUploading;

    const handleAiExtract = async () => {
        const files = [vehicleFile, plateFile, docFile].filter(Boolean) as File[];
        if (files.length === 0) {
            toast.warning('Adicione ao menos uma foto (veículo, placa ou documento).');
            return;
        }
        if (!user?.tenantId) {
            toast.error('Sem prefeitura definida para o envio das fotos.');
            return;
        }
        try {
            setAiLoading(true);
            toast.info('Analisando imagens com IA...');
            const d = await extractVehicleFromImages(files, user.tenantId);

            if (d.plate) setValue('plate', String(d.plate).toUpperCase(), { shouldValidate: true });
            if (d.brand) {
                const known = (KNOWN_BRANDS as readonly string[]).includes(d.brand);
                setBrandSelect(known ? d.brand : OTHER_BRAND_VALUE);
                setValue('brand', d.brand, { shouldValidate: true });
            }
            if (d.model) setValue('model', d.model, { shouldValidate: true });
            if (d.year) setValue('year', d.year, { shouldValidate: true });
            if (d.fuelType) setValue('fuelType', d.fuelType, { shouldValidate: true });
            if (d.tankCapacity) setValue('tankCapacity', d.tankCapacity, { shouldValidate: true });
            if (d.vehicleType) setValue('vehicleType', d.vehicleType);
            if (d.color) setValue('color', d.color);
            if (d.renavam) setValue('renavam', String(d.renavam));
            if (d.chassis) setValue('chassis', String(d.chassis));

            // Abre a sanfona se a IA preencheu algum campo de documentação/identificação.
            if (d.vehicleType || d.color || d.renavam || d.chassis) setShowMore(true);

            toast.success('Dados preenchidos pela IA. Revise antes de salvar.');
        } catch (e) {
            toast.error((e as { message?: string })?.message ?? 'Não foi possível extrair os dados.');
        } finally {
            setAiLoading(false);
        }
    };

    const uploadImage = async (file: File, prefix: string): Promise<string> => {
        const blob = await resizeAndConvertToWebP(file, 1000);
        const fileName = `vehicles/${prefix}-${Date.now()}.webp`;
        const { error } = await supabase.storage.from('fotos').upload(fileName, blob, { contentType: 'image/webp', upsert: true });
        if (error) throw error;
        return supabase.storage.from('fotos').getPublicUrl(fileName).data.publicUrl;
    };

    const onSubmit = async (data: VehicleFormInput) => {
        try {
            const normalizedPlate = data.plate.trim().toUpperCase();
            const payload: TablesInsert<'vehicles'> = {
                unit_code: normalizedPlate,
                plate: normalizedPlate,
                brand: data.brand.trim(),
                model: data.model.trim(),
                year: Number(data.year),
                fuel_type: data.fuelType as unknown as TablesInsert<'vehicles'>['fuel_type'],
                tank_capacity: Number(data.tankCapacity),
                current_odometer: Number(data.currentOdometer),
                department_id: data.departmentId,
                status: (data.status ?? 'AVAILABLE') as unknown as TablesInsert<'vehicles'>['status'],
                qr_code: normalizedPlate,
                vehicle_type: data.vehicleType?.trim() || null,
                color: data.color?.trim() || null,
                renavam: data.renavam?.trim() || null,
                chassis: data.chassis?.trim() || null,
                insurance_expiry: data.insuranceExpiry || null,
            };

            const created = await vehiclesApi.create(payload);

            if (vehicleFile || docFile) {
                setIsUploading(true);
                try {
                    if (vehicleFile) {
                        const url = await uploadImage(vehicleFile, created.id);
                        await vehiclesApi.updatePhoto(created.id, url);
                    }
                    if (docFile) {
                        // Documento sensível → bucket PRIVADO (path escopado por prefeitura).
                        const docPath = await uploadPrivateDoc(docFile, 'vehicle-docs', user?.tenantId ?? '', created.id);
                        await vehiclesApi.update(created.id, { document_url: docPath } as never);
                    }
                } catch (err) {
                    console.error(err);
                    toast.warning('Veículo criado, mas houve erro ao enviar alguma imagem.');
                } finally {
                    setIsUploading(false);
                }
            }

            toast.success('Veículo cadastrado com sucesso!');
            onSuccess();
        } catch (error) {
            toast.error((error as { message?: string })?.message || 'Erro ao cadastrar veículo.');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Fotos + IA */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h4 className="text-sm font-bold text-slate-700">Fotos do veículo</h4>
                        <p className="text-xs text-slate-400">Tire fotos ou escolha da galeria. A IA preenche os campos automaticamente.</p>
                    </div>
                    <SGFButton type="button" variant="secondary" size="sm" icon={aiLoading ? Loader2 : Sparkles} disabled={aiLoading} onClick={handleAiExtract}>
                        {aiLoading ? 'Analisando...' : 'Preencher com IA'}
                    </SGFButton>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <PhotoSlot label="Foto do veículo" hint="Toque para foto/galeria" file={vehicleFile} onSelect={setVehicleFile} onClear={() => setVehicleFile(null)} />
                    <PhotoSlot label="Foto da placa" hint="Para ler a placa" file={plateFile} onSelect={setPlateFile} onClear={() => setPlateFile(null)} />
                    <PhotoSlot label="Foto do documento" hint="CRLV (RENAVAM, chassi)" file={docFile} onSelect={setDocFile} onClear={() => setDocFile(null)} />
                </div>
            </div>

            {/* Campos */}
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SGFInput label="Placa" placeholder="ABC-1234" {...register('plate')} error={errors.plate?.message} fullWidth />
                    <div className="space-y-2">
                        <SGFSelect
                            label="Marca"
                            options={brandOptions}
                            value={brandSelect}
                            onChange={(val) => {
                                setBrandSelect(val);
                                if (val === OTHER_BRAND_VALUE) setValue('brand', '', { shouldValidate: false });
                                else setValue('brand', val, { shouldValidate: true });
                            }}
                            placeholder="Selecione a marca"
                            error={brandSelect === '' ? errors.brand?.message : undefined}
                            fullWidth
                        />
                        {brandSelect === OTHER_BRAND_VALUE && (
                            <SGFInput placeholder="Digite a marca" {...register('brand')} error={errors.brand?.message} autoFocus fullWidth />
                        )}
                        {brandSelect !== OTHER_BRAND_VALUE && <input type="hidden" {...register('brand')} />}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SGFInput label="Modelo" placeholder="Strada" {...register('model')} error={errors.model?.message} fullWidth />
                    <SGFInput label="Ano" type="number" {...register('year')} error={errors.year?.message} fullWidth />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Controller
                        name="fuelType"
                        control={control}
                        render={({ field }) => (
                            <SGFSelect
                                label="Combustível"
                                options={[
                                    { value: 'GASOLINE', label: 'Gasolina' },
                                    { value: 'ETHANOL', label: 'Etanol' },
                                    { value: 'DIESEL', label: 'Diesel' },
                                    { value: 'FLEX', label: 'Flex' },
                                ]}
                                value={field.value}
                                onChange={field.onChange}
                                error={errors.fuelType?.message}
                                placeholder="Selecione o combustível"
                                fullWidth
                            />
                        )}
                    />
                    <SGFInput label="Capacidade do tanque (L)" type="number" step="0.01" {...register('tankCapacity')} error={errors.tankCapacity?.message} fullWidth />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SGFInput label="Odômetro atual" type="number" {...register('currentOdometer')} error={errors.currentOdometer?.message} fullWidth />
                    <Controller
                        name="departmentId"
                        control={control}
                        render={({ field }) => (
                            <SGFSelect
                                label="Secretaria"
                                options={departmentOptions}
                                value={field.value}
                                onChange={field.onChange}
                                error={errors.departmentId?.message}
                                placeholder="Selecione a secretaria"
                                fullWidth
                            />
                        )}
                    />
                    <Controller
                        name="status"
                        control={control}
                        render={({ field }) => (
                            <SGFSelect
                                label="Status"
                                options={[
                                    { value: 'AVAILABLE', label: 'Disponível' },
                                    { value: 'IN_USE', label: 'Em uso' },
                                    { value: 'MAINTENANCE', label: 'Manutenção' },
                                    { value: 'INACTIVE', label: 'Inativo' },
                                ]}
                                value={field.value}
                                onChange={field.onChange}
                                error={errors.status?.message}
                                fullWidth
                            />
                        )}
                    />
                </div>

                {/* Sanfona: documentação e identificação */}
                <div className="rounded-2xl border border-slate-200">
                    <button
                        type="button"
                        onClick={() => setShowMore((v) => !v)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                        <span className="text-sm font-semibold text-slate-700">Documentação e identificação</span>
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showMore ? 'rotate-180' : ''}`} />
                    </button>
                    {showMore && (
                        <div className="space-y-4 border-t border-slate-100 p-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <Controller
                                    name="vehicleType"
                                    control={control}
                                    render={({ field }) => (
                                        <SGFSelect
                                            label="Tipo / Categoria"
                                            options={VEHICLE_TYPES.map((t) => ({ value: t, label: t }))}
                                            value={field.value ?? ''}
                                            onChange={field.onChange}
                                            error={errors.vehicleType?.message}
                                            placeholder="Selecione o tipo"
                                            fullWidth
                                        />
                                    )}
                                />
                                <SGFInput label="Cor" placeholder="Ex.: Branco" {...register('color')} error={errors.color?.message} fullWidth />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <SGFInput label="RENAVAM" {...register('renavam')} error={errors.renavam?.message} fullWidth />
                                <SGFInput label="Chassi" {...register('chassis')} error={errors.chassis?.message} fullWidth />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <SGFInput label="Vencimento do seguro" type="date" {...register('insuranceExpiry')} error={errors.insuranceExpiry?.message} fullWidth />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
                <SGFButton type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>Cancelar</SGFButton>
                <SGFButton type="submit" icon={isSubmitting ? Loader2 : Save} disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : 'Cadastrar Veículo'}
                </SGFButton>
            </div>
        </form>
    );
}
