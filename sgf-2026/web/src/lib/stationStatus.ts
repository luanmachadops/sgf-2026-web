import type { Tables } from '@/types/database.types';

type Station = Pick<Tables<'fuel_stations'>, 'is_active'>;

/**
 * Retorna o motivo pelo qual o posto não pode ser usado para autorizar/lançar
 * abastecimento, ou null se estiver disponível. O teto de gastos não é do posto:
 * é o valor empenhado por secretaria (Limites por secretaria), conferido pelo
 * banco ao autorizar.
 */
export function getStationUnavailableReason(station: Station): string | null {
  if (!station.is_active) return 'posto inativo';
  return null;
}
