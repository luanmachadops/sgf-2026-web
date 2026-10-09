/**
 * Busca de endereço com o provedor disponível:
 *  - Google (Geocoding API) quando houver VITE_GOOGLE_MAPS_API_KEY;
 *  - OpenStreetMap (Nominatim) caso contrário, sem chave.
 *
 * Se o endereço exato não existir, a busca vai simplificando o texto (tira
 * número, complemento, depois fica só rua + cidade) até achar o ponto mais
 * próximo — melhor um ponto aproximado do que nenhum.
 */
export type GeoResult = { label: string; lat: number; lng: number; approximate?: boolean };

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
export const GEOCODER_PROVIDER: 'google' | 'osm' = GOOGLE_KEY ? 'google' : 'osm';

async function googleSearch(q: string, signal?: AbortSignal): Promise<GeoResult[]> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?region=br&language=pt-BR&address=${encodeURIComponent(q)}&key=${GOOGLE_KEY}`;
    const json = await fetch(url, { signal }).then((r) => r.json()) as { results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[] };
    return (json.results ?? []).slice(0, 5).map((r) => ({ label: r.formatted_address, lat: r.geometry.location.lat, lng: r.geometry.location.lng }));
}

async function osmSearch(q: string, signal?: AbortSignal): Promise<GeoResult[]> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
    const rows = await fetch(url, { signal }).then((r) => (r.ok ? r.json() : [])) as { display_name: string; lat: string; lon: string }[];
    return rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

const search = (q: string, signal?: AbortSignal) => (GEOCODER_PROVIDER === 'google' ? googleSearch(q, signal) : osmSearch(q, signal));

const UF: Record<string, string> = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
    ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
    PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
    RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
/** "Tapejara, PR" → "Tapejara, Paraná" (o OpenStreetMap não entende a sigla). */
function expandUf(text: string): string {
    return text.replace(/\b([A-Z]{2})\b/g, (m) => UF[m] ?? m);
}

const NUM_WORDS = ['', 'Primeiro', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez', 'Onze', 'Doze', 'Treze', 'Quatorze', 'Quinze',
    'Dezesseis', 'Dezessete', 'Dezoito', 'Dezenove', 'Vinte', 'Vinte e Um', 'Vinte e Dois', 'Vinte e Três', 'Vinte e Quatro', 'Vinte e Cinco',
    'Vinte e Seis', 'Vinte e Sete', 'Vinte e Oito', 'Vinte e Nove', 'Trinta', 'Trinta e Um'];
/** Datas em nome de rua: "7 de Setembro" → "Sete de Setembro" (como o mapa cadastra). */
function numberedDatesToWords(text: string): string {
    return text.replace(/\b(\d{1,2})\s+de\s+/gi, (m, n: string) => (NUM_WORDS[Number(n)] ? `${NUM_WORDS[Number(n)]} de ` : m));
}

/** Variações cada vez mais genéricas do texto, para achar o ponto mais próximo. */
function fallbacks(query: string, rawCity?: string): string[] {
    const city = rawCity ? expandUf(rawCity) : undefined;
    const base = expandUf(query.trim());
    const noNumber = base.replace(/,?\s*(n[º°o.]?\s*)?\d+[a-z]?\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    const firstPart = noNumber.split(/[,-]/)[0]?.trim() ?? noNumber;
    const withCity = (s: string) => (city && !s.toLowerCase().includes(city.toLowerCase()) ? `${s}, ${city}` : s);
    const worded = numberedDatesToWords(base);
    const wordedNoNumber = numberedDatesToWords(noNumber);
    return [...new Set([
        withCity(base), base, withCity(worded),
        withCity(noNumber), withCity(wordedNoNumber), withCity(firstPart), withCity(numberedDatesToWords(firstPart)),
        city ?? '',
    ].filter((s) => s.length >= 3))];
}

export async function geocodeSearch(query: string, city?: string, signal?: AbortSignal): Promise<GeoResult[]> {
    const tries = fallbacks(query, city);
    for (let i = 0; i < tries.length; i++) {
        const found = await search(tries[i], signal);
        if (found.length) return i <= 2 ? found : found.map((r) => ({ ...r, approximate: true }));
    }
    return [];
}

/** Endereço de um ponto (ao soltar o alfinete no mapa). */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
    try {
        if (GEOCODER_PROVIDER === 'google') {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?language=pt-BR&latlng=${lat},${lng}&key=${GOOGLE_KEY}`;
            const json = await fetch(url, { signal }).then((r) => r.json()) as { results?: { formatted_address: string }[] };
            return json.results?.[0]?.formatted_address ?? null;
        }
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
        const json = await fetch(url, { signal }).then((r) => r.json()) as { display_name?: string; address?: Record<string, string> };
        const a = json.address ?? {};
        const short = [[a.road, a.house_number].filter(Boolean).join(', '), a.suburb, a.city || a.town || a.village].filter(Boolean).join(' - ');
        return short || json.display_name || null;
    } catch {
        return null;
    }
}
