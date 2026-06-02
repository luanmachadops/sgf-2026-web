import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { PeriodPresetSelect, PeriodRangeFields, makePeriod, resolvePeriod, type PeriodValue } from './PeriodSelect';
import { useFuelTypeBreakdown } from '@/hooks/useDashboard';

export default function FuelExpenseChart() {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('1'));

    const { data: rawItems = [], isLoading, isError } = useFuelTypeBreakdown(resolvePeriod(period));

    // Lista canônica dos 4 tipos sempre visíveis (mesmo zerados),
    // mesclada com os valores reais do banco.
    const CANONICAL: Array<{ key: string; name: string; color: string }> = [
        { key: 'diesel',   name: 'Diesel',   color: '#10B981' },
        { key: 'gasolina', name: 'Gasolina', color: '#F59E0B' },
        { key: 'etanol',   name: 'Etanol',   color: '#F97316' },
        { key: 'flex',     name: 'Flex',     color: '#3B82F6' },
    ];
    const items = CANONICAL.map((c) => {
        const match = rawItems.find((r) => r.name.toLowerCase() === c.key);
        return {
            name: c.name,
            value: match?.value ?? 0,
            liters: match?.liters ?? 0,
            color: c.color,
        };
    });

    const total = items.reduce((acc, item) => acc + item.value, 0);
    const activeItem = activeIndex !== null ? items[activeIndex] : null;

    // Anéis concêntricos: um por tipo. Se o tipo tem valor 0, mostra só o trilho de fundo.
    const rings = items.map((item, index) => ({
        ...item,
        innerRadius: 84 - index * 12,
        outerRadius: 90 - index * 12,
        data: total > 0
            ? [
                { value: item.value, fill: item.color },
                { value: Math.max(total - item.value, 0), fill: 'transparent' },
            ]
            : [{ value: 1, fill: 'transparent' }],
    }));

    return (
        <div className="w-full h-full flex flex-col relative">
            <div className="flex justify-between items-center mb-2 z-20 relative gap-4">
                <h3 className="text-slate-900 font-bold text-lg">Gasto por Combustível</h3>
                <PeriodPresetSelect value={period} onChange={setPeriod} />
            </div>
            {period.preset === 'custom' && (
                <div className="mb-2 z-20 relative">
                    <PeriodRangeFields value={period} onChange={setPeriod} />
                </div>
            )}

            <div className="flex-1 w-full min-h-0 relative">
                {isError ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-rose-500 font-medium">
                        Erro ao carregar dados de combustível
                    </div>
                ) : isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 font-medium uppercase tracking-widest animate-pulse">
                        Carregando dados...
                    </div>
                ) : (
                    <>
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none pb-6">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">
                                    {activeItem ? activeItem.name : 'Total'}
                                </span>
                                <span
                                    className={cn('text-2xl font-black tracking-tighter transition-colors duration-300')}
                                    style={{ color: activeItem ? activeItem.color : '#0f172a' }}
                                >
                                    R$ {(activeItem ? activeItem.value : total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {activeItem && (
                                    <span className="text-slate-400 text-[10px] font-bold mt-1">
                                        {total > 0 ? Math.round((activeItem.value / total) * 100) : 0}%
                                    </span>
                                )}
                            </div>
                        </div>

                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                {rings.map((ring) => (
                                    <Pie
                                        key={`bg-${ring.name}`}
                                        data={[{ value: 1 }]}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={`${ring.innerRadius}%`}
                                        outerRadius={`${ring.outerRadius}%`}
                                        startAngle={90}
                                        endAngle={-270}
                                        dataKey="value"
                                        stroke="none"
                                        fill="#f3f4f5"
                                        opacity={1}
                                        isAnimationActive={false}
                                    />
                                ))}
                                {rings.map((ring, index) => (
                                    <Pie
                                        key={ring.name}
                                        data={ring.data}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={`${ring.innerRadius}%`}
                                        outerRadius={`${ring.outerRadius}%`}
                                        startAngle={90}
                                        endAngle={-270}
                                        dataKey="value"
                                        stroke="none"
                                        cornerRadius={10}
                                        onMouseEnter={() => setActiveIndex(index)}
                                        onMouseLeave={() => setActiveIndex(null)}
                                        className="cursor-pointer focus:outline-none"
                                    >
                                        {ring.data.map((entry, i) => (
                                            <Cell
                                                key={i}
                                                fill={entry.fill}
                                                className="transition-all duration-300 hover:opacity-80 focus:outline-none"
                                                opacity={activeIndex !== null && activeIndex !== index ? 0.3 : 1}
                                                stroke="none"
                                            />
                                        ))}
                                    </Pie>
                                ))}
                            </PieChart>
                        </ResponsiveContainer>
                    </>
                )}
            </div>

            {items.length > 0 && (
                <div className="flex w-full items-center justify-center gap-4 mt-2 shrink-0 h-6 flex-wrap">
                    {items.map((item, index) => (
                        <div
                            key={item.name}
                            className={cn(
                                'flex items-center gap-2 cursor-pointer transition-opacity duration-300',
                                activeIndex !== null && activeIndex !== index ? 'opacity-30' : 'opacity-100',
                            )}
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex(null)}
                        >
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-[10px] uppercase font-bold text-slate-600">{item.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
