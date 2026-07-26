import { AlertCircle, CalendarClock, Info } from '@/components/sgf/icons';
import type { PartnerContractStatus } from '@/lib/procurement-api';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function ContractStatusAlerts({ status }: { status?: PartnerContractStatus }) {
    if (!status) return null;
    const warnings: Array<{
        key: string;
        tone: 'error' | 'warning' | 'info';
        title: string;
        body: string;
    }> = [];

    if (status.blockCode) {
        warnings.push({
            key: status.blockCode,
            tone: status.blockCode === 'not_started' ? 'warning' : 'error',
            title: status.blockTitle || 'Operação bloqueada',
            body: status.blockMessage || 'Procure a prefeitura para regularizar o contrato.',
        });
    } else if (
        status.daysRemaining != null
        && status.daysRemaining >= 0
        && status.daysRemaining <= status.alertDays
    ) {
        warnings.push({
            key: 'contract-expiring',
            tone: 'warning',
            title: status.daysRemaining === 0 ? 'Contrato vence hoje' : `Contrato vence em ${status.daysRemaining} dias`,
            body: `A vigência termina em ${status.contractEnd ? new Date(`${status.contractEnd}T12:00:00`).toLocaleDateString('pt-BR') : 'breve'}. A prefeitura deve renovar o contrato para evitar o bloqueio de novas operações.`,
        });
    }

    if (
        status.contractValue != null
        && status.remainingValue != null
        && status.remainingPercent != null
        && status.remainingValue > 0
        && status.remainingPercent <= status.alertPercent
    ) {
        warnings.push({
            key: 'budget-low',
            tone: 'warning',
            title: 'Orçamento da licitação chegando ao fim',
            body: `Restam ${percent.format(status.remainingPercent)}% = ${currency.format(status.remainingValue)} de ${currency.format(status.contractValue)}. Já estão comprometidos ${currency.format(status.committedValue)}.`,
        });
    }

    if (status.contractValue == null) {
        warnings.push({
            key: 'budget-unconfigured',
            tone: 'info',
            title: 'Teto da licitação ainda não informado',
            body: 'O histórico permanece disponível. A prefeitura deve cadastrar o valor total do contrato para acompanhar o saldo e receber alertas de orçamento.',
        });
    }

    if (warnings.length === 0) return null;
    return (
        <div className="space-y-3">
            {warnings.map((warning) => {
                const Icon = warning.tone === 'warning'
                    ? CalendarClock
                    : warning.tone === 'info'
                        ? Info
                        : AlertCircle;
                const classes = warning.tone === 'error'
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : warning.tone === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-950'
                        : 'border-blue-200 bg-blue-50 text-blue-900';
                return (
                    <div key={warning.key} className={`flex gap-3 rounded-2xl border p-4 ${classes}`}>
                        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                            <p className="font-bold">{warning.title}</p>
                            <p className="mt-1 text-sm leading-5 opacity-80">{warning.body}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
