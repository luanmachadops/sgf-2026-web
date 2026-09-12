export const QUOTE_UNITS = { UN: 'Unidade', H: 'Hora', L: 'Litro', KG: 'Quilograma', KM: 'Quilômetro', SERV: 'Serviço' } as const;
export const QUOTE_CATEGORIES = { parts: 'Peças', tires: 'Pneus', lubricant: 'Lubrificantes', arla: 'ARLA', labor: 'Mão de obra', tire_service: 'Borracharia', other: 'Outros' } as const;
export type QuoteUnit = keyof typeof QUOTE_UNITS;
export type QuoteCategory = keyof typeof QUOTE_CATEGORIES;
export function quoteCategories(kind: 'peca' | 'mao_de_obra'): QuoteCategory[] {
  return kind === 'peca' ? ['parts', 'tires', 'lubricant', 'arla', 'other'] : ['labor', 'tire_service', 'other'];
}
export function quoteClassificationLabel(unit?: string | null, category?: string | null): string {
  if (!unit || !category || !(unit in QUOTE_UNITS) || !(category in QUOTE_CATEGORIES)) return 'Unidade/categoria não informadas';
  return `${QUOTE_CATEGORIES[category as QuoteCategory]} · ${QUOTE_UNITS[unit as QuoteUnit]}`;
}
