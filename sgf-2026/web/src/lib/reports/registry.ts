// Catálogo único dos relatórios: o que aparece na página, como abre e quais
// padrões de impressão cada um usa. `fetchReportDataset` (reportData.ts)
// resolve o id para a consulta.

export type ReportSubject =
    | 'veiculos'
    | 'manutencao'
    | 'abastecimento'
    | 'fiscal';

export type ReportIconKey =
    | 'car'
    | 'route'
    | 'cost'
    | 'pie'
    | 'fuel'
    | 'alert'
    | 'wrench'
    | 'check'
    | 'users'
    | 'receipt'
    | 'calendar'
    | 'shield';

export interface ReportDefinition {
    id: string;
    title: string;
    description: string;
    /** A pergunta que o relatório responde (mostrada no catálogo). */
    question: string;
    subject: ReportSubject;
    icon: ReportIconKey;
    /** Coluna oferecida como filtro rápido no visualizador. */
    contextKey?: string;
    /** Agrupamento padrão (com subtotais). */
    groupBy?: string;
    /** Bloco de assinaturas ligado por padrão (documentos de prestação de contas). */
    signatures?: boolean;
    /** O filtro de período não se aplica (fotografia na data de emissão). */
    snapshot?: boolean;
    /** Aceita o filtro por condutor (relatórios de viagens, abastecimentos e multas). */
    driverFilter?: boolean;
    /** Aceita o filtro por veículo. */
    vehicleFilter?: boolean;
}

export const REPORT_SUBJECTS: { id: ReportSubject; label: string }[] = [
    { id: 'veiculos', label: 'Veículos' },
    { id: 'manutencao', label: 'Manutenções' },
    { id: 'abastecimento', label: 'Abastecimento' },
    { id: 'fiscal', label: 'Fiscal' },
];

