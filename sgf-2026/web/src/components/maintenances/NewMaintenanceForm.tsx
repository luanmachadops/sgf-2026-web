import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Loader2, Save, Wrench, Calendar, FileText, Car } from '@/components/sgf/icons';
import { toast } from 'sonner';
import { useVehicles } from '@/hooks/useVehicles';
import { useCreateMaintenance, useUpdateMaintenance } from '@/hooks/useMaintenances';
import { useAuth } from '@/contexts/AuthContext';
import { VehiclePickerField } from '@/components/sgf/VehiclePickerField';

// Schema alinhado aos enums do banco (service_orders)
const maintenanceSchema = z.object({
    vehicleId: z.string().min(1, 'Veículo é obrigatório'),
    category: z.string().min(1, 'Categoria é obrigatória'),
    categoryOther: z.string().optional(),
    priority: z.enum(['baixa', 'media', 'alta']),
    description: z.string().min(5, 'Descrição deve ter pelo menos 5 caracteres'),
    scheduledDate: z.string().min(1, 'Data é obrigatória'),
    odometer: z.coerce.number().min(0).optional(),
}).refine(
    (data) => data.category !== 'Outro' || (data.categoryOther?.trim().length ?? 0) >= 2,
    { path: ['categoryOther'], message: 'Informe a categoria' }
);

// `z.coerce.number()` gera tipos de entrada (unknown) e saída (number) distintos;
// separamos os dois para alinhar com a tipagem do react-hook-form + zodResolver.
type MaintenanceFormInput = z.input<typeof maintenanceSchema>;
type MaintenanceFormData = z.output<typeof maintenanceSchema>;

export interface MaintenanceEditData {
    id: string;
    vehicleId: string;
    category: string;
    priority: 'baixa' | 'media' | 'alta';
    description: string;
    odometer: number | null;
    scheduledDate?: string;
}

interface NewMaintenanceFormProps {
    onSuccess: () => void;
    onCancel: () => void;
    /** Quando informado, o formulário entra em modo de edição da O.S. */
    editData?: MaintenanceEditData;
}

const categoryOptions = [
    { value: 'Troca de óleo', label: 'Troca de óleo' },
    { value: 'Revisão geral', label: 'Revisão geral' },
    { value: 'Freios', label: 'Freios' },
    { value: 'Suspensão', label: 'Suspensão' },
    { value: 'Pneus', label: 'Pneus' },
    { value: 'Elétrica', label: 'Elétrica' },
    { value: 'Funilaria', label: 'Funilaria' },
    { value: 'Ar condicionado', label: 'Ar condicionado' },
    { value: 'Motor', label: 'Motor' },
    { value: 'Câmbio', label: 'Câmbio' },
    { value: 'Outro', label: 'Outro' },
];

const priorityOptions = [
    { value: 'baixa', label: 'Baixa' },
    { value: 'media', label: 'Média' },
    { value: 'alta', label: 'Alta' },
];

export function NewMaintenanceForm({ onSuccess, onCancel, editData }: NewMaintenanceFormProps) {
    const { user } = useAuth();
    const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
    const createMaintenance = useCreateMaintenance();
    const updateMaintenance = useUpdateMaintenance();
    const isEdit = Boolean(editData);

    // Categoria fora da lista padrão (edição) vira "Outro" + texto livre.
    const knownCategory = editData ? categoryOptions.some((o) => o.value === editData.category) : true;

    const {
        register,
        handleSubmit,
        control,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<MaintenanceFormInput, unknown, MaintenanceFormData>({
        resolver: zodResolver(maintenanceSchema),
        defaultValues: editData
            ? {
                  vehicleId: editData.vehicleId,
                  category: knownCategory ? editData.category : 'Outro',
                  categoryOther: knownCategory ? '' : editData.category,
                  priority: editData.priority,
                  description: editData.description,
                  scheduledDate: editData.scheduledDate ?? new Date().toISOString().split('T')[0],
                  odometer: editData.odometer ?? undefined,
              }
            : {
                  category: '',
                  categoryOther: '',
                  priority: 'media',
                  description: '',
                  scheduledDate: new Date().toISOString().split('T')[0],
              },
    });

    const onSubmit = async (data: MaintenanceFormData) => {
        if (!user?.id) {
            toast.error('Usuário não autenticado.');
            return;
        }

        const category = data.category === 'Outro' ? (data.categoryOther?.trim() || 'Outro') : data.category;

        try {
            if (isEdit && editData) {
                await updateMaintenance.mutateAsync({
                    id: editData.id,
                    data: {
                        vehicle_id: data.vehicleId,
                        category,
                        priority: data.priority,
                        description: data.description,
                        odometer: data.odometer ?? null,
                    },
                });
                toast.success('Ordem de serviço atualizada!');
            } else {
                await createMaintenance.mutateAsync({
                    vehicle_id: data.vehicleId,
                    driver_id: user.id,
                    category,
                    priority: data.priority,
                    description: data.description,
                    odometer: data.odometer ?? null,
                    status: 'pendente',
                });
                toast.success('Manutenção registrada com sucesso!');
            }
            onSuccess();
        } catch {
            toast.error(isEdit ? 'Erro ao atualizar a O.S.' : 'Erro ao registrar manutenção.');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <Controller
                        name="vehicleId"
                        control={control}
                        render={({ field }) => (
                            <VehiclePickerField
                                vehicles={vehicles}
                                value={field.value}
                                onChange={field.onChange}
                                loading={vehiclesLoading}
                                error={errors.vehicleId?.message}
                            />
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Controller
                        name="category"
                        control={control}
                        render={({ field }) => (
                            <SGFSelect
                                label="Categoria"
                                options={categoryOptions}
                                value={field.value}
                                onChange={field.onChange}
                                error={errors.category?.message}
                                placeholder="Selecione..."
                                fullWidth
                                icon={Wrench}
                            />
                        )}
                    />

                    <Controller
                        name="priority"
                        control={control}
                        render={({ field }) => (
                            <SGFSelect
                                label="Prioridade"
                                options={priorityOptions}
                                value={field.value}
                                onChange={field.onChange}
                                error={errors.priority?.message}
                                fullWidth
                            />
                        )}
                    />
                </div>

                {watch('category') === 'Outro' && (
                    <SGFInput
                        label="Qual a categoria?"
                        placeholder="Descreva a categoria"
                        {...register('categoryOther')}
                        error={errors.categoryOther?.message}
                        fullWidth
                        icon={Wrench}
                    />
                )}

                <SGFInput
                    label="Data Agendada"
                    type="date"
                    {...register('scheduledDate')}
                    error={errors.scheduledDate?.message}
                    fullWidth
                    icon={Calendar}
                />

                <SGFInput
                    label="Odômetro Atual (Opcional)"
                    type="number"
                    placeholder="Ex: 45230"
                    {...register('odometer')}
                    error={errors.odometer?.message}
                    fullWidth
                    icon={Car}
                />

                <div className="md:col-span-2">
                    <SGFTextarea
                        label="Descrição do Problema / Serviço"
                        placeholder="Ex: Barulho na suspensão dianteira, troca de pastilhas de freio, etc."
                        {...register('description')}
                        error={errors.description?.message}
                        fullWidth
                        rows={3}
                        maxLength={500}
                        showCount
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <SGFButton type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                    Cancelar
                </SGFButton>
                <SGFButton
                    type="submit"
                    icon={isSubmitting ? Loader2 : Save}
                    disabled={isSubmitting || vehiclesLoading}
                >
                    {isSubmitting ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Registrar Manutenção'}
                </SGFButton>
            </div>
        </form>
    );
}
