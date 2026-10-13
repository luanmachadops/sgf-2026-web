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

// Situação do orçamento. Empenho, nota e pagamento são tratados com a
// contabilidade da prefeitura; os rótulos fiscais ficam para OS antigas.
export const FINANCIAL_LABELS: Record<WorkshopFinancialStatus, string> = {
    not_started: 'Aguardando orçamento',
    awaiting_commitment: 'Orçamento aprovado',
    committed: 'Orçamento aprovado',
    invoiced: 'Nota registrada',
    attested: 'Nota atestada',
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
    if (status === 'awaiting_quote_approval') return 'Aguardando aprovação do orçamento';
    if (status === 'in_progress') return 'Concluir serviço';
    if (status === 'ready') return 'Aguardando retirada';
    if (status === 'received') return 'Serviço recebido pela prefeitura';
    return 'Acompanhar processo';
}
