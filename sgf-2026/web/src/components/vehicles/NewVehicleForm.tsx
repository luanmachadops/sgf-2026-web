import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Save, Sparkles, ChevronDown, Camera, X, Car, FileText } from '@/components/sgf/icons';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { departmentsApi, vehiclesApi, vehicleDocumentsApi } from '@/lib/supabase-api';
import { VEHICLE_TYPES, extractVehicleWithPhotos, type ExtractWithPhotosResult, type VehiclePhotoSlot } from '@/lib/vehicleAI';
import type { TablesInsert } from '@/types/database.types';
import { useAuth } from '@/contexts/AuthContext';
import { isImageFile, resizeAndConvertToWebP, uploadFileId } from '@/lib/imageUtils';
import { supabase } from '@/lib/supabase';
import { uploadFoto } from '@/lib/fotoStorage';

const KNOWN_BRANDS = [
    'Fiat', 'Volkswagen', 'Chevrolet', 'Ford', 'Renault', 'Toyota', 'Hyundai',
    'Honda', 'Nissan', 'Citroën', 'Peugeot', 'Mitsubishi', 'Jeep', 'Kia',
    'Mercedes-Benz', 'Iveco', 'Scania', 'Volvo', 'MAN', 'JAC',
] as const;
const OTHER_BRAND_VALUE = '__other__';

const SLOTS: { type: VehiclePhotoSlot; label: string; hint: string }[] = [
    { type: 'foto', label: 'Foto do veículo', hint: 'Visão geral' },
    { type: 'placa', label: 'Placa', hint: 'Foco na placa' },
    { type: 'documento', label: 'Documento (CRLV)', hint: 'Renavam/chassi' },
    { type: 'hodometro', label: 'Hodômetro', hint: 'Painel/odômetro' },
];

function withMask(
    reg: { onChange: (e: unknown) => unknown; onBlur: (e: unknown) => unknown; name: string; ref: (i: unknown) => void },
    mask: (v: string) => string,
) {
    return {
        ...reg,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            e.target.value = mask(e.target.value);
            return reg.onChange(e);
        },
    };
}

function maskYear(val: string): string {
    return val.replace(/\D/g, '').slice(0, 4);
}

