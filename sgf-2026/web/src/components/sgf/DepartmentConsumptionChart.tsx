import { useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { PeriodPresetSelect, PeriodRangeFields, makePeriod, resolvePeriod, type PeriodValue } from './PeriodSelect';
import { useDepartmentConsumption } from '@/hooks/useDashboard';

export default function DepartmentConsumptionChart() {
    const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('1'));
    const { data: rows = [], isLoading, isError } = useDepartmentConsumption(resolvePeriod(period));

    return (
        <div className="w-full h-full flex flex-col relative">
            <div className="flex justify-between items-center mb-3 z-20 relative gap-4">
                <div>
                    <h3 className="text-slate-900 font-semibold text-base">Consumo por Secretaria</h3>
                    <p className="text-xs text-slate-400 font-medium">Combustível e Manutenção</p>
                </div>
                <PeriodPresetSelect value={period} onChange={setPeriod} />
            </div>
            {period.preset === 'custom' && (
                <div className="mb-3 z-20 relative">
                    <PeriodRangeFields value={period} onChange={setPeriod} />
                </div>
            )}

            <div className="flex-1 w-full min-h-0 relative">
                {isError ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-rose-500 font-medium">
                        Erro ao carregar consumo por secretaria
                    </div>
                ) : isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 font-medium uppercase tracking-widest animate-pulse">
                        Carregando dados...
                    </div>
                ) : rows.length === 0 || rows.every((r) => r.fuel === 0 && r.maintenance === 0) ? (
                    <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-slate-400 font-medium px-6">
                        Nenhum consumo registrado no período.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={rows}
                            margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
                            barSize={32}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                                tickFormatter={(value) => `R$${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
                            />
                            <Tooltip
                                cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const fuelValue = Number(payload.find((p) => p.dataKey === 'fuel')?.value ?? 0);
                                        const maintValue = Number(payload.find((p) => p.dataKey === 'maintenance')?.value ?? 0);
                                        const total = fuelValue + maintValue;
                                        return (
                                            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-xl min-w-[200px]">
                                                <p className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-50">
                                                    {label}
                                                </p>
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                            <span className="text-xs font-medium text-slate-500">Combustível</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-emerald-600">
                                                            R$ {fuelValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                            <span className="text-xs font-medium text-slate-500">Manutenção</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-amber-600">
                                                            R$ {maintValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
                                                        <span className="text-xs font-bold text-slate-400">Total</span>
                                                        <span className="text-sm font-black text-slate-800">
                                                            R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey="fuel" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
                            <Bar dataKey="maintenance" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
