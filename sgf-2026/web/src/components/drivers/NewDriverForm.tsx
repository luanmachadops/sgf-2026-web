import React, { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Loader2, Save, Sparkles, Eye, EyeOff, Camera, UserSquare2 } from '@/components/sgf/icons';
import { departmentsApi } from '@/lib/supabase-api';
import { extractDriverFromCNH } from '@/lib/driverAI';
import { toast } from 'sonner';
import { isImageFile } from '@/lib/imageUtils';
import { maskCPF, maskPhone } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateDriver } from '@/hooks/useDrivers';

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...props}>
        <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984 0 1.763.459 3.483 1.332 5.001L2 22l5.161-1.348a9.945 9.945 0 004.846 1.252h.004c5.505 0 9.988-4.479 9.989-9.985 0-2.668-1.037-5.176-2.923-7.062A9.924 9.924 0 0012.012 2zm5.666 14.25c-.244.686-1.42 1.309-1.956 1.391-.497.076-1.144.108-1.841-.115-.427-.136-.976-.314-1.685-.621-2.969-1.288-4.908-4.288-5.056-4.485-.148-.198-1.205-1.603-1.205-3.058 0-1.454.762-2.17 1.033-2.464.271-.293.593-.367.791-.367.198 0 .396.002.569.011.183.009.431-.07.674.514.244.584.832 2.03.904 2.177.073.147.121.319.024.514-.097.195-.146.316-.291.488-.146.173-.308.387-.44.52-.146.147-.298.307-.129.598.17.291.756 1.244 1.625 2.019 1.118.995 2.06 1.303 2.352 1.449.292.146.463.122.634-.073.171-.195.731-.852.926-1.144.195-.292.39-.244.658-.146.268.098 1.706.804 2.001.95.295.147.491.22.564.342.073.122.073.71-.171 1.396z" />
    </svg>
);

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

function maskCNH(value: string): string {
    return value.replace(/\D/g, '').slice(0, 11);
}

const driverSchema = z.object({
    name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
    cpf: z
        .string()
        .min(11, 'CPF inválido')
        .max(14, 'CPF inválido')
        .refine((value) => value.replace(/\D/g, '').length === 11, 'CPF inválido'),
    departmentId: z.string().uuid('Secretaria é obrigatória'),
    registrationNumber: z.string().optional(),
    birthDate: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('E-mail inválido').optional().or(z.literal('')),
    licenseNumber: z.string().optional(),
    licenseCategory: z.string().optional(),
    licenseExpiry: z.string().optional(),
    cnhEar: z.boolean().optional().default(false),
    shiftStart: z.string().optional(),
    shiftEnd: z.string().optional(),
    password: z.string().optional(),
});

type DriverFormInput = z.input<typeof driverSchema>;

interface NewDriverFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export function NewDriverForm({ onSuccess }: NewDriverFormProps) {
    const { user } = useAuth();
    const [departmentOptions, setDepartmentOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    const cnhInputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const createDriverMutation = useCreateDriver();

    const {
        register,
        handleSubmit,
        control,
        setValue,
        getValues,
        formState: { errors, isSubmitting: isFormSubmitting },
    } = useForm<DriverFormInput>({
        resolver: zodResolver(driverSchema),
        defaultValues: {
            name: '',
            cpf: '',
            registrationNumber: '',
            birthDate: '',
            phone: '',
            email: '',
            licenseNumber: '',
            licenseCategory: '',
            licenseExpiry: '',
            cnhEar: false,
            shiftStart: '07:30',
            shiftEnd: '17:00',
            password: '',
            departmentId: user?.departmentId ?? '',
        },
    });

    const handleSendWhatsApp = () => {
        const values = getValues();
        if (!values.cpf) {
            toast.error('Informe ao menos o CPF do motorista antes de enviar o acesso.');
            return;
        }
        const cleanCpf = values.cpf.replace(/\D/g, '');
        const pwd = values.password || cleanCpf.slice(0, 6);
        const driverPhone = values.phone ? values.phone.replace(/\D/g, '') : '';

        const message = `Olá, *${values.name || 'Motorista'}*!\n\nSeu acesso ao App Frota foi criado com sucesso.\n\n📱 *App:* SGF 2026 Motorista\n👤 *CPF (Login):* ${values.cpf}\n🔑 *Senha:* ${pwd}\n\nFaça o download do app e realize o primeiro login.`;

        const encodedMessage = encodeURIComponent(message);
        const targetUrl = driverPhone
            ? `https://api.whatsapp.com/send?phone=55${driverPhone}&text=${encodedMessage}`
            : `https://api.whatsapp.com/send?text=${encodedMessage}`;

        window.open(targetUrl, '_blank');
        toast.success('Redirecionando para o WhatsApp...');
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!isImageFile(file)) {
            toast.error('Selecione uma imagem válida.');
            return;
        }
        setPhotoPreview(URL.createObjectURL(file));
        toast.success('Foto carregada com sucesso.');
    };

