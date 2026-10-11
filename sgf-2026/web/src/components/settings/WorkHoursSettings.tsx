import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Loader2, Plus, Save, Trash2 } from '@/components/sgf/icons';
import { ToggleRow } from '@/components/settings/SettingsToggle';
import { useSyncOnChange } from '@/hooks/useSyncOnChange';
import { useAuth } from '@/contexts/AuthContext';
import { departmentsApi } from '@/lib/supabase-api';
import {
    DEFAULT_SCHEDULE_DAYS,
    WEEKDAY_LABELS,
    alertSettingsApi,
    holidaysApi,
    scheduleRowsToDays,
    workSchedulesApi,
    type ScheduleDay,
} from '@/lib/alerts-api';
import { formatDate } from '@/lib/utils';

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <div>
                <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
            </div>
            {children}
        </section>
    );
}

function QueryState({ loading, error, children }: { loading: boolean; error: boolean; children: React.ReactNode }) {
    if (loading) return <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />;
    if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Não foi possível carregar. Feche e abra novamente.</p>;
    return <>{children}</>;
}

// ── Grade semanal ───────────────────────────────────────────────────────
function ScheduleGrid({ days, onChange }: { days: ScheduleDay[]; onChange: (days: ScheduleDay[]) => void }) {
    const patch = (weekday: number, changes: Partial<ScheduleDay>) =>
        onChange(days.map((d) => (d.weekday === weekday ? { ...d, ...changes } : d)));
    return (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {days.map((d) => (
                <div key={d.weekday} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <label className="flex w-40 items-center gap-2 text-sm font-medium text-slate-800">
                        <input
                            type="checkbox"
                            checked={d.active}
                            onChange={(e) => patch(d.weekday, { active: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 accent-[var(--sgf-primary)]"
                        />
                        {WEEKDAY_LABELS[d.weekday]}
                    </label>
                    {d.active ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <input
                                type="time"
                                aria-label={`Início — ${WEEKDAY_LABELS[d.weekday]}`}
                                value={d.start}
                                onChange={(e) => patch(d.weekday, { start: e.target.value })}
                                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
                            />
                            <span>até</span>
                            <input
                                type="time"
                                aria-label={`Fim — ${WEEKDAY_LABELS[d.weekday]}`}
                                value={d.end}
                                onChange={(e) => patch(d.weekday, { end: e.target.value })}
                                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
                            />
                        </div>
                    ) : (
                        <span className="text-xs text-slate-400">Sem expediente</span>
                    )}
                </div>
            ))}
        </div>
    );
}

export function WorkHoursSettings() {
    const qc = useQueryClient();
    const { user } = useAuth();

    const schedulesQuery = useQuery({ queryKey: ['work-schedules'], queryFn: workSchedulesApi.list });
    const holidaysQuery = useQuery({ queryKey: ['holidays'], queryFn: holidaysApi.list });
    const settingsQuery = useQuery({ queryKey: ['alert-settings'], queryFn: alertSettingsApi.get });
    const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.getAll() });

    const schedules = schedulesQuery.data;
    const [defaultDays, setDefaultDays] = useState<ScheduleDay[]>(DEFAULT_SCHEDULE_DAYS);
    const [departmentId, setDepartmentId] = useState('');
    const [departmentDays, setDepartmentDays] = useState<ScheduleDay[]>(DEFAULT_SCHEDULE_DAYS);

    const defaultRows = (schedules ?? []).filter((r) => r.department_id === null);
    const hasDefaultSchedule = defaultRows.length > 0;

    useSyncOnChange(schedules, () => {
        if (!schedules) return;
        setDefaultDays(hasDefaultSchedule ? scheduleRowsToDays(defaultRows) : DEFAULT_SCHEDULE_DAYS.map((d) => ({ ...d, active: false })));
        if (departmentId) setDepartmentDays(scheduleRowsToDays(schedules.filter((r) => r.department_id === departmentId)));
    });

    const selectDepartment = (id: string) => {
        setDepartmentId(id);
        const rows = (schedules ?? []).filter((r) => r.department_id === id);
        setDepartmentDays(rows.length ? scheduleRowsToDays(rows) : DEFAULT_SCHEDULE_DAYS);
    };
    const departmentHasSchedule = (schedules ?? []).some((r) => r.department_id === departmentId);

    const saveSchedule = useMutation({
        mutationFn: ({ scope, days }: { scope: string | null; days: ScheduleDay[] }) => workSchedulesApi.replace(scope, days),
        onSuccess: () => {
            toast.success('Expediente salvo.');
            qc.invalidateQueries({ queryKey: ['work-schedules'] });
        },
        onError: (e) => toast.error(errorMessage(e, 'Erro ao salvar o expediente.')),
    });

    // Feriados
    const [holidayDate, setHolidayDate] = useState('');
    const [holidayName, setHolidayName] = useState('');
    const addHoliday = useMutation({
        mutationFn: () => holidaysApi.add(holidayDate, holidayName),
        onSuccess: () => {
            toast.success('Feriado adicionado.');
            setHolidayDate('');
            setHolidayName('');
            qc.invalidateQueries({ queryKey: ['holidays'] });
        },
        onError: (e) => toast.error(errorMessage(e, 'Erro ao adicionar o feriado.')),
    });
    const removeHoliday = useMutation({
        mutationFn: (id: string) => holidaysApi.remove(id),
        onSuccess: () => {
            toast.success('Feriado removido.');
            qc.invalidateQueries({ queryKey: ['holidays'] });
        },
        onError: (e) => toast.error(errorMessage(e, 'Erro ao remover o feriado.')),
    });
    const canAddHoliday = Boolean(holidayDate) && holidayName.trim().length >= 3;

    // Tolerâncias e chaves
    const settings = settingsQuery.data;
    const [kmGap, setKmGap] = useState('5');
    const [consumptionPct, setConsumptionPct] = useState('25');
    const [requirePurpose, setRequirePurpose] = useState(false);
    const [autoOs, setAutoOs] = useState(false);
    useSyncOnChange(settings, () => {
        if (!settings) return;
        setKmGap(String(settings.kmGapTolerance));
        setConsumptionPct(String(settings.consumptionTolerancePct));
        setRequirePurpose(settings.requireTripPurpose);
        setAutoOs(settings.autoPreventiveOs);
    });

    const kmGapValue = Number(kmGap);
    const pctValue = Number(consumptionPct);
    const kmGapInvalid = !Number.isInteger(kmGapValue) || kmGapValue < 0;
    const pctInvalid = !Number.isInteger(pctValue) || pctValue < 1 || pctValue > 99;

    const saveSettings = useMutation({
        mutationFn: () => {
            const tenantId = settings?.tenantId ?? user?.tenantId;
            if (!tenantId) throw new Error('Prefeitura não identificada.');
            return alertSettingsApi.update(tenantId, {
                kmGapTolerance: kmGapValue,
                consumptionTolerancePct: pctValue,
                requireTripPurpose: requirePurpose,
                autoPreventiveOs: autoOs,
            });
        },
        onSuccess: (data) => {
            toast.success('Configurações salvas.');
            qc.setQueryData(['alert-settings'], data);
        },
        onError: (e) => toast.error(errorMessage(e, 'Erro ao salvar as configurações.')),
    });

    const departments = departmentsQuery.data ?? [];
    const busy = saveSchedule.isPending;

    return (
        <div className="space-y-8">
            <Section
                title="Expediente padrão da prefeitura"
                hint="Viagens iniciadas fora destes horários, em feriados ou em dias sem expediente geram alerta. Sem expediente cadastrado, o alerta de uso fora do horário fica desligado."
            >
                <QueryState loading={schedulesQuery.isLoading} error={schedulesQuery.isError}>
                    <ScheduleGrid days={defaultDays} onChange={setDefaultDays} />
                    <div className="flex justify-end">
                        <SGFButton
                            onClick={() => saveSchedule.mutate({ scope: null, days: defaultDays })}
                            disabled={busy}
                            icon={busy ? Loader2 : Save}
                        >
                            Salvar expediente padrão
                        </SGFButton>
                    </div>
                </QueryState>
            </Section>

            <Section
                title="Expediente por secretaria (opcional)"
                hint="Secretarias sem expediente próprio seguem o padrão da prefeitura."
            >
                <QueryState loading={schedulesQuery.isLoading || departmentsQuery.isLoading} error={schedulesQuery.isError || departmentsQuery.isError}>
                    <SGFSelect
                        label="Secretaria"
                        searchable
                        fullWidth
                        value={departmentId}
                        onChange={selectDepartment}
                        placeholder="Escolha uma secretaria"
                        options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    />
                    {departmentId && (
                        <>
                            <ScheduleGrid days={departmentDays} onChange={setDepartmentDays} />
                            <div className="flex flex-wrap justify-end gap-2">
                                {departmentHasSchedule && (
                                    <SGFButton
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() => saveSchedule.mutate(
                                            { scope: departmentId, days: DEFAULT_SCHEDULE_DAYS.map((d) => ({ ...d, active: false })) },
                                            { onSuccess: () => setDepartmentDays(DEFAULT_SCHEDULE_DAYS) },
                                        )}
                                    >
                                        Voltar ao padrão
                                    </SGFButton>
                                )}
                                <SGFButton
                                    disabled={busy}
                                    icon={busy ? Loader2 : Save}
                                    onClick={() => saveSchedule.mutate({ scope: departmentId, days: departmentDays })}
                                >
                                    Salvar expediente da secretaria
                                </SGFButton>
                            </div>
                        </>
                    )}
                </QueryState>
            </Section>

            <Section title="Feriados" hint="Nestas datas todo uso da frota é considerado fora do expediente.">
                <QueryState loading={holidaysQuery.isLoading} error={holidaysQuery.isError}>
                    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[170px_1fr_auto]">
                        <SGFInput label="Data" type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} fullWidth />
                        <SGFInput label="Descrição" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Ex.: Aniversário da cidade" fullWidth />
                        <SGFButton
                            onClick={() => addHoliday.mutate()}
                            disabled={!canAddHoliday || addHoliday.isPending}
                            icon={addHoliday.isPending ? Loader2 : Plus}
                        >
                            Adicionar
                        </SGFButton>
                    </div>
                    {(holidaysQuery.data ?? []).length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">Nenhum feriado cadastrado.</p>
                    ) : (
                        <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                            {(holidaysQuery.data ?? []).map((h) => (
                                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                    <div className="min-w-0 text-sm">
                                        <span className="font-semibold text-slate-800">{formatDate(`${h.date}T12:00:00`)}</span>
                                        <span className="ml-2 text-slate-600">{h.description}</span>
                                    </div>
                                    <button
                                        type="button"
                                        aria-label={`Remover feriado ${h.description}`}
                                        disabled={removeHoliday.isPending}
                                        onClick={() => removeHoliday.mutate(h.id)}
                                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </QueryState>
            </Section>

            <Section title="Tolerâncias e automações">
                <QueryState loading={settingsQuery.isLoading} error={settingsQuery.isError}>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <SGFInput
                            label="Tolerância de km entre viagens"
                            type="number"
                            min={0}
                            value={kmGap}
                            onChange={(e) => setKmGap(e.target.value)}
                            error={kmGapInvalid ? 'Informe um número inteiro a partir de 0.' : undefined}
                            hint="Diferença aceita entre o km final da viagem anterior e o inicial da próxima."
                            fullWidth
                        />
                        <SGFInput
                            label="Tolerância de consumo (%)"
                            type="number"
                            min={1}
                            max={99}
                            value={consumptionPct}
                            onChange={(e) => setConsumptionPct(e.target.value)}
                            error={pctInvalid ? 'Informe um inteiro entre 1 e 99.' : undefined}
                            hint="Queda de km/L aceita em relação à média do veículo."
                            fullWidth
                        />
                    </div>
                    <ToggleRow
                        title="Exigir finalidade nas viagens (app)"
                        desc="O motorista deverá informar origem e finalidade para iniciar a viagem."
                        checked={requirePurpose}
                        onChange={setRequirePurpose}
                    />
                    {requirePurpose && (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                            Ligue somente quando todos os motoristas estiverem com o app atualizado. Quem usar a versão antiga não conseguirá iniciar viagens.
                        </p>
                    )}
                    <ToggleRow
                        title="Abrir OS preventiva automaticamente"
                        desc="Cria a ordem de serviço quando o veículo atinge o prazo ou o km do plano de manutenção."
                        checked={autoOs}
                        onChange={setAutoOs}
                    />
                    <div className="flex justify-end">
                        <SGFButton
                            onClick={() => saveSettings.mutate()}
                            disabled={saveSettings.isPending || kmGapInvalid || pctInvalid}
                            icon={saveSettings.isPending ? Loader2 : Save}
                        >
                            {saveSettings.isPending ? 'Salvando...' : 'Salvar tolerâncias e automações'}
                        </SGFButton>
                    </div>
                </QueryState>
            </Section>
        </div>
    );
}
