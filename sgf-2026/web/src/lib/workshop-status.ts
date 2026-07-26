import type {
    WorkshopFinancialStatus,
    WorkshopOperationalStatus,
} from '@/lib/workshop-portal-api';

export const OPERATIONAL_LABELS: Record<WorkshopOperationalStatus, string> = {
    pending: 'Pendente',
    authorized: 'Autorizada',
    at_shop: 'Veículo na oficina',
    awaiting_quote_approval: 'Aguardando prefeitura',
    in_progress: 'Em execução',
    ready: 'Pronto para retirada',
    received: 'Veículo recebido',
    cancelled: 'Cancelada',
};

export const FINANCIAL_LABELS: Record<WorkshopFinancialStatus, string> = {
    not_started: 'Não iniciado',
    awaiting_commitment: 'Aguardando empenho',
    committed: 'Empenhado',
    invoiced: 'Faturado',
    attested: 'Atestado',
    paid: 'Pago',
};

export function operationalGroup(status: WorkshopOperationalStatus): 'attention' | 'execution' | 'done' {
    if (['received', 'cancelled'].includes(status)) return 'done';
    if (['in_progress', 'ready'].includes(status)) return 'execution';
    return 'attention';
}

export function nextAction(status: WorkshopOperationalStatus, financialStatus: WorkshopFinancialStatus): string {
    if (status === 'authorized') return 'Aguardando chegada do veículo';
    if (status === 'at_shop') return 'Enviar orçamento';
    if (status === 'awaiting_quote_approval' && financialStatus === 'committed') return 'Iniciar serviço';
    if (status === 'awaiting_quote_approval') return 'Aguardando aprovação/empenho';
    if (status === 'in_progress') return 'Concluir serviço';
    if (status === 'ready') return 'Aguardando retirada';
    if (status === 'received' && financialStatus === 'committed') return 'Enviar nota fiscal';
    if (status === 'received' && financialStatus === 'invoiced') return 'Aguardando ateste';
    if (status === 'received' && financialStatus === 'attested') return 'Aguardando pagamento';
    if (status === 'received' && financialStatus === 'paid') return 'Processo encerrado';
    return 'Acompanhar processo';
}
