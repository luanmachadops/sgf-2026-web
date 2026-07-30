import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format as dateFnsFormat, formatDistanceToNow as dateFnsFormatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Merge Tailwind classes with clsx
 */
export function cn(...inputs: Parameters<typeof clsx>) {
    return twMerge(clsx(inputs));
}

/**
 * Format currency to Brazilian Real
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

/**
 * Format distance in kilometers
 */
export function formatDistance(km: number): string {
    if (km < 1) {
        return `${Math.round(km * 1000)}m`;
    }
    return `${km.toFixed(1)} km`;
}

/**
 * Format date to Brazilian format
 */
export function formatDate(date: Date | string | null | undefined, formatStr: string = 'dd/MM/yyyy'): string {
    if (!date) return '—';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(dateObj.getTime())) return '—';
    return dateFnsFormat(dateObj, formatStr, { locale: ptBR });
}

/**
 * Format date time to Brazilian format
 */
export function formatDateTime(date: Date | string | null | undefined): string {
    return formatDate(date, 'dd/MM/yyyy HH:mm');
}

/**
 * Format distance to now (e.g., "há 2 horas")
 */
export function formatDistanceToNow(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateFnsFormatDistanceToNow(dateObj, {
        addSuffix: true,
        locale: ptBR
    });
}

/**
 * Format CPF — tolerante a null/undefined (motoristas podem não ter CPF cadastrado ainda).
 */
