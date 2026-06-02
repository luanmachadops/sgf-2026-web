/**
 * SGF 2026 - Design System Utilities
 * Funções auxiliares e constantes para uso com o design system
 */

// ========================================
// CORES
// ========================================

export const SGF_COLORS = {
  // Cores Principais
  dark: 'hsl(188, 49%, 12%)',        // #0F2B2F
  primary: 'hsl(160, 100%, 33%)',    // #00A86B
  light: 'hsl(161, 33%, 60%)',       // #70C4A8
  
  // Superfícies
  surface: '#F8FAFC',
  surfaceElevated: '#FFFFFF',
  
  // Texto
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  
  // Status de Veículos
  statusMoving: '#22C55E',
  statusIdle: '#3B82F6',
  statusStopped: '#9CA3AF',
  statusAlert: '#EF4444',
  statusWarning: '#F59E0B',
  
  // Semânticas
  success: '#22C55E',
  error: '#DC2626',
  warning: '#F59E0B',
  info: '#3B82F6',
} as const;

// ========================================
// STATUS DE VEÍCULOS
// ========================================

export type VehicleStatus = 'moving' | 'idle' | 'stopped' | 'alert';

export interface VehicleStatusConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}

export const VEHICLE_STATUS: Record<VehicleStatus, VehicleStatusConfig> = {
  moving: {
    label: 'Em Movimento',
    color: SGF_COLORS.statusMoving,
    bgColor: 'bg-emerald-100',
    icon: '🚗',
  },
  idle: {
    label: 'Parado/Ligado',
    color: SGF_COLORS.statusIdle,
    bgColor: 'bg-blue-100',
    icon: '⏸️',
  },
  stopped: {
    label: 'Desligado',
    color: SGF_COLORS.statusStopped,
    bgColor: 'bg-slate-100',
    icon: '🅿️',
  },
  alert: {
    label: 'Alerta',
    color: SGF_COLORS.statusAlert,
    bgColor: 'bg-red-100',
    icon: '⚠️',
  },
};

// ========================================
// FORMATAÇÃO
// ========================================

/**
 * Formata placa de veículo para padrão brasileiro
 * @param plate - Placa sem formatação
 * @returns Placa formatada (ABC-1234 ou ABC1D23)
 */
export function formatPlate(plate: string): string {
  const clean = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  
  if (clean.length === 7) {
    // Formato antigo: ABC-1234
    if (/^[A-Z]{3}[0-9]{4}$/.test(clean)) {
      return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    }
    // Formato Mercosul: ABC1D23
    if (/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(clean)) {
      return clean;
    }
  }
  
  return clean;
}

/**
 * Formata CPF
 * @param cpf - CPF sem formatação
 * @returns CPF formatado (000.000.000-00)
 */
export function formatCPF(cpf: string): string {
  const clean = cpf.replace(/\D/g, '');
  
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  
  return cpf;
}

/**
 * Formata número com separadores de milhar
 * @param value - Número a ser formatado
 * @returns Número formatado
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

/**
 * Formata valor monetário
 * @param value - Valor em centavos ou reais
 * @param showSymbol - Mostrar símbolo R$
 * @returns Valor formatado
 */
export function formatCurrency(value: number, showSymbol: boolean = true): string {
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
  
  return showSymbol ? formatted : formatted.replace('R$', '').trim();
}

/**
 * Formata consumo de combustível
 * @param km - Quilometragem percorrida
 * @param liters - Litros consumidos
 * @returns Consumo formatado (km/l)
 */
export function formatFuelConsumption(km: number, liters: number): string {
  if (liters === 0) return '0,00 km/l';
  const consumption = km / liters;
  return `${consumption.toFixed(2).replace('.', ',')} km/l`;
}

// ========================================
// VALIDAÇÃO
// ========================================

/**
 * Valida placa de veículo
 * @param plate - Placa a ser validada
 * @returns true se válida
 */
export function isValidPlate(plate: string): boolean {
  const clean = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  
  // Formato antigo: ABC1234
  const oldFormat = /^[A-Z]{3}[0-9]{4}$/;
  
  // Formato Mercosul: ABC1D23
  const mercosulFormat = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
  
  return oldFormat.test(clean) || mercosulFormat.test(clean);
}

/**
 * Valida CPF
 * @param cpf - CPF a ser validado
 * @returns true se válido
 */
export function isValidCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false; // Todos os dígitos iguais
  
  // Validação dos dígitos verificadores
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(clean.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(clean.charAt(10))) return false;
  
  return true;
}

/**
 * Valida CNH
 * @param cnh - CNH a ser validada
 * @returns true se válida
 */
export function isValidCNH(cnh: string): boolean {
  const clean = cnh.replace(/\D/g, '');
  
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;
  
  return true; // Simplificado - implementar algoritmo completo se necessário
}

// ========================================
// DATA E HORA
// ========================================

/**
 * Formata data para padrão brasileiro
 * @param date - Data a ser formatada
 * @returns Data formatada (DD/MM/YYYY)
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

/**
 * Formata data e hora
 * @param date - Data a ser formatada
 * @returns Data e hora formatadas (DD/MM/YYYY HH:mm)
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Calcula tempo decorrido desde uma data
 * @param date - Data inicial
 * @returns Tempo decorrido (ex: "2 horas atrás")
 */
export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return 'agora';
  if (diffMin < 60) return `${diffMin} min atrás`;
  if (diffHour < 24) return `${diffHour}h atrás`;
  if (diffDay < 7) return `${diffDay}d atrás`;
  
  return formatDate(d);
}

// ========================================
// CÁLCULOS
// ========================================

/**
 * Calcula autonomia do veículo
 * @param fuelLiters - Litros no tanque
 * @param consumption - Consumo médio (km/l)
 * @returns Autonomia em km
 */
export function calculateAutonomy(fuelLiters: number, consumption: number): number {
  return fuelLiters * consumption;
}

/**
 * Calcula custo por km
 * @param totalCost - Custo total
 * @param kmTraveled - Km percorridos
 * @returns Custo por km
 */
export function calculateCostPerKm(totalCost: number, kmTraveled: number): number {
  if (kmTraveled === 0) return 0;
  return totalCost / kmTraveled;
}

/**
 * Calcula percentual de variação
 * @param current - Valor atual
 * @param previous - Valor anterior
 * @returns Percentual de variação
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

// ========================================
// EXPORTAÇÃO DE DADOS
// ========================================

/**
 * Converte array de objetos para CSV
 * @param data - Array de objetos
 * @param filename - Nome do arquivo
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string
): void {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escapar valores com vírgula ou aspas
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    ),
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

// ========================================
// HELPERS
// ========================================

/**
 * Trunca texto longo
 * @param text - Texto a ser truncado
 * @param maxLength - Comprimento máximo
 * @returns Texto truncado com reticências
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Gera ID único
 * @returns ID único
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Debounce function
 * @param func - Função a ser debounced
 * @param wait - Tempo de espera em ms
 * @returns Função debounced
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Classnames helper
 * @param classes - Classes CSS
 * @returns String de classes combinadas
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
