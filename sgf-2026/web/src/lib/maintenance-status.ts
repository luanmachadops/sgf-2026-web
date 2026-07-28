import type { FinStatus, OpStatus } from '@/lib/supabase-api';

const BASE_OPERATIONAL_LABELS: Record<OpStatus, string> = {
    pending: 'Em triagem',
    authorized: 'Autorizada',
    at_shop: 'Na oficina',
    awaiting_quote_approval: 'Orçamento em análise',
    in_progress: 'Em execução',
    ready: 'Pronta para retirada',
    received: 'Veículo recebido',
    cancelled: 'Cancelada',
};

export function maintenanceOperationalLabel(op: OpStatus, fin: FinStatus): string {
    if (op !== 'awaiting_quote_approval') return BASE_OPERATIONAL_LABELS[op];
    if (fin === 'awaiting_commitment') return 'Orçamento aprovado · aguardando empenho';
    if (fin === 'committed') return 'Execução liberada · aguardando oficina';
    return BASE_OPERATIONAL_LABELS[op];
}

export function maintenanceManagerNextAction(op: OpStatus, fin: FinStatus): string {
    if (op === 'pending') return 'Revisar e autorizar';
    if (op === 'authorized') return 'Confirmar entrega na oficina';
    if (op === 'at_shop') return 'Aguardar orçamento da oficina';
    if (op === 'awaiting_quote_approval' && fin === 'not_started') return 'Analisar orçamento';
    if (op === 'awaiting_quote_approval' && fin === 'awaiting_commitment') return 'Registrar empenho';
    if (op === 'awaiting_quote_approval' && fin === 'committed') return 'Aguardar início pela oficina';
    if (op === 'in_progress') return 'Acompanhar execução';
    if (op === 'ready') return 'Conferir e receber veículo';
    if (op === 'cancelled') return 'Processo cancelado';
    if (fin === 'invoiced') return 'Atestar notas fiscais';
    if (fin === 'attested') return 'Registrar pagamento';
    if (fin === 'paid') return 'Processo encerrado';
    return 'Aguardar nota fiscal';
}
