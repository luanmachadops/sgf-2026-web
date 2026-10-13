// Tipos compartilhados pelos relatórios (datasets, tela, PDF e Excel).
// Sem dependência de Supabase ou do navegador: o motor de PDF e os testes
// em `sgf-2026/tests` importam este arquivo direto no Node.

export type ReportValue = string | number;

export interface ReportColumn {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    format?: 'text' | 'integer' | 'decimal' | 'currency' | 'percent' | 'date';
    defaultVisible?: boolean;
    filterable?: boolean;
    /** Largura mínima (px) da coluna na tabela da tela. A impressão mede o conteúdo. */
    minWidth?: number;
    /**
     * 1 = essencial, 2 = normal (padrão), 3 = complementar. Quando a tabela não
     * cabe na folha, o medidor sugere tirar primeiro as colunas de prioridade 3.
     */
    priority?: 1 | 2 | 3;
    /**
     * Na impressão, se a tabela não couber, a coluna vira 2ª linha da coluna
     * indicada (ex.: modelo sob a placa) em vez de ocupar largura própria.
     */
    stackUnder?: string;
    /** Repete em cada bloco quando a tabela precisa ser dividida em blocos de colunas. */
    anchor?: boolean;
    /** Soma a coluna na linha de totais (só valores numéricos entram). */
    total?: 'sum';
}

export interface ReportKpi {
    label: string;
    value: string;
}

export interface ReportChart {
    title: string;
    description?: string;
    type: 'bar' | 'donut' | 'gauge';
    valueFormat?: 'integer' | 'decimal' | 'currency' | 'percent';
    data: { label: string; value: number }[];
}

export interface ReportDataset {
    columns: ReportColumn[];
    rows: Record<string, ReportValue>[];
    kpis: ReportKpi[];
    charts?: ReportChart[];
    notes?: string[];
}

export interface ReportFilters {
    periodLabel: string;
    dateFrom?: string;
    dateTo?: string;
    departmentLabel: string;
    contextLabel?: string;
    driverLabel?: string;
    vehicleLabel?: string;
    searchLabel?: string;
}

export interface ReportBranding {
    name: string;
    appName?: string;
    logoUrl?: string;
    sealUrl?: string;
    city?: string;
    state?: string;
    cnpj?: string;
    address?: string;
    postalCode?: string;
    supportPhone?: string;
    mayorName?: string;
    reportFooter?: string;
    primaryColor?: string;
    darkColor?: string;
    accentColor?: string;
}

export type ReportOrientation = 'auto' | 'portrait' | 'landscape';

export interface ReportLayoutOptions {
    orientation: ReportOrientation;
    /** Tamanho da fonte da tabela em pontos. Nunca abaixo de MIN_PRINT_FONT_PT. */
    fontSize: number;
}

export interface ReportSignature {
    name: string;
    role: string;
}

export interface ReportExportOptions {
    reportTitle: string;
    reportDescription: string;
    dataset: ReportDataset;
    filters: ReportFilters;
    branding?: ReportBranding;
    layout?: ReportLayoutOptions;
    /** Agrupa as linhas (já ordenadas) por esta coluna, com subtotais. */
    groupBy?: string;
    /** Definição da coluna de agrupamento quando ela não está entre as visíveis. */
    groupColumn?: ReportColumn;
    /** Bloco de assinaturas ao fim do documento. */
    signatures?: ReportSignature[];
    /** Quem emitiu (vai no rodapé, junto do código de integridade). */
    issuer?: string;
}
