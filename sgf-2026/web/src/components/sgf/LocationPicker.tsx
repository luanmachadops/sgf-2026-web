import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize, Minimize, MapPin, Search, Loader2 } from '@/components/sgf/icons';
import { geocodeSearch, reverseGeocode, GEOCODER_PROVIDER, type GeoResult } from '@/lib/geocoding';

type LatLng = { lat: number; lng: number };

const PIN = L.divIcon({
    className: 'location-pin',
    html: '<div style="width:26px;height:26px;background:#EF4444;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
});

const BRAZIL: [number, number] = [-15.78, -47.93];

function ClickToPin({ onPick, disabled }: { onPick: (p: LatLng) => void; disabled?: boolean }) {
    useMapEvents({ click: (e) => { if (!disabled) onPick({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
    return null;
}

/** Recentraliza só quando o alvo muda de fato (não a cada render). */
function Recenter({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
    const map = useMap();
    useEffect(() => { map.setView([lat, lng], zoom); }, [map, lat, lng, zoom]);
    return null;
}

/** Ajusta o tamanho do Leaflet quando o contêiner muda (tela cheia). */
function InvalidateOnResize({ token }: { token: unknown }) {
    const map = useMap();
    useEffect(() => { const t = window.setTimeout(() => map.invalidateSize(), 60); return () => window.clearTimeout(t); }, [map, token]);
    return null;
}

/**
 * Local com busca de endereço + mapa. Digitar mostra sugestões (Google se
 * houver chave, senão OpenStreetMap); escolher uma posiciona o alfinete.
 * Clicar/arrastar no mapa também define o ponto e atualiza o endereço.
 */
export function LocationPicker({ value, onChange, address, onAddressChange, cityHint, disabled }: {
    value: LatLng | null;
    onChange: (p: LatLng) => void;
    address: string;
    onAddressChange: (text: string) => void;
    /** Cidade da prefeitura: prioriza resultados nela. */
    cityHint?: string;
    disabled?: boolean;
}) {
    const [fullscreen, setFullscreen] = useState(false);
    const [results, setResults] = useState<GeoResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);
    const typedRef = useRef(false);

    // Busca com atraso enquanto o usuário digita.
    useEffect(() => {
        if (!typedRef.current) return;
        const q = address.trim();
        if (q.length < 3) return;
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => {
            setSearching(true);
            geocodeSearch(q, cityHint, ctrl.signal)
                .then((r) => { setResults(r); setOpen(true); })
                .catch(() => undefined)
                .finally(() => setSearching(false));
        }, 450);
        return () => { ctrl.abort(); window.clearTimeout(timer); };
    }, [address, cityHint]);

    const pick = (r: GeoResult) => {
        typedRef.current = false;
        onAddressChange(r.label);
        onChange({ lat: r.lat, lng: r.lng });
        setOpen(false);
    };

    // Ponto definido no mapa: preenche o endereço daquele ponto.
    const pinFromMap = (p: LatLng) => {
        onChange(p);
        typedRef.current = false;
        void reverseGeocode(p.lat, p.lng).then((label) => { if (label) onAddressChange(label); });
    };

    useEffect(() => {
        if (!fullscreen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setFullscreen(false); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [fullscreen]);

    const center: [number, number] = value ? [value.lat, value.lng] : BRAZIL;
    const zoom = value ? 16 : 4;

    const map = (
        <div className="relative h-full w-full">
            <MapContainer center={center} zoom={zoom} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Recenter lat={center[0]} lng={center[1]} zoom={zoom} />
                <InvalidateOnResize token={fullscreen} />
                <ClickToPin onPick={pinFromMap} disabled={disabled} />
                {value && (
                    <Marker
                        position={[value.lat, value.lng]}
                        icon={PIN}
                        draggable={!disabled}
                        eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); pinFromMap({ lat: p.lat, lng: p.lng }); } }}
                    />
                )}
            </MapContainer>
            <button
                type="button"
                onClick={() => setFullscreen((v) => !v)}
                aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                className="absolute right-3 top-3 z-[500] grid h-10 w-10 place-items-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-black/5 hover:bg-slate-50"
            >
                {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
            {!disabled && (
                <p className="pointer-events-none absolute bottom-3 left-3 z-[500] flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow">
                    <MapPin className="h-3.5 w-3.5 text-red-500" />
                    {value ? 'Arraste o alfinete para ajustar' : 'Clique no mapa para marcar o local'}
                </p>
            )}
        </div>
    );

    return (
        <>
            <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    value={address}
                    disabled={disabled}
                    onChange={(e) => { typedRef.current = true; onAddressChange(e.target.value); }}
                    onFocus={() => results.length && setOpen(true)}
                    onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); pick(results[0]); } }}
                    placeholder="Buscar endereço, rua, rodovia ou referência"
                    className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[var(--sgf-primary)] focus:ring-4 focus:ring-[var(--sgf-focus-ring)]"
                />
                {searching && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
                {open && address.trim().length >= 3 && results.length > 0 && (
                    <div className="absolute inset-x-0 top-full z-[600] mt-1.5 overflow-hidden rounded-2xl border border-slate-100 bg-white p-1.5 shadow-lg">
                        {results.map((r, i) => (
                            <button
                                key={`${r.lat},${r.lng},${i}`}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pick(r)}
                                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-[var(--sgf-primary-soft)]"
                            >
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                                <span className="min-w-0">
                                    <span className="line-clamp-2">{r.label}</span>
                                    {r.approximate && <span className="text-[11px] font-semibold text-amber-600">Endereço exato não encontrado · ponto mais próximo</span>}
                                </span>
                            </button>
                        ))}
                        <p className="px-3 pb-1 pt-1.5 text-[10px] text-slate-400">Busca: {GEOCODER_PROVIDER === 'google' ? 'Google' : 'OpenStreetMap'}</p>
                    </div>
                )}
                {open && !searching && results.length === 0 && address.trim().length >= 3 && (
                    <p className="absolute inset-x-0 top-full z-[600] mt-1.5 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs text-slate-500 shadow">Nada encontrado. Marque o ponto clicando no mapa.</p>
                )}
            </div>
            <div className="h-56 w-full overflow-hidden rounded-xl border border-slate-200">
                {fullscreen ? <div className="grid h-full place-items-center bg-slate-50 text-xs text-slate-400">Mapa em tela cheia</div> : map}
            </div>
            {fullscreen && createPortal(<div className="fixed inset-0 z-[4000] bg-white">{map}</div>, document.body)}
        </>
    );
}

export default LocationPicker;
