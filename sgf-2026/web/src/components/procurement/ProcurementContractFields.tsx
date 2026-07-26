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
        <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
            <legend className="px-2 text-sm font-bold text-slate-800">Dados da licitação</legend>
            <p className="text-xs text-slate-500">
                Estas informações controlam a vigência, o orçamento disponível e os alertas do painel.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SGFInput
                    id={`${idPrefix}-contract-number`}
                    label="Número da licitação / contrato"
                    value={contractNumber}
                    onChange={(event) => onContractNumberChange(event.target.value)}
                    placeholder="Ex.: PE 012/2026"
                    fullWidth
                />
                <SGFInput
                    id={`${idPrefix}-contract-start`}
                    label="Início da vigência"
                    type="date"
                    value={contractStart}
                    onChange={(event) => onContractStartChange(event.target.value)}
                    fullWidth
                />
                <SGFInput
                    id={`${idPrefix}-contract-end`}
                    label="Fim da vigência"
                    type="date"
                    value={contractEnd}
                    min={contractStart || undefined}
                    onChange={(event) => onContractEndChange(event.target.value)}
                    fullWidth
                />
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 md:grid-cols-3">
                <SGFInput
                    id={`${idPrefix}-contract-value`}
                    label="Valor total da licitação (R$)"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={contractValue}
                    onChange={(event) => onContractValueChange(event.target.value)}
                    placeholder="Ex.: 1000000,00"
                    hint="Teto financeiro para novas operações."
                    fullWidth
                />
                <SGFInput
                    id={`${idPrefix}-contract-alert-percent`}
                    label="Alertar quando restar (%)"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    step="1"
                    value={contractAlertPercent}
                    onChange={(event) => onContractAlertPercentChange(event.target.value)}
                    hint="Padrão: 20% do valor total."
                    fullWidth
                />
                <SGFInput
                    id={`${idPrefix}-contract-alert-days`}
                    label="Alertar vencimento com (dias)"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="365"
                    step="1"
                    value={contractAlertDays}
                    onChange={(event) => onContractAlertDaysChange(event.target.value)}
                    hint="Padrão: 30 dias de antecedência."
                    fullWidth
                />
            </div>
        </fieldset>
    );
}