export function formatCPF(cpf: string | null | undefined): string {
    if (!cpf) return '';
    const cleaned = cpf.replace(/\D/g, '');
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Format license plate — tolerante a null/undefined.
 */
export function formatPlate(plate: string | null | undefined): string {
    if (!plate) return '';
    const cleaned = plate.replace(/[^A-Z0-9]/g, '');
    if (cleaned.length === 7) {
        // Mercosul: ABC1D23
        if (/[A-Z]{3}\d[A-Z]\d{2}/.test(cleaned)) {
            return cleaned.replace(/([A-Z]{3})(\d)([A-Z])(\d{2})/, '$1-$2$3$4');
        }
        // Old format: ABC-1234
        return cleaned.replace(/([A-Z]{3})(\d{4})/, '$1-$2');
    }
    return plate;
}

/**
 * Normaliza textos de pesquisa sem perder a leitura humana.
 *
 * Para placas, códigos, CPF e outros identificadores, pontuação é apenas
 * apresentação. Assim, `ABC-1234`, `ABC1234` e `abc 1234` encontram o mesmo
 * registro, enquanto nomes continuam tolerando acentos e caixa.
 */
export function normalizeSearchText(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

export function normalizeSearchIdentifier(value: string | null | undefined): string {
    return normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
}

export function matchesSearch(
    query: string | null | undefined,
    ...values: Array<string | number | null | undefined>
): boolean {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return true;

    const compactQuery = normalizeSearchIdentifier(normalizedQuery);
    return values.some((value) => {
        const normalizedValue = normalizeSearchText(String(value ?? ''));
        if (normalizedValue.includes(normalizedQuery)) return true;
        return compactQuery.length > 0
            && normalizeSearchIdentifier(normalizedValue).includes(compactQuery);
    });
}

/**
 * Hodômetro é persistido como inteiro. Aceita dígitos puros e a apresentação
 * brasileira com ponto de milhar, rejeitando decimais ambíguos como `2.1`.
 */
export function parseWholeKilometers(value: string | null | undefined): number | null {
    const normalized = (value ?? '').trim();
    if (/^\d+$/.test(normalized)) return Number(normalized);
    if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
        return Number(normalized.replace(/\./g, ''));
    }
    return null;
}

/**
 * Format phone number — tolerante a null/undefined.
 */
export function formatPhone(phone: string | null | undefined): string {
    if (!phone) return '—';
    const d = phone.replace(/\D/g, '');
    if (d.length === 11) {
        return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    if (d.length === 10) {
        return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
}

export function formatCNH(cnh: string | null | undefined): string {
    if (!cnh) return '—';
    const d = cnh.replace(/\D/g, '');
    if (d.length === 11) {
        return d.replace(/(\d{9})(\d{2})/, '$1-$2');
    }
    return cnh;
}

/**
 * Máscaras progressivas (aplicadas enquanto o usuário digita).
 */
export function maskCPF(value: string): string {
    return value
        .replace(/\D/g, '')
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function maskCNPJ(value: string): string {
    return value
        .replace(/\D/g, '')
        .slice(0, 14)
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function maskPhone(value: string): string {
    const d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 10) {
        return d
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
    }
    return d
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function getStatusColor(status: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
    const statusMap: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
        // Vehicle status
        AVAILABLE: 'success',
        IN_USE: 'info',
        MAINTENANCE: 'warning',
        INACTIVE: 'default',

        // Trip status
        IN_PROGRESS: 'info',
        COMPLETED: 'success',
        CANCELLED: 'error',

        // Maintenance status
        PENDING: 'warning',
        APPROVED: 'success',
        REJECTED: 'error',
        IN_PROGRESS_MAINT: 'info',
        AWAITING_PARTS: 'warning',
        COMPLETED_MAINT: 'success',

        // Driver status
        ACTIVE: 'success',
        SUSPENDED: 'error',
    };

    return statusMap[status] || 'default';
}

/**
 * Get status label in Portuguese
 */
export function getStatusLabel(status: string): string {
    const statusMap: Record<string, string> = {
        // Vehicle
        AVAILABLE: 'Disponível',
        IN_USE: 'Em Uso',
        MAINTENANCE: 'Em manutenção',
        INACTIVE: 'Inativo',

        // Trip
        IN_PROGRESS: 'Em Andamento',
        COMPLETED: 'Concluída',
        CANCELLED: 'Cancelada',

        // Maintenance
        PENDING: 'Pendente',
        APPROVED: 'Aprovada',
        REJECTED: 'Rejeitada',
        IN_PROGRESS_MAINT: 'Em Andamento',
        AWAITING_PARTS: 'Aguardando Peças',
        COMPLETED_MAINT: 'Concluída',

        // Driver
        ACTIVE: 'Ativo',
        SUSPENDED: 'Suspenso',
    };

    return statusMap[status] || status;
}

/**
 * Calculate fuel consumption (km/L)
 */
export function calculateConsumption(km: number, liters: number): number {
    if (liters === 0) return 0;
    return km / liters;
}

/**
 * Truncate text
 */
export function truncate(text: string, length: number): string {
    if (text.length <= length) return text;
    return text.slice(0, length) + '...';
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formata o rótulo do motorista para listbox/selects com abreviação/resumo da secretaria.
 * Exemplo: "João da Silva (Obras)" ou "Maria Oliveira (Saúde)".
 */
export function formatDriverLabel(driver?: { name?: string | null; full_name?: string | null; departments?: { name?: string | null } | null } | null): string {
    if (!driver) return 'Motorista';
    const name = driver.full_name || driver.name || 'Motorista';
    const deptName = driver.departments?.name;
    if (!deptName) return name;

    const shortDept = deptName
        .replace(/^Secretaria\s+(?:Municipal\s+)?(?:de\s+|da\s+|do\s+)?/i, '')
        .replace(/^Sec\.\s+/i, '');

    return `${name} (${shortDept})`;
}

/**
 * Retorna os estilos visuais de fundo, borda, texto e ícone de acordo com o nível de prioridade:
 * - baixa: Emerald / Verde
 * - media / média: Amber / Amarelo
 * - alta: Orange / Laranja
 * - urgente / critica / emergência: Red / Vermelho
 */
export function getPriorityStyles(priority?: string | null) {
    const p = (priority ?? '').toLowerCase();
    if (p === 'baixa' || p === 'low' || p === '1') {
        return {
            bg: 'bg-emerald-50/90',
            border: 'border-emerald-200',
            text: 'text-emerald-700',
            iconBg: 'bg-emerald-100 text-emerald-700',
            badgeVariant: 'success' as const,
        };
    }
    if (p === 'media' || p === 'média' || p === 'medium' || p === '2' || p === '3') {
        return {
            bg: 'bg-amber-50/90',
            border: 'border-amber-200',
            text: 'text-amber-800',
            iconBg: 'bg-amber-100 text-amber-700',
            badgeVariant: 'warning' as const,
        };
    }
    if (p === 'alta' || p === 'high' || p === '4') {
        return {
            bg: 'bg-orange-50/90',
            border: 'border-orange-200',
            text: 'text-orange-800',
            iconBg: 'bg-orange-100 text-orange-700',
            badgeVariant: 'warning' as const,
        };
    }
    if (p === 'urgente' || p === 'critica' || p === 'crítica' || p === 'emergencia' || p === 'emergência' || p === 'critical' || p === '5') {
        return {
            bg: 'bg-red-50/90',
            border: 'border-red-200',
            text: 'text-red-800',
            iconBg: 'bg-red-100 text-red-700',
            badgeVariant: 'error' as const,
        };
    }
    return {
        bg: 'bg-slate-50',
        border: 'border-slate-200',
        text: 'text-slate-800',
        iconBg: 'bg-slate-100 text-slate-600',
        badgeVariant: 'default' as const,
    };
}
