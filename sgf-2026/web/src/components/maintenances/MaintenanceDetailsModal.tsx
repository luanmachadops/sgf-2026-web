import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { Wrench, Car, User, Gauge, Calendar, FileText } from '@/components/sgf/icons';
import { maintenancesApi } from '@/lib/supabase-api';
import { formatDate, getStatusLabel, getStatusColor } from '@/lib/utils';
import type { Tables } from '@/types/database.types';

interface Props {
    maintenanceId: string | null;
    onClose: () => void;
}

const PRIORITY_LABEL: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

type Row = Tables<'service_orders'> & {
    vehicles?: { plate: string; brand: string | null; model: string | null; departments?: { name: string } | null } | null;
    profiles?: { full_name: string } | null;
};

export function MaintenanceDetailsModal({ maintenanceId, onClose }: Props) {
    const { data, isLoading } = useQuery({
        queryKey: ['maintenance', maintenanceId],
        queryFn: () => maintenancesApi.getById(maintenanceId!),
        enabled: !!maintenanceId,
    });
    const m = data as Row | undefined;

    return (
        <Modal isOpen={!!maintenanceId} onClose={onClose} title="Detalhes da ordem de serviço" size="md">
            {isLoading || !m ? (
                <p className="py-8 text-center text-sm text-slate-400">Carregando…</p>
            ) : (
                <div className="space-y-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600"><Wrench className="h-5 w-5" /></div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Categoria</p>
                                <p className="font-bold text-slate-800">{m.category ?? '—'}</p>
                            </div>
                        </div>
                        <SGFBadge variant={getStatusColor(m.status) as 'default' | 'success' | 'warning' | 'error' | 'info'}>
                            {getStatusLabel(m.status)}
                        </SGFBadge>
                    </div>

                    {m.description && (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400"><FileText className="h-3.5 w-3.5" /> Descrição</p>
                            <p className="text-sm text-slate-700">{m.description}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { icon: Car, label: 'Veículo', value: m.vehicles ? `${m.vehicles.brand ?? ''} ${m.vehicles.model ?? ''} · ${m.vehicles.plate}`.trim() : '—' },
                            { icon: User, label: 'Solicitante', value: m.profiles?.full_name ?? '—' },
                            { icon: Gauge, label: 'Odômetro', value: m.odometer != null ? `${Number(m.odometer).toLocaleString('pt-BR')} km` : '—' },
                            { icon: Calendar, label: 'Aberta em', value: formatDate(m.created_at) },
                            { icon: Wrench, label: 'Prioridade', value: PRIORITY_LABEL[m.priority] ?? m.priority },
                            ...(m.approved_at ? [{ icon: Calendar, label: 'Aprovada em', value: formatDate(m.approved_at) }] : []),
                        ].map((it) => {
                            const I = it.icon;
                            return (
                                <div key={it.label} className="flex items-center gap-3">
                                    <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><I width={18} height={18} /></div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{it.label}</p>
                                        <p className="truncate font-bold text-slate-800">{it.value}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {m.admin_note && (
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">Observação do gestor</p>
                            <p className="text-sm text-blue-900">{m.admin_note}</p>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}

export default MaintenanceDetailsModal;
