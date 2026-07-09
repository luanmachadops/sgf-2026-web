import React, { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Loader2, Save, LockKeyhole, Sparkles } from '@/components/sgf/icons';
import { departmentsApi } from '@/lib/supabase-api';
import { extractDriverFromCNH } from '@/lib/driverAI';
import { toast } from 'sonner';
import { isImageFile } from '@/lib/imageUtils';
import { maskCPF, maskPhone } from '@/lib/utils';

// Aplica uma máscara sobre o onChange do react-hook-form (register).
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
import { useAuth } from '@/contexts/AuthContext';
import { useCreateDriver } from '@/hooks/useDrivers';

const driverSchema = z.object({
    name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
    cpf: z
        .string()
        .min(11, 'CPF inválido')
        .max(14, 'CPF inválido')
        .refine((value) => value.replace(/\D/g, '').length === 11, 'CPF inválido'),
    registrationNumber: z.string().min(1, 'Matrícula é obrigatória'),
    birthDate: z.string().optional(),
    phone: z.string().min(10, 'Telefone inválido'),
    email: z.string().email('E-mail inválido'),
    licenseNumber: z.string().min(1, 'Número da CNH é obrigatório'),
    licenseCategory: z.string().min(1, 'Categoria é obrigatória'),
    licenseExpiry: z.string().min(1, 'Validade da CNH é obrigatória'),
    departmentId: z.string().uuid('Secretaria é obrigatória'),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
    password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres').max(20, 'Senha deve ter no máximo 20 caracteres'),
    confirmPassword: z.string().min(6, 'Confirme a senha'),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
});

type DriverFormData = z.infer<typeof driverSchema>;
type DriverFormInput = z.input<typeof driverSchema>;

interface NewDriverFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export function NewDriverForm({ onSuccess, onCancel }: NewDriverFormProps) {
    const { user } = useAuth();
    const [departmentOptions, setDepartmentOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const cnhInputRef = useRef<HTMLInputElement>(null);
    const createDriverMutation = useCreateDriver();

    const handleCnhExtract = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (cnhInputRef.current) cnhInputRef.current.value = '';
        if (!file) return;
        if (!isImageFile(file)) {
            toast.error('Selecione uma imagem válida da CNH.');
            return;
        }
        try {
            setAiLoading(true);
            toast.info('Lendo a CNH com IA...');
            const d = await extractDriverFromCNH([file]);
            if (d.name) setValue('name', String(d.name), { shouldValidate: true });
            if (d.cpf) setValue('cpf', maskCPF(String(d.cpf)), { shouldValidate: true });
            if (d.birthDate) setValue('birthDate', String(d.birthDate), { shouldValidate: true });
            if (d.cnhNumber) setValue('licenseNumber', String(d.cnhNumber), { shouldValidate: true });
            if (d.cnhCategory) setValue('licenseCategory', String(d.cnhCategory).toUpperCase(), { shouldValidate: true });
            if (d.cnhExpiry) setValue('licenseExpiry', String(d.cnhExpiry), { shouldValidate: true });
            toast.success('Dados da CNH preenchidos. Revise antes de salvar.');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Não foi possível ler a CNH.');
        } finally {
            setAiLoading(false);
        }
    };

    const {
        register,
        handleSubmit,
        control,
        setValue,
        formState: { errors, isSubmitting: isFormSubmitting },
    } = useForm<DriverFormInput>({
        resolver: zodResolver(driverSchema),
        defaultValues: {
            status: 'ACTIVE',
            departmentId: user?.departmentId ?? '',
        },
    });

    useEffect(() => {
        if (user?.departmentId) {
            setValue('departmentId', user.departmentId);
        }
    }, [setValue, user?.departmentId]);

    useEffect(() => {
        let isMounted = true;

        const loadDepartments = async () => {
            try {
                const departments = await departmentsApi.getAll();
                if (!isMounted) return;

                setDepartmentOptions(
                    departments.map((department) => ({
                        value: department.id,
                        label: department.name,
                    }))
                );
            } catch (error) {
                console.error('Error loading departments:', error);
                toast.error('Não foi possível carregar as secretarias.');
            }
        };

        loadDepartments();

        return () => {
            isMounted = false;
        };
    }, []);

    const isSubmitting = isFormSubmitting;

