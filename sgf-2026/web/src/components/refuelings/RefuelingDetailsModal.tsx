import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { Car, User, MapPin, AlertTriangle } from '@/components/sgf/icons';
import { refuelingsApi } from '@/lib/supabase-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

interface Props {
    refuelingId: string | null;
    onClose: () => void;
}

const FUEL_LABEL: Record<string, string> = { diesel: 'Diesel', gasolina: 'Gasolina', etanol: 'Etanol', flex: 'Flex' };

type FuelingRow = {
    created_at: string;
    odometer: number | null;
    liters: number | null;
    total_cost: number | null;
    price_per_liter: number | null;
    km_per_liter: number | null;
    fuel_type: string | null;
    has_anomaly: boolean | null;
    photo_dashboard_url: string | null;
    photo_receipt_url: string | null;
    station: string | null;
    vehicles?: { plate: string; brand: string | null; model: string | null } | null;
    profiles?: { full_name: string } | null;
};

export function RefuelingDetailsModal({ refuelingId, onClose }: Props) {
    const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);
    const { data, isLoading } = useQuery({
        queryKey: ['refueling', refuelingId],
        queryFn: () => refuelingsApi.getById(refuelingId!),
        enabled: !!refuelingId,
    });
    const r = data as unknown as FuelingRow | undefined;

    const dash = r?.photo_dashboard_url ?? null;
    const receipt = r?.photo_receipt_url ?? null;
    const photos = [dash, receipt].filter(Boolean) as string[];
    const vehicleLabel = r?.vehicles ? `${r.vehicles.brand ?? ''} ${r.vehicles.model ?? ''} · ${r.vehicles.plate}`.trim() : '—';
    const consumption = Number(r?.km_per_liter ?? 0);

    return (
        <>
            <Modal isOpen={!!refuelingId} onClose={onClose} title="Detalhes do abastecimento" size="lg">
                {isLoading || !r ? (
                    <p className="py-8 text-center text-sm text-slate-400">Carregando…</p>
                ) : (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-500">{formatDate(r.created_at)}{r.station ? ` · ${r.station}` : ''}</p>
                            {r.has_anomaly && <SGFBadge variant="warning">Anomalia detectada</SGFBadge>}
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-4">
                                {[
                                    { icon: Car, label: 'Veículo', value: vehicleLabel },
                                    { icon: User, label: 'Motorista', value: r.profiles?.full_name ?? '—' },
                                    { icon: MapPin, label: 'Odômetro', value: `${Number(r.odometer ?? 0).toLocaleString('pt-BR')} km` },
                                ].map((it) => {
                                    const I = it.icon;
                                    return (
                                        <div key={it.label} className="flex items-center gap-3">
                                            <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><I width={20} height={20} /></div>
                                            <div>
                                                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{it.label}</p>
                                                <p className="font-bold text-slate-800">{it.value}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="space-y-3 rounded-3xl border border-slate-100 bg-slate-50 p-5">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Resumo financeiro</p>
                                    <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{FUEL_LABEL[(r.fuel_type ?? '').toLowerCase()] ?? r.fuel_type ?? '—'}</span>
                                </div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Quantidade</span><span className="font-bold text-slate-800">{Number(r.liters ?? 0).toFixed(1)} L</span></div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Preço p/ litro</span><span className="font-bold text-slate-800">{formatCurrency(Number(r.price_per_liter ?? 0))}</span></div>
                                <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-bold text-slate-500">Valor total</span><span className="text-xl font-black text-emerald-600">{formatCurrency(Number(r.total_cost ?? 0))}</span></div>
                                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Consumo</p>
                                    <span className={cn('text-lg font-black', consumption > 8 ? 'text-emerald-600' : 'text-amber-600')}>
                                        {consumption ? `${consumption.toFixed(1)} km/L` : '—'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Comprovantes</p>
                            {photos.length === 0 ? (
                                <p className="text-sm text-slate-400">Sem fotos anexadas.</p>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {dash && (
                                        <button onClick={() => setViewer({ images: photos, index: 0 })} className="group relative aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                            <img src={dash} alt="Painel" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">Painel / Hodômetro</span>
                                        </button>
                                    )}
                                    {receipt && (
                                        <button onClick={() => setViewer({ images: photos, index: dash ? 1 : 0 })} className="group relative aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                            <img src={receipt} alt="Cupom" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">Cupom fiscal</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {r.has_anomaly && (
                            <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                <p className="text-sm font-medium text-amber-800"><span className="font-black">Anomalia:</span> registro fora do padrão esperado.</p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
            <PhotoViewer images={viewer?.images} startIndex={viewer?.index ?? 0} onClose={() => setViewer(null)} />
        </>
    );
}

export default RefuelingDetailsModal;
