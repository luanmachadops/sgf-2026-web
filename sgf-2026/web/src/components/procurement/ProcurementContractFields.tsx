import { SGFInput } from '@/components/sgf/SGFInput';
import type { ProcurementContractValues } from '@/lib/procurement-contract';

interface ProcurementContractFieldsProps extends ProcurementContractValues {
    idPrefix: string;
    onContractNumberChange: (value: string) => void;
    onContractStartChange: (value: string) => void;
    onContractEndChange: (value: string) => void;
    onContractValueChange: (value: string) => void;
    onContractAlertPercentChange: (value: string) => void;
    onContractAlertDaysChange: (value: string) => void;
}

export function ProcurementContractFields({
    idPrefix,
    contractNumber,
    contractStart,
    contractEnd,
    contractValue,
    contractAlertPercent,
    contractAlertDays,
    onContractNumberChange,
    onContractStartChange,
    onContractEndChange,
    onContractValueChange,
    onContractAlertPercentChange,
    onContractAlertDaysChange,
}: ProcurementContractFieldsProps) {
    return (
        <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
            <legend className="px-2 text-xs font-bold uppercase tracking-wider text-slate-700">Dados da licitação</legend>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <SGFInput
                    id={`${idPrefix}-contract-number`}
                    label="Nº Licitação / Contrato"
                    value={contractNumber}
                    onChange={(event) => onContractNumberChange(event.target.value)}
                    placeholder="Ex.: PE 012/2026"
                    fullWidth
                />
                <SGFInput
                    id={`${idPrefix}-contract-start`}
                    label="Início Vigência"
                    type="date"
                    value={contractStart}
                    onChange={(event) => onContractStartChange(event.target.value)}
                    fullWidth
                />
                <SGFInput
                    id={`${idPrefix}-contract-end`}
                    label="Fim Vigência"
                    type="date"
                    value={contractEnd}
                    min={contractStart || undefined}
                    onChange={(event) => onContractEndChange(event.target.value)}
                    fullWidth
                />
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-slate-200/80 pt-3 md:grid-cols-3">
                <SGFInput
                    id={`${idPrefix}-contract-value`}
                    label="Valor Total (R$)"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={contractValue}
                    onChange={(event) => onContractValueChange(event.target.value)}
                    placeholder="Ex.: 1000000,00"
                    fullWidth
                />
                <SGFInput
                    id={`${idPrefix}-contract-alert-percent`}
                    label="Alerta Saldo (%)"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    step="1"
                    value={contractAlertPercent}
                    onChange={(event) => onContractAlertPercentChange(event.target.value)}
                    fullWidth
                />
                <SGFInput
                    id={`${idPrefix}-contract-alert-days`}
                    label="Alerta Vencimento (dias)"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="365"
                    step="1"
                    value={contractAlertDays}
                    onChange={(event) => onContractAlertDaysChange(event.target.value)}
                    fullWidth
                />
            </div>
        </fieldset>
    );
}