const vehicleSchema = z.object({
    plate: z.string().min(7, 'Placa inválida').max(8, 'Placa inválida'),
    brand: z.string().min(1, 'Marca é obrigatória'),
    model: z.string().min(1, 'Modelo é obrigatório'),
    year: z.coerce.number().min(1900, 'Ano inválido').max(new Date().getFullYear() + 1, 'Ano inválido'),
    fuelType: z.enum(['DIESEL', 'GASOLINE', 'ETHANOL', 'FLEX'], { error: 'Combustível é obrigatório' }),
    tankCapacity: z.coerce.number().min(1, 'Capacidade é obrigatória'),
    currentOdometer: z.coerce.number().min(0, 'Odômetro inválido'),
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

export function NewVehicleForm({ onSuccess, onCancel }: NewVehicleFormProps) {
    const { user } = useAuth();
    const [departmentOptions, setDepartmentOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [brandSelect, setBrandSelect] = useState<string>('');
    const [showMore, setShowMore] = useState(false);

    // Uploads manuais de Foto e Documento
    const [vehiclePhotoFile, setVehiclePhotoFile] = useState<File | null>(null);
    const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState<string | null>(null);
    const [crlvFile, setCrlvFile] = useState<File | null>(null);
    const [crlvFileName, setCrlvFileName] = useState<string | null>(null);

    const vehiclePhotoRef = useRef<HTMLInputElement>(null);
    const crlvFileRef = useRef<HTMLInputElement>(null);

    // Painel de IA inline com upload direto
    const [aiPanelOpen, setAiPanelOpen] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiFiles, setAiFiles] = useState<Partial<Record<VehiclePhotoSlot, File>>>({});
    const [aiPreviews, setAiPreviews] = useState<Partial<Record<VehiclePhotoSlot, string>>>({});
    const [aiPhotos, setAiPhotos] = useState<ExtractWithPhotosResult['photos']>([]);

    const slotRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const handleVehiclePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!isImageFile(file)) { toast.error('Selecione uma imagem válida.'); return; }
        setVehiclePhotoFile(file);
        setVehiclePhotoPreview(URL.createObjectURL(file));
    };

    const handleCrlvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCrlvFile(file);
        setCrlvFileName(file.name);
    };

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

    const pickAiSlot = (type: VehiclePhotoSlot, file?: File) => {
        if (!file) return;
        if (!isImageFile(file)) { toast.error('Selecione uma imagem válida.'); return; }
        setAiFiles((f) => ({ ...f, [type]: file }));
        setAiPreviews((p) => ({ ...p, [type]: URL.createObjectURL(file) }));
    };

    const clearAiSlot = (type: VehiclePhotoSlot) => {
        setAiFiles((f) => { const n = { ...f }; delete n[type]; return n; });
        setAiPreviews((p) => { const n = { ...p }; delete n[type]; return n; });
    };

    const analyzeAiPhotos = async () => {
        const slots = (Object.keys(aiFiles) as VehiclePhotoSlot[]).map((type) => ({ type, file: aiFiles[type]! }));
        if (slots.length === 0) { toast.error('Adicione ao menos uma foto.'); return; }
        if (!user?.tenantId) { toast.error('Sem prefeitura definida para o envio das fotos.'); return; }

        setAiBusy(true);
        try {
            toast.info('Analisando fotos do veículo com IA...');
            const result = await extractVehicleWithPhotos(slots, undefined, user.tenantId);
            const d = result.data;

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
            if (d.odometer && d.odometer > 0) setValue('currentOdometer', d.odometer, { shouldValidate: true });

            if (d.vehicleType || d.color || d.renavam || d.chassis) setShowMore(true);

            setAiPhotos(result.photos);
            toast.success('Dados extraídos da IA aplicados ao formulário!');
            setAiPanelOpen(false);
        } catch (e) {
            toast.error((e as { message?: string })?.message ?? 'Falha na análise por IA.');
        } finally {
            setAiBusy(false);
        }
    };

    const isSubmitting = isFormSubmitting || isUploading;

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

            // Upload manual da foto do veículo se selecionada
            if (vehiclePhotoFile) {
                try {
                    setIsUploading(true);
                    const optimizedBlob = await resizeAndConvertToWebP(vehiclePhotoFile, 1024);
                    const fileName = `vehicles/${created.id}-${uploadFileId()}.webp`;
                    const { publicUrl } = await uploadFoto(fileName, optimizedBlob, 'image/webp');
                    await vehiclesApi.updatePhoto(created.id, publicUrl);
                } catch (e) {
                    console.error('Error uploading vehicle photo:', e);
                } finally {
                    setIsUploading(false);
                }
            } else if (aiPhotos.length > 0) {
                setIsUploading(true);
                try {
                    const mainPhoto = aiPhotos.find((p) => p.type === 'foto')?.url;
                    if (mainPhoto) await vehiclesApi.updatePhoto(created.id, mainPhoto);
                } catch (e) {
                    console.error('Error attaching AI photos to vehicle:', e);
                } finally {
                    setIsUploading(false);
                }
            }

            // Upload manual do CRLV se selecionado
            if (crlvFile) {
                try {
                    const ext = crlvFile.name.split('.').pop() || 'pdf';
                    const docPath = `documents/${created.id}/crlv-${uploadFileId()}.${ext}`;
                    const { error: docError } = await supabase.storage
                        .from('documentos')
                        .upload(docPath, crlvFile, { upsert: true });
                    if (!docError) {
                        await vehicleDocumentsApi.add({
                            vehicleId: created.id,
                            docType: 'CRLV',
                            url: docPath,
                            title: 'Documento do Veículo (CRLV)',
                        });
                    }
                } catch (e) {
                    console.error('Error uploading CRLV document:', e);
                }
            }

            toast.success('Veículo cadastrado com sucesso!');
            onSuccess();
        } catch (error: any) {
            console.error('Error creating vehicle:', error);
            toast.error(error?.message || 'Erro ao cadastrar veículo.');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Top Banner - Preencher com IA & Painel Inline de Upload */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-slate-900">Preencher com IA</h4>
                            <p className="text-xs text-slate-500">Envie fotos do veículo, placa, documento e hodômetro para preenchimento automático.</p>
                        </div>
                    </div>
                    <SGFButton
                        type="button"
                        variant="primary"
                        size="sm"
                        icon={aiPanelOpen ? ChevronDown : Sparkles}
                        onClick={() => setAiPanelOpen((v) => !v)}
                        className="!rounded-full shrink-0"
                    >
                        {aiPanelOpen ? 'Ocultar IA' : 'Usar IA'}
                    </SGFButton>
                </div>

                {/* Painel Expansível de Upload da IA */}
                {aiPanelOpen && (
                    <div className="pt-3 border-t border-emerald-500/10 space-y-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {SLOTS.map((slot) => {
                                const preview = aiPreviews[slot.type];
                                return (
                                    <div key={slot.type} className="flex flex-col gap-1.5">
                                        <div
                                            className="relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-emerald-300/60 bg-white/90 transition hover:border-emerald-500 shadow-sm"
                                            onClick={() => slotRefs.current[slot.type]?.click()}
                                        >
                                            {preview ? (
                                                <>
                                                    <img src={preview} alt={slot.label} className="h-full w-full object-cover" />
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); clearAiSlot(slot.type); }}
                                                        className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1 text-slate-400 p-2 text-center">
                                                    <Camera className="h-5 w-5 text-emerald-600" />
                                                    <span className="text-[10px] font-semibold text-slate-600">{slot.hint}</span>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-center text-[11px] font-medium text-slate-600">{slot.label}</p>
                                        <input
                                            ref={(el) => { slotRefs.current[slot.type] = el; }}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => pickAiSlot(slot.type, e.target.files?.[0])}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-end pt-1">
                            <SGFButton
                                type="button"
                                variant="primary"
                                size="sm"
                                icon={aiBusy ? Loader2 : Sparkles}
                                disabled={aiBusy || Object.keys(aiFiles).length === 0}
                                onClick={analyzeAiPhotos}
                                className="!rounded-full"
                            >
                                {aiBusy ? 'Analisando...' : `Analisar ${Object.keys(aiFiles).length} foto(s)`}
                            </SGFButton>
                        </div>
                    </div>
                )}
            </div>

            {/* Cards de Upload Manual: Foto do Veículo & Documento (CRLV) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card Foto do Veículo */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[var(--sgf-shadow-xs)]">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                            {vehiclePhotoPreview ? (
                                <img src={vehiclePhotoPreview} alt="Foto do veículo" className="h-full w-full object-cover" />
                            ) : (
                                <Car className="h-6 w-6 text-slate-400" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-slate-900 truncate">Foto do Veículo</h4>
                            <p className="text-xs text-slate-500 truncate">Visão geral do veículo</p>
                        </div>
                    </div>
                    <SGFButton
                        type="button"
                        variant="outline"
                        size="sm"
                        icon={Camera}
                        onClick={() => vehiclePhotoRef.current?.click()}
                        className="!rounded-full shrink-0 !h-9 text-xs !border-slate-200"
                    >
                        {vehiclePhotoPreview ? 'Trocar' : 'Enviar'}
                    </SGFButton>
                    <input
                        ref={vehiclePhotoRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleVehiclePhotoChange}
                    />
                </div>

                {/* Card Documento (CRLV) */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[var(--sgf-shadow-xs)]">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                            <FileText className="h-6 w-6 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-slate-900 truncate">Documento (CRLV)</h4>
                            <p className="text-xs text-slate-500 truncate">{crlvFileName ? crlvFileName : 'PDF ou foto do CRLV'}</p>
                        </div>
                    </div>
                    <SGFButton
                        type="button"
                        variant="outline"
                        size="sm"
                        icon={FileText}
                        onClick={() => crlvFileRef.current?.click()}
                        className="!rounded-full shrink-0 !h-9 text-xs !border-slate-200"
                    >
                        {crlvFileName ? 'Trocar' : 'Enviar'}
                    </SGFButton>
                    <input
                        ref={crlvFileRef}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={handleCrlvFileChange}
                    />
                </div>
            </div>

            {/* Form Fields Organized */}
            <div className="space-y-4">
                {/* Linha 1: Placa, Marca, Modelo, Ano (4 colunas) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <SGFInput label="Placa" placeholder="ABC-1234" {...register('plate')} error={errors.plate?.message} fullWidth />
                    
                    <div>
                        <SGFSelect
                            label="Marca"
                            options={brandOptions}
                            value={brandSelect}
                            onChange={(val) => {
                                setBrandSelect(val);
                                if (val === OTHER_BRAND_VALUE) setValue('brand', '', { shouldValidate: false });
                                else setValue('brand', val, { shouldValidate: true });
                            }}
                            placeholder="Selecione..."
                            error={brandSelect === '' ? errors.brand?.message : undefined}
                            fullWidth
                        />
                        {brandSelect === OTHER_BRAND_VALUE && (
                            <SGFInput placeholder="Digite a marca" {...register('brand')} error={errors.brand?.message} autoFocus fullWidth className="mt-2" />
                        )}
                        {brandSelect !== OTHER_BRAND_VALUE && <input type="hidden" {...register('brand')} />}
                    </div>

                    <SGFInput label="Modelo" placeholder="Strada" {...register('model')} error={errors.model?.message} fullWidth />
                    
                    <SGFInput
                        label="Ano"
                        placeholder="2024"
                        {...withMask(register('year'), maskYear)}
                        error={errors.year?.message}
                        fullWidth
                    />
                </div>

                {/* Linha 2: Combustível, Capacidade do tanque, Odômetro (3 colunas) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                placeholder="Selecione..."
                                fullWidth
                            />
                        )}
                    />
                    <SGFInput label="Capacidade do tanque (L)" type="number" step="0.01" placeholder="Ex.: 55" {...register('tankCapacity')} error={errors.tankCapacity?.message} fullWidth />
                    <SGFInput label="Odômetro atual" type="number" placeholder="0" {...register('currentOdometer')} error={errors.currentOdometer?.message} fullWidth />
                </div>

                {/* Linha 3: Secretaria e Status (2 colunas) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="rounded-2xl border border-slate-200/80 bg-white">
                    <button
                        type="button"
                        onClick={() => setShowMore((v) => !v)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left font-medium text-slate-700"
                    >
                        <span className="text-sm font-semibold text-slate-800">Documentação e identificação</span>
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
                                <SGFInput label="RENAVAM" placeholder="00000000000" {...register('renavam')} error={errors.renavam?.message} fullWidth />
                                <SGFInput label="Chassi" placeholder="00000000000000000" {...register('chassis')} error={errors.chassis?.message} fullWidth />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <SGFInput label="Vencimento do seguro" type="date" {...register('insuranceExpiry')} error={errors.insuranceExpiry?.message} fullWidth />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200/60 pt-4">
                <SGFButton type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting} className="!rounded-full">
                    Cancelar
                </SGFButton>
                <SGFButton type="submit" icon={isSubmitting ? Loader2 : Save} disabled={isSubmitting} className="!rounded-full">
                    {isSubmitting ? 'Salvando...' : 'Cadastrar Veículo'}
                </SGFButton>
            </div>
        </form>
    );
}
