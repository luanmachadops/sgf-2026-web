import { useEffect, useRef, useState } from 'react';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Car } from '@/components/sgf/icons';
import { formatPlate } from '@/lib/utils';

export interface VehicleLike {
    id: string;
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    photo_url?: string | null;
    unit_code?: string | null;
    departments?: { name?: string | null } | null;
}

interface VehiclePickerFieldProps {
    vehicles: VehicleLike[];
    /** id do veículo selecionado */
    value: string;
    onChange: (id: string) => void;
    label?: string;
    placeholder?: string;
    loading?: boolean;
    error?: string;
}

/**
 * Seletor de veículo com busca + dropdown mostrando foto + placa + secretaria + modelo,
 * e um card do veículo selecionado com botão "Alterar". Reutilizado em vários modais.
 */
export function VehiclePickerField({
    vehicles,
    value,
    onChange,
    label = 'Veículo',
    placeholder,
    loading = false,
    error,
}: VehiclePickerFieldProps) {
    const [search, setSearch] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const selected = vehicles.find((v) => v.id === value);

    const filtered = vehicles.filter((v) => {
        const s = search.toLowerCase();
        return (v.plate || '').toLowerCase().includes(s)
            || (v.brand || '').toLowerCase().includes(s)
            || (v.model || '').toLowerCase().includes(s)
            || (v.unit_code || '').toLowerCase().includes(s)
            || (v.departments?.name || '').toLowerCase().includes(s);
    });

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setShowSuggestions(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    return (
        <div>
            {label && <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>}
            {selected ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 animate-in fade-in duration-200">
                    {selected.photo_url ? (
                        <img src={selected.photo_url} alt={`${selected.brand} ${selected.model}`} className="h-12 w-12 shrink-0 rounded-lg object-cover border border-slate-100" />
                    ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                            <Car className="h-6 w-6" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm font-bold text-slate-900 truncate">{formatPlate(selected.plate || '') || selected.unit_code}</p>
                        <p className="text-xs font-semibold text-slate-700 truncate">{selected.brand} {selected.model}</p>
                        {selected.departments?.name && (
                            <p className="text-[11px] text-slate-400 truncate">{selected.departments.name}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => { onChange(''); setSearch(''); }}
                        className="shrink-0 rounded-full border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                    >
                        Trocar
                    </button>
                </div>
            ) : (
                <div className="relative" ref={ref}>
                    <SGFInput
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder={loading ? 'Carregando veículos...' : (placeholder ?? 'Buscar por placa, modelo ou secretaria...')}
                        error={error}
                        fullWidth
                        icon={Car}
                    />
                    {showSuggestions && filtered.length > 0 && (
                        <div className="absolute z-[3000] left-0 right-0 top-full mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-lg custom-scrollbar">
                            {filtered.map((v) => (
                                <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => { onChange(v.id); setSearch(''); setShowSuggestions(false); }}
                                    className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-left hover:bg-emerald-50 transition-colors"
                                >
                                    {v.photo_url ? (
                                        <img src={v.photo_url} alt={`${v.brand} ${v.model}`} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                                    ) : (
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                            <Car className="h-4 w-4" />
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="font-mono text-sm font-bold text-slate-900">
                                            {formatPlate(v.plate || '') || v.unit_code}
                                            {v.departments?.name && (
                                                <span className="ml-2 font-sans text-xs font-normal text-slate-400">· {v.departments.name}</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-slate-500 truncate">{v.brand} {v.model}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default VehiclePickerField;
