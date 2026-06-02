/**
 * SGF 2026 — Utilities para formatação
 */

/**
 * Máscara de CPF: 000.000.000-00
 */
export function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Remove máscara do CPF
 */
export function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/**
 * Valida CPF (algoritmo completo)
 */
export function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits.charAt(10))) return false;

  return true;
}

/**
 * Formata número com separador de milhar
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

/**
 * Formata odômetro: 12.345 km
 */
export function formatOdometer(km: number): string {
  return `${formatNumber(km)} km`;
}