    const onSubmit = async (data: DriverFormInput) => {
        try {
            await createDriverMutation.mutateAsync({
                name: data.name.trim(),
                cpf: data.cpf.replace(/\D/g, ''),
                registrationNumber: data.registrationNumber.trim(),
                cnhNumber: data.licenseNumber.trim(),
                cnhCategory: data.licenseCategory,
                cnhExpiryDate: data.licenseExpiry,
                birthDate: data.birthDate || undefined,
                departmentId: data.departmentId,
                phone: data.phone.replace(/\D/g, ''),
                email: data.email.trim().toLowerCase(),
                status: data.status ?? 'ACTIVE',
                password: data.password,
            });

            toast.success('Motorista cadastrado com sucesso!');
            onSuccess();
        } catch (error: any) {
            console.error('Error creating driver:', error);
            toast.error(error?.message || 'Erro ao cadastrar motorista. Tente novamente.');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-8">
                {/* Left Column - Leitura de CNH */}
                <div className="space-y-4">
                    {/* Preenchimento automático via foto da CNH */}
                    <div className="space-y-2">
                        <SGFButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={aiLoading ? Loader2 : Sparkles}
                            disabled={aiLoading}
                            onClick={() => cnhInputRef.current?.click()}
                            className="w-full"
                        >
                            {aiLoading ? 'Lendo CNH...' : 'Ler CNH com IA'}
                        </SGFButton>
                        <p className="text-center text-xs text-slate-400">
                            Envie a foto da CNH e a IA preenche os campos.
                        </p>
                        <input
                            ref={cnhInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleCnhExtract}
                        />
                    </div>
                </div>

                {/* Right Column - Form Fields */}
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SGFInput
                            label="Nome Completo"
                            placeholder="João da Silva"
                            {...register('name')}
                            error={errors.name?.message}
                            fullWidth
                        />
                        <SGFInput
                            label="CPF"
                            placeholder="000.000.000-00"
                            {...withMask(register('cpf'), maskCPF)}
                            error={errors.cpf?.message}
                            fullWidth
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SGFInput
                            label="Matrícula"
                            placeholder="MT001"
                            {...register('registrationNumber')}
                            error={errors.registrationNumber?.message}
                            fullWidth
                        />
                        <SGFInput
                            label="Data de Nascimento"
                            type="date"
                            {...register('birthDate')}
                            error={errors.birthDate?.message}
                            fullWidth
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SGFInput
                            label="Telefone"
                            placeholder="(00) 00000-0000"
                            {...withMask(register('phone'), maskPhone)}
                            error={errors.phone?.message}
                            fullWidth
                        />
                        <SGFInput
                            label="E-mail"
                            placeholder="email@exemplo.com"
                            type="email"
                            {...register('email')}
                            error={errors.email?.message}
                            fullWidth
                        />
                    </div>

                    <SGFInput
                        label="Número da CNH"
                        placeholder="12345678900"
                        {...register('licenseNumber')}
                        error={errors.licenseNumber?.message}
                        fullWidth
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Controller
                            name="licenseCategory"
                            control={control}
                            render={({ field }) => (
                                <SGFSelect
                                    label="Categoria"
                                    options={[
                                        { value: 'A', label: 'A' },
                                        { value: 'B', label: 'B' },
                                        { value: 'C', label: 'C' },
                                        { value: 'D', label: 'D' },
                                        { value: 'E', label: 'E' },
                                        { value: 'AB', label: 'AB' },
                                        { value: 'AC', label: 'AC' },
                                        { value: 'AD', label: 'AD' },
                                        { value: 'AE', label: 'AE' },
                                    ]}
                                    value={field.value}
                                    onChange={field.onChange}
                                    error={errors.licenseCategory?.message}
                                    fullWidth
                                />
                            )}
                        />
                        <SGFInput
                            label="Validade CNH"
                            type="date"
                            {...register('licenseExpiry')}
                            error={errors.licenseExpiry?.message}
                            fullWidth
                        />
                    </div>

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
                                    disabled={Boolean(user?.departmentScopeId)}
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
                                        { value: 'ACTIVE', label: 'Ativo' },
                                        { value: 'INACTIVE', label: 'Inativo' },
                                        { value: 'SUSPENDED', label: 'Suspenso' },
                                    ]}
                                    value={field.value}
                                    onChange={field.onChange}
                                    error={errors.status?.message}
                                    fullWidth
                                />
                            )}
                        />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                                <LockKeyhole width={18} height={18} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Dados de acesso</p>
                                <p className="text-xs text-slate-500">
                                    O motorista fará login no app usando CPF e esta senha.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <SGFInput
                                label="Senha inicial"
                                type="password"
                                placeholder="Mínimo de 6 caracteres"
                                {...register('password')}
                                error={errors.password?.message}
                                fullWidth
                            />
                            <SGFInput
                                label="Confirmar senha"
                                type="password"
                                placeholder="Repita a senha"
                                {...register('confirmPassword')}
                                error={errors.confirmPassword?.message}
                                fullWidth
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <SGFButton type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                    Cancelar
                </SGFButton>
                <SGFButton type="submit" icon={isSubmitting ? Loader2 : Save} disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : 'Cadastrar Motorista'}
                </SGFButton>
            </div>
        </form>
    );
}
