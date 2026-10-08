/** "45 min", "2h 05min", "3h". */
export function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
}