    const handleGeneratePassword = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let pwd = '';
        for (let i = 0; i < 8; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setValue('password', pwd, { shouldValidate: true });
        setShowPassword(true);
        toast.success(`Senha gerada: ${pwd}`);
    };

    const handleCnhExtract = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (cnhInputRef.current) cnhInputRef.current.value = '';
        if (!file) return;
        if (!isImageFile(file)) {
            toast.error('Selecione uma imagem válida da CNH.');
            return;
        }
        if (!user?.tenantId) {
            toast.error('Sem prefeitura definida para a leitura da CNH.');
            return;
        }
        try {
            setAiLoading(true);
            toast.info('Lendo a CNH com IA...');
            const d = await extractDriverFromCNH([file], user.tenantId);
            if (d.name) setValue('name', String(d.name), { shouldValidate: true });
            if (d.cpf) setValue('cpf', maskCPF(String(d.cpf)), { shouldValidate: true });
            if (d.birthDate) setValue('birthDate', String(d.birthDate), { shouldValidate: true });
            if (d.cnhNumber) setValue('licenseNumber', maskCNH(String(d.cnhNumber)), { shouldValidate: true });
            if (d.cnhCategory) setValue('licenseCategory', String(d.cnhCategory).toUpperCase(), { shouldValidate: true });
            if (d.cnhExpiry) setValue('licenseExpiry', String(d.cnhExpiry), { shouldValidate: true });
            toast.success('Dados da CNH preenchidos. Revise antes de salvar.');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Não foi possível ler a CNH.');
        } finally {
            setAiLoading(false);
        }
    };

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
            const cleanCpf = data.cpf.replace(/\D/g, '');
            const generatedPassword = data.password && data.password.trim().length >= 6
                ? data.password
                : cleanCpf.slice(0, 6);

            await createDriverMutation.mutateAsync({
                name: data.name.trim(),
                cpf: cleanCpf,
                registrationNumber: (data.registrationNumber || '').trim() || cleanCpf.slice(0, 8),
                cnhNumber: (data.licenseNumber || '').replace(/\D/g, '') || cleanCpf,
                cnhCategory: data.licenseCategory || 'B',
                cnhExpiryDate: data.licenseExpiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                birthDate: data.birthDate || undefined,
                departmentId: data.departmentId,
                phone: (data.phone || '').replace(/\D/g, ''),
                email: (data.email || '').trim().toLowerCase() || `${cleanCpf}@prefeitura.local`,
                status: 'ACTIVE',
                password: generatedPassword,
                cnhEar: data.cnhEar ?? false,
                shiftStart: data.shiftStart || undefined,
                shiftEnd: data.shiftEnd || undefined,
            });

            toast.success('Motorista cadastrado com sucesso!');
            onSuccess();
        } catch (error: any) {
            console.error('Error creating driver:', error);
            toast.error(error?.message || 'Erro ao cadastrar motorista. Tente novamente.');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-5">
            {/* Top Grid - Foto do Usuário & Leitura de CNH com IA (Vertical) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Card: Card de Foto do Usuário */}
                <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[var(--sgf-shadow-xs)] space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 shadow-sm">
                            {photoPreview ? (
                                <img src={photoPreview} alt="Foto do motorista" className="h-full w-full object-cover" />
                            ) : (
                                <UserSquare2 className="h-6 w-6 text-slate-400" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-slate-900 leading-tight">Foto do Motorista</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Perfil no app do motorista</p>
                        </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                        <SGFButton
                            type="button"
                            variant="outline"
                            size="sm"
                            icon={Camera}
                            onClick={() => photoInputRef.current?.click()}
                            className="w-full !rounded-full !h-9 text-xs !border-slate-200"
                        >
                            {photoPreview ? 'Trocar foto' : 'Enviar foto'}
                        </SGFButton>
                    </div>
                    <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoChange}
                    />
                </div>

                {/* Right Card: Card do Ler CNH com IA */}
                <div className="flex flex-col justify-between rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-slate-900 leading-tight">Ler CNH com IA</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Preenchimento automático</p>
                        </div>
                    </div>
                    <div className="pt-2 border-t border-emerald-500/10">
                        <SGFButton
                            type="button"
                            variant="primary"
                            size="sm"
                            icon={aiLoading ? Loader2 : Sparkles}
                            disabled={aiLoading}
                            onClick={() => cnhInputRef.current?.click()}
                            className="w-full !rounded-full !h-9 text-xs"
                        >
                            {aiLoading ? 'Lendo CNH...' : 'Escanear CNH'}
                        </SGFButton>
                    </div>
                    <input
                        ref={cnhInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCnhExtract}
                    />
                </div>
            </div>

            {/* Linha 1: Nome Completo (Largura Total) */}
            <SGFInput
                label="Nome Completo"
                placeholder="João da Silva"
                {...register('name')}
                error={errors.name?.message}
                fullWidth
            />

            {/* Linha 2: CPF e Matrícula (2 colunas) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SGFInput
                    label="CPF"
                    placeholder="000.000.000-00"
                    {...withMask(register('cpf'), maskCPF)}
                    error={errors.cpf?.message}
                    fullWidth
                />
                <SGFInput
                    label="Matrícula"
                    placeholder="MT001"
                    {...register('registrationNumber')}
                    error={errors.registrationNumber?.message}
                    fullWidth
                />
            </div>

            {/* Linha 3: Data de Nascimento e Telefone (2 colunas) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SGFInput
                    label="Data de Nascimento"
                    type="date"
                    {...register('birthDate')}
                    error={errors.birthDate?.message}
                    fullWidth
                />
                <SGFInput
                    label="Telefone"
                    placeholder="(00) 00000-0000"
                    {...withMask(register('phone'), maskPhone)}
                    error={errors.phone?.message}
                    fullWidth
                />
            </div>

            {/* Linha 4: E-mail (Largura Total) */}
            <SGFInput
                label="E-mail"
                placeholder="email@prefeitura.gov.br"
                type="email"
                autoComplete="new-email"
                {...register('email')}
                error={errors.email?.message}
                fullWidth
            />

            {/* Linha 5: Número da CNH, Categoria e Validade CNH (3 colunas) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SGFInput
                    label="Número da CNH"
                    placeholder="12345678900"
                    {...withMask(register('licenseNumber'), maskCNH)}
                    error={errors.licenseNumber?.message}
                    fullWidth
                />
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
                            placeholder="Selecione..."
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

            {/* Linha 6: CNH com EAR, Início do turno e Fim do turno (3 colunas na mesma linha) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-[var(--sgf-text-sm)] font-[var(--sgf-font-semibold)] text-[var(--sgf-text-primary)] mb-2">
                        Atividade remunerada
                    </label>
                    <Controller
                        name="cnhEar"
                        control={control}
                        render={({ field }) => (
                            <label className="flex items-center gap-2.5 h-[42px] cursor-pointer rounded-full border border-slate-200 bg-white px-4 py-2 shadow-[var(--sgf-shadow-xs)] hover:border-slate-300 transition-all">
                                <input
                                    type="checkbox"
                                    checked={field.value}
                                    onChange={(e) => field.onChange(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="text-xs font-semibold text-slate-700 select-none">
                                    CNH com EAR
                                </span>
                            </label>
                        )}
                    />
                </div>

                <SGFInput
                    label="Início do turno"
                    type="time"
                    {...register('shiftStart')}
                    error={errors.shiftStart?.message}
                    fullWidth
                />

                <SGFInput
                    label="Fim do turno"
                    type="time"
                    {...register('shiftEnd')}
                    error={errors.shiftEnd?.message}
                    fullWidth
                />
            </div>

            {/* Linha 7: Secretaria e Senha inicial (2 colunas) */}
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
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-[var(--sgf-text-sm)] font-[var(--sgf-font-semibold)] text-[var(--sgf-text-primary)]">
                            Senha inicial
                        </label>
                        <button
                            type="button"
                            onClick={handleGeneratePassword}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            Gerar senha
                        </button>
                    </div>
                    <SGFInput
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Mínimo 6 caracteres"
                        autoComplete="new-password"
                        icon={showPassword ? EyeOff : Eye}
                        iconPosition="right"
                        onIconClick={() => setShowPassword(!showPassword)}
                        {...register('password')}
                        error={errors.password?.message}
                        fullWidth
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-200/60">
                <SGFButton
                    type="button"
                    onClick={handleSendWhatsApp}
                    icon={WhatsAppIcon}
                    className="!rounded-full !bg-[#25D366] hover:!bg-[#20ba5a] !text-white !border-0 shadow-sm transition-all active:scale-[0.98]"
                >
                    Enviar Acesso
                </SGFButton>
                <SGFButton type="submit" icon={isSubmitting ? Loader2 : Save} disabled={isSubmitting} className="!rounded-full">
                    {isSubmitting ? 'Salvando...' : 'Cadastrar Motorista'}
                </SGFButton>
            </div>
        </form>
    );
}
