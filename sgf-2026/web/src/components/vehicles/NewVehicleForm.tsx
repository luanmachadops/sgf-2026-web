import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Save, Sparkles, ChevronDown } from '@/components/sgf/icons';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { departmentsApi, vehiclesApi, vehicleDocumentsApi } from '@/lib/supabase-api';
import { VEHICLE_TYPES, type ExtractWithPhotosResult } from '@/lib/vehicleAI';
import { VehicleAIModal } from '@/components/vehicles/VehicleAIModal';
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

export function NewVehicleForm({ onSuccess, onCancel }: NewVehicleFormProps) {
    const { user } = useAuth();
    const [departmentOptions, setDepartmentOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [brandSelect, setBrandSelect] = useState<string>('');
    const [showMore, setShowMore] = useState(false);

    const [aiOpen, setAiOpen] = useState(false);
    // Fotos já enviadas pela IA — aplicadas ao veículo assim que ele é criado.
    const [aiPhotos, setAiPhotos] = useState<ExtractWithPhotosResult['photos']>([]);

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

    /** Aplica o que a IA extraiu nos campos do formulário (o gestor revisa antes de salvar). */
    const handleAiResult = (result: ExtractWithPhotosResult) => {
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

        // Abre a sanfona se a IA preencheu algum campo de documentação/identificação.
        if (d.vehicleType || d.color || d.renavam || d.chassis) setShowMore(true);

        // As fotos já subiram; ficam guardadas para vincular ao veículo recém-criado.
        setAiPhotos(result.photos);
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

            // Vincula ao veículo recém-criado as fotos que a IA já havia enviado.
            if (aiPhotos.length > 0) {
                setIsUploading(true);
                try {
                    const mainPhoto = aiPhotos.find((p) => p.type === 'foto')?.url;
                    if (mainPhoto) await vehiclesApi.updatePhoto(created.id, mainPhoto);

                    // O CRLV fica no bucket privado — guardamos o path como documento do veículo.
                    const crlv = aiPhotos.find((p) => p.type === 'documento')?.url;
                    if (crlv) await vehiclesApi.update(created.id, { document_url: crlv } as never);

                    const TITLES: Record<string, string> = {
                        foto: 'Foto do veículo', placa: 'Placa', documento: 'Documento (CRLV)', hodometro: 'Hodômetro',
                    };
                    for (const p of aiPhotos) {
                        await vehicleDocumentsApi.add({
                            vehicleId: created.id, url: p.url, title: TITLES[p.type] ?? 'Foto', docType: p.type,
                        });
                    }
                } catch (err) {
                    console.error(err);
                    toast.warning('Veículo criado, mas houve erro ao anexar alguma foto.');
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
            {/* Preenchimento automático por IA a partir de fotos */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="min-w-0">
                    <h4 className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                        <Sparkles className="h-4 w-4 text-emerald-600" /> Preencher com IA
                    </h4>
                    <p className="text-xs text-emerald-700/80">
                        Envie fotos do veículo, placa, CRLV e hodômetro — a IA preenche os campos abaixo para você revisar.
                    </p>
                    {aiPhotos.length > 0 && (
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                            {aiPhotos.length} foto(s) anexada(s) — serão salvas junto com o veículo.
                        </p>
                    )}
                </div>
                <SGFButton type="button" variant="secondary" size="sm" icon={Sparkles} onClick={() => setAiOpen(true)}>
                    Usar IA
                </SGFButton>
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

            <VehicleAIModal
                isOpen={aiOpen}
                onClose={() => setAiOpen(false)}
                tenantId={user?.tenantId ?? ''}
                onResult={handleAiResult}
            />
        </form>
    );
}