export const REPORTS: ReportDefinition[] = [
    {
        id: 'fleet-summary',
        title: 'Cadastro da Frota',
        description: 'Veículos com placa, modelo, ano, secretaria, odômetro, seguro e situação atual.',
        question: 'Quais veículos a prefeitura tem, onde estão e em que situação?',
        subject: 'veiculos',
        icon: 'car',
        contextKey: 'status',
        snapshot: true,
    },
    {
        id: 'traffic-log',
        title: 'Boletim de Tráfego',
        description: 'Controle de uso: saída, chegada, km inicial e final, motorista, destino e finalidade de cada viagem.',
        question: 'Quem usou cada veículo, quando, para onde e para quê?',
        subject: 'veiculos',
        icon: 'route',
        contextKey: 'plate',
        groupBy: 'plate',
        signatures: true,
        driverFilter: true,
        vehicleFilter: true,
    },
    {
        id: 'vehicle-cost',
        title: 'Custo por Veículo',
        description: 'Combustível, manutenção e multas por veículo, com km rodados, custo por km e veículos ociosos.',
        question: 'Quanto cada veículo custa por km e quais ficaram parados?',
        subject: 'veiculos',
        icon: 'cost',
        contextKey: 'usage',
    },
    {
        id: 'department-consolidated',
        title: 'Consolidado por Secretaria',
        description: 'Veículos, viagens, km, combustível, manutenção, multas e custo por km de cada secretaria.',
        question: 'Quanto cada secretaria usa e gasta com a frota?',
        subject: 'veiculos',
        icon: 'pie',
        contextKey: 'department',
        signatures: true,
    },
    {
        id: 'fuel-consumption',
        title: 'Consumo de Combustível',
        description: 'Abastecimentos efetivos com litros, valores, consumo médio e posto.',
        question: 'Quanto combustível foi consumido, por quem e a que custo?',
        subject: 'abastecimento',
        icon: 'fuel',
        contextKey: 'station',
        driverFilter: true,
        vehicleFilter: true,
    },
    {
        id: 'fuel-anomalies',
        title: 'Abastecimentos com Anomalia',
        description: 'Registros sinalizados, litros acima do tanque e consumo fora do habitual do veículo.',
        question: 'Onde pode haver erro ou desvio de combustível?',
        subject: 'abastecimento',
        icon: 'alert',
        contextKey: 'reasons',
    },
    {
        id: 'maintenance-history',
        title: 'Histórico de Manutenções',
        description: 'Ordens de serviço com oficina, dias parado, orçamento, custo e situação.',
        question: 'O que foi consertado, quanto custou e quanto tempo o veículo ficou parado?',
        subject: 'manutencao',
        icon: 'wrench',
        contextKey: 'operationalStatus',
    },
    {
        id: 'checklist-failures',
        title: 'Checklists Reprovados',
        description: 'Itens em atenção no checklist pré-viagem, reincidência por veículo e ordem de serviço gerada.',
        question: 'Quais veículos estão saindo com problema recorrente?',
        subject: 'manutencao',
        icon: 'check',
        contextKey: 'item',
    },
    {
        id: 'drivers-activity',
        title: 'Motoristas: Atividade e Habilitação',
        description: 'Viagens, km, infrações e pontos por motorista, com categoria e validade da CNH.',
        question: 'Quem está dirigindo, quanto, e com CNH em dia?',
        subject: 'veiculos',
        icon: 'users',
        contextKey: 'cnhStatus',
        driverFilter: true,
    },
    {
        id: 'infractions',
        title: 'Infrações de Trânsito',
        description: 'Multas com AIT, condutor indicado, valores, prazo de indicação e situação.',
        question: 'Quais multas a frota recebeu e quais prazos estão correndo?',
        subject: 'veiculos',
        icon: 'receipt',
        contextKey: 'status',
        driverFilter: true,
    },
    {
        id: 'expirations',
        title: 'Vencimentos',
        description: 'CNH, seguro, documentos de veículos e contratos vencidos ou vencendo em 90 dias.',
        question: 'O que vence nos próximos 30, 60 ou 90 dias?',
        subject: 'veiculos',
        icon: 'calendar',
        contextKey: 'kind',
        snapshot: true,
    },
    {
        id: 'fuel-by-station',
        title: 'Fechamento por Posto',
        description: 'Volumes, valores validados, pendências e rejeições agrupados por fornecedor.',
        question: 'Quanto cada posto forneceu e quanto resta do contrato?',
        subject: 'abastecimento',
        icon: 'fuel',
        contextKey: 'station',
        driverFilter: true,
    },
    {
        id: 'station-fiscal-closing',
        title: 'Fechamento Fiscal dos Postos',
        description: 'Protocolos mensais, empenho, nota fiscal, ateste, pagamento e integridade.',
        question: 'Em que etapa fiscal está cada fechamento mensal?',
        subject: 'fiscal',
        icon: 'receipt',
        contextKey: 'station',
        signatures: true,
    },
    {
        id: 'maintenance-by-shop',
        title: 'Manutenções por Oficina',
        description: 'Ordens, orçamento aprovado, custo final e processos em aberto por oficina.',
        question: 'Quanto cada oficina executou e quanto resta do contrato?',
        subject: 'manutencao',
        icon: 'wrench',
        contextKey: 'shop',
    },
    {
        id: 'procurement-fiscal-reconciliation',
        title: 'Conciliação Fiscal das Licitações',
        description: 'Teto, reserva, realização, faturamento, ateste e pagamento por secretaria e instrumento.',
        question: 'Quanto de cada dotação já foi consumido, faturado e pago?',
        subject: 'fiscal',
        icon: 'receipt',
        contextKey: 'department',
        signatures: true,
    },
    {
        id: 'procurement-legacy-reconciliation',
        title: 'Fila de Conciliação do Legado',
        description: 'Lançamentos antigos sem vínculo comprovado com ata, contrato ou dotação central.',
        question: 'Que gastos antigos ainda precisam ser vinculados a uma licitação?',
        subject: 'fiscal',
        icon: 'shield',
        contextKey: 'department',
    },
];

export function findReport(id: string): ReportDefinition | undefined {
    return REPORTS.find((report) => report.id === id);
}
