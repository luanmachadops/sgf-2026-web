import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Loader2, Plus, Wrench } from '@/components/sgf/icons';
import {
    maintenancePlansApi,
    describeRemaining,
    planStatusKey,
    PLAN_STATUS_META,
    SERVICE_SUGGESTIONS,
    type MaintenancePlanStatus,
} from '@/lib/fleet-api';
import { formatDay } from '@/lib/dateOnly';

interface Props {
    vehicleId: string;
    canManage: boolean;
}

export function VehiclePreventiveTab({ vehicleId, canManage }: Props) {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<MaintenancePlanStatus | 'new' | null>(null);

    const { data: plans = [], isLoading, isError } = useQuery({
        queryKey: ['vehicle', vehicleId, 'maintenance-plans'],
        queryFn: () => maintenancePlansApi.getByVehicle(vehicleId),
    });

    const { data: openPlanIds = new Set<string>() } = useQuery({
        queryKey: ['maintenance-plans', 'open-orders'],
        queryFn: () => maintenancePlansApi.getOpenOrderPlanIds(),
    });

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId, 'maintenance-plans'] });
        queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    const toggleMutation = useMutation({
        mutationFn: ({ id, active }: { id: string; active: boolean }) => maintenancePlansApi.setActive(id, active),
        onSuccess: (_, v) => { toast.success(v.active ? 'Plano reativado.' : 'Plano desativado.'); refresh(); },
        onError: (e) => toast.error((e as Error).message || 'Não foi possível alterar o plano.'),
    });

    const openOsMutation = useMutation({
        mutationFn: (plan: MaintenancePlanStatus) => maintenancePlansApi.openServiceOrder(plan),
        onSuccess: () => {
            toast.success('Ordem de serviço preventiva aberta.');
            queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] });
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId, 'maintenances'] });
        },
        onError: (e) => toast.error((e as Error).message || 'Não foi possível abrir a OS.'),
    });

    return (
        <SGFCard title="Manutenção preventiva" icon={Wrench}>
            {canManage && (
                <div className="mb-4 flex justify-end">
                    <SGFButton size="sm" icon={Plus} onClick={() => setEditing('new')} className="!rounded-full">
                        Novo plano
                    </SGFButton>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                </div>
            ) : isError ? (
                <p className="py-6 text-center text-sm text-rose-600">Não foi possível carregar os planos.</p>
            ) : plans.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Nenhum plano de preventiva para este veículo.</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {plans.map((plan) => {
                        const key = planStatusKey(plan.status);
                        const meta = PLAN_STATUS_META[key];
                        const hasOpenOs = plan.plan_id ? openPlanIds.has(plan.plan_id) : false;
                        const canOpenOs = canManage && plan.active;
                        return (
                            <li key={plan.plan_id ?? plan.service_type} className={`flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between ${plan.active ? '' : 'opacity-60'}`}>
                                <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-bold text-slate-900">{plan.service_label}</p>
                                        {plan.active ? (
                                            <SGFBadge variant={meta.variant} size="sm">{meta.label}</SGFBadge>
                                        ) : (
                                            <SGFBadge variant="default" size="sm">Desativado</SGFBadge>
                                        )}
                                        {hasOpenOs && <SGFBadge variant="info" size="sm">OS aberta</SGFBadge>}
                                    </div>
                                    {plan.active && (
                                        <p className="text-sm text-slate-600">{describeRemaining(plan).join(' · ') || '—'}</p>
                                    )}
                                    <p className="text-xs text-slate-500">
                                        A cada {[plan.interval_km != null ? `${plan.interval_km.toLocaleString('pt-BR')} km` : null, plan.interval_days != null ? `${plan.interval_days} dias` : null].filter(Boolean).join(' ou ')}
                                        {' · '}aviso a {plan.warn_pct}%
                                        {' · '}última: {plan.last_done_km != null ? `${plan.last_done_km.toLocaleString('pt-BR')} km` : '—'} em {formatDay(plan.last_done_at)}
                                    </p>
                                </div>
                                {canManage && plan.plan_id && (
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                        {canOpenOs && !hasOpenOs && (
                                            <SGFButton
                                                size="sm"
                                                disabled={openOsMutation.isPending}
                                                onClick={() => openOsMutation.mutate(plan)}
                                                className="!rounded-full"
                                            >
                                                Abrir OS
                                            </SGFButton>
                                        )}
                                        <SGFButton size="sm" variant="outline" onClick={() => setEditing(plan)} className="!rounded-full">Editar</SGFButton>
                                        <SGFButton
                                            size="sm"
                                            variant="ghost"
                                            disabled={toggleMutation.isPending}
                                            onClick={() => toggleMutation.mutate({ id: plan.plan_id!, active: !plan.active })}
                                            className="!rounded-full"
                                        >
                                            {plan.active ? 'Desativar' : 'Reativar'}
                                        </SGFButton>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <PlanFormModal
                vehicleId={vehicleId}
                plan={editing && editing !== 'new' ? editing : null}
                isOpen={editing !== null}
                onClose={() => setEditing(null)}
                onSaved={refresh}
            />
        </SGFCard>
    );
}

function PlanFormModal({ vehicleId, plan, isOpen, onClose, onSaved }: {
    vehicleId: string;
    plan: MaintenancePlanStatus | null;
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    // O estado é recriado a cada abertura via key no modal interno.
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={plan ? 'Editar plano' : 'Novo plano de preventiva'} size="lg">
            {isOpen && <PlanForm key={plan?.plan_id ?? 'new'} vehicleId={vehicleId} plan={plan} onClose={onClose} onSaved={onSaved} />}
        </Modal>
    );
}

function PlanForm({ vehicleId, plan, onClose, onSaved }: {
    vehicleId: string;
    plan: MaintenancePlanStatus | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [label, setLabel] = useState(plan?.service_label ?? '');
    const [intervalKm, setIntervalKm] = useState(plan?.interval_km != null ? String(plan.interval_km) : '');
    const [intervalDays, setIntervalDays] = useState(plan?.interval_days != null ? String(plan.interval_days) : '');
    const [warnPct, setWarnPct] = useState(String(plan?.warn_pct ?? 10));
    const [lastKm, setLastKm] = useState(plan?.last_done_km != null ? String(plan.last_done_km) : '');
    const [lastAt, setLastAt] = useState(plan?.last_done_at ?? '');
    const [error, setError] = useState<string | null>(null);
    const listId = useMemo(() => `service-suggestions-${vehicleId}`, [vehicleId]);

    const mutation = useMutation({
        mutationFn: () => {
            const payload = {
                serviceLabel: label,
                intervalKm: intervalKm ? Math.round(Number(intervalKm)) : null,
                intervalDays: intervalDays ? Math.round(Number(intervalDays)) : null,
                warnPct: Math.round(Number(warnPct)),
                lastDoneKm: lastKm ? Math.round(Number(lastKm)) : null,
                lastDoneAt: lastAt || null,
            };
            return plan?.plan_id
                ? maintenancePlansApi.update(plan.plan_id, payload)
                : maintenancePlansApi.create({ vehicleId, ...payload });
        },
        onSuccess: () => {
            toast.success(plan ? 'Plano atualizado.' : 'Plano criado.');
            onSaved();
            onClose();
        },
        onError: (e) => setError((e as Error).message || 'Não foi possível salvar o plano.'),
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!label.trim()) return setError('Informe o tipo de serviço.');
        const km = intervalKm ? Number(intervalKm) : null;
        const days = intervalDays ? Number(intervalDays) : null;
        if (km == null && days == null) return setError('Informe o intervalo em km e/ou em dias.');
        if ((km != null && km <= 0) || (days != null && days <= 0)) return setError('Os intervalos devem ser maiores que zero.');
        const pct = Number(warnPct);
        if (!Number.isFinite(pct) || pct < 1 || pct > 100) return setError('O aviso deve ficar entre 1% e 100%.');
        if (lastKm && Number(lastKm) < 0) return setError('Km da última realização inválido.');
        mutation.mutate();
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <div>
                <SGFInput
                    label="Tipo de serviço"
                    list={listId}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Ex.: Troca de óleo"
                    fullWidth
                />
                <datalist id={listId}>
                    {SERVICE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                </datalist>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SGFInput label="Intervalo (km)" type="number" min="1" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} placeholder="Ex.: 10000" fullWidth />
                <SGFInput label="Intervalo (dias)" type="number" min="1" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} placeholder="Ex.: 180" fullWidth />
                <SGFInput label="Aviso (%)" type="number" min="1" max="100" value={warnPct} onChange={(e) => setWarnPct(e.target.value)} hint="Fica 'próximo' quando restar até este % do intervalo" fullWidth />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SGFInput label="Última realização (km)" type="number" min="0" value={lastKm} onChange={(e) => setLastKm(e.target.value)} placeholder="Odômetro" fullWidth />
                <SGFInput label="Última realização (data)" type="date" value={lastAt} onChange={(e) => setLastAt(e.target.value)} fullWidth />
            </div>
            <p className="text-xs text-slate-500">Sem a última realização o plano fica "sem base" até a primeira OS preventiva ser concluída.</p>
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
            <ModalFooter>
                <SGFButton type="button" variant="ghost" onClick={onClose}>Cancelar</SGFButton>
                <SGFButton type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Salvando...' : 'Salvar plano'}
                </SGFButton>
            </ModalFooter>
        </form>
    );
}
