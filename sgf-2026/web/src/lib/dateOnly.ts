/** Helpers para datas "YYYY-MM-DD" (sem fuso), evitando o deslocamento de 1 dia do new Date(string). */

export function formatDay(value: string | null | undefined): string {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : '—';
}

export function todayIso(): string {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Dias entre hoje e a data (negativo = já passou). */
export function daysUntil(value: string): number {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    const target = Date.UTC(y, m - 1, d);
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86_400_000);
}
