import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, LockKeyhole, Save, Eye, EyeOff } from '@/components/sgf/icons';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import type { DriverRecord } from '@/hooks/useDrivers';
import { useProvisionDriverAccess, useResetDriverPassword } from '@/hooks/useDrivers';

const accessSchema = z.object({
    password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres').max(20, 'Senha deve ter no máximo 20 caracteres'),
    confirmPassword: z.string().min(6, 'Confirme a senha'),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
});

type DriverAccessFormData = z.infer<typeof accessSchema>;

interface DriverAccessFormProps {
    driver: DriverRecord;
    mode: 'provision' | 'reset';
    onSuccess: () => void;
    onCancel: () => void;
}

export function DriverAccessForm({ driver, mode, onSuccess, onCancel }: DriverAccessFormProps) {
    const provisionAccessMutation = useProvisionDriverAccess();
    const resetPasswordMutation = useResetDriverPassword();
    const isProvisionMode = mode === 'provision';

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<DriverAccessFormData>({
        resolver: zodResolver(accessSchema),
    });

    const onSubmit = async (data: DriverAccessFormData) => {
        try {
            if (isProvisionMode) {
                await provisionAccessMutation.mutateAsync({
                    id: driver.id,
                    password: data.password,
                });
                toast.success('Acesso do motorista criado com sucesso.');
            } else {
                await resetPasswordMutation.mutateAsync({
                    id: driver.id,
                    password: data.password,
                });
                toast.success('Senha do motorista redefinida com sucesso.');
            }

            onSuccess();
        } catch (error: any) {
            console.error('Driver access action failed:', error);
            toast.error(error?.message || 'Não foi possível concluir a operação.');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                        <LockKeyhole width={18} height={18} />
                    </div>
                    <div>
                        <p className="font-semibold text-slate-900">{driver.name}</p>
                        <p className="text-sm text-slate-500">CPF {driver.cpf}</p>
                        <p className="mt-1 text-xs text-slate-500">
                            {isProvisionMode
                                ? 'Crie a senha inicial para liberar o acesso do motorista no app.'
                                : 'Defina uma nova senha para substituir o acesso atual do motorista.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <SGFInput
                    label="Nova senha"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mínimo de 6 caracteres"
                    {...register('password')}
                    error={errors.password?.message}
                    icon={showPassword ? EyeOff : Eye}
                    iconPosition="right"
                    onIconClick={() => setShowPassword((s) => !s)}
                    fullWidth
                />
                <SGFInput
                    label="Confirmar senha"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Repita a senha"
                    {...register('confirmPassword')}
                    error={errors.confirmPassword?.message}
                    icon={showConfirmPassword ? EyeOff : Eye}
                    iconPosition="right"
                    onIconClick={() => setShowConfirmPassword((s) => !s)}
                    fullWidth
                />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <SGFButton type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                    Cancelar
                </SGFButton>
                <SGFButton type="submit" icon={isSubmitting ? Loader2 : Save} disabled={isSubmitting}>
                    {isSubmitting
                        ? 'Salvando...'
                        : isProvisionMode
                            ? 'Criar acesso'
                            : 'Redefinir senha'}
                </SGFButton>
            </div>
        </form>
    );
}
