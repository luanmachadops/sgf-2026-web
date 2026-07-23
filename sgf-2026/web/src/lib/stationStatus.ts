import { differenceInDays, parseISO } from 'date-fns';
import type { Tables } from '@/types/database.types';

type Station = Pick<Tables<'fuel_stations'>, 'is_active' | 'contract_end'>;

export function isStationContractExpired(station: Station): boolean {
  if (!station.contract_end) return false;
  return differenceInDays(parseISO(station.contract_end), new Date()) < 0;
}

/**
 * Retorna o motivo pelo qual o posto não pode ser usado para autorizar/lançar
 * abastecimento (inativo ou licitação vencida), ou null se estiver disponível.
 */
export function getStationUnavailableReason(station: Station): string | null {
  if (!station.is_active) return 'posto inativo';
  if (isStationContractExpired(station)) return 'licitação vencida';
  return null;
}
