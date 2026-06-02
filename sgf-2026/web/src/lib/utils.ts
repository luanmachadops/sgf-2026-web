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
export function formatDate(date: Date | string, formatStr: string = 'dd/MM/yyyy'): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateFnsFormat(dateObj, formatStr, { locale: ptBR });
}

/**
 * Format date time to Brazilian format
 */
export function formatDateTime(date: Date | string): string {
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
 * Format phone number — tolerante a null/undefined.
 */
export function formatPhone(phone: string | null | undefined): string {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
        return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    if (cleaned.length === 10) {
        return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
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

/**
 * Get status badge color
 */
export function getStatusColor(status: string): string {
    const statusMap: Record<string, string> = {
        // Vehicle status
        AVAILABLE: 'bg-green-100 text-green-800',
        IN_USE: 'bg-blue-100 text-blue-800',
        MAINTENANCE: 'bg-yellow-100 text-yellow-800',
        INACTIVE: 'bg-gray-100 text-gray-800',

        // Trip status
        IN_PROGRESS: 'bg-blue-100 text-blue-800',
        COMPLETED: 'bg-green-100 text-green-800',
        CANCELLED: 'bg-red-100 text-red-800',

        // Maintenance status
        PENDING: 'bg-yellow-100 text-yellow-800',
        APPROVED: 'bg-green-100 text-green-800',
        REJECTED: 'bg-red-100 text-red-800',
        IN_PROGRESS_MAINT: 'bg-blue-100 text-blue-800',
        AWAITING_PARTS: 'bg-orange-100 text-orange-800',
        COMPLETED_MAINT: 'bg-green-100 text-green-800',

        // Driver status
        ACTIVE: 'bg-green-100 text-green-800',
        SUSPENDED: 'bg-red-100 text-red-800',
    };

    return statusMap[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Get status label in Portuguese
 */
export function getStatusLabel(status: string): string {
    const statusMap: Record<string, string> = {
        // Vehicle
        AVAILABLE: 'Disponível',
        IN_USE: 'Em Uso',
        MAINTENANCE: 'Manutenção',
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
