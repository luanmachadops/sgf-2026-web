export interface ProcurementContractValues {
    contractNumber: string;
    contractStart: string;
    contractEnd: string;
    contractValue: string;
    contractAlertPercent: string;
    contractAlertDays: string;
}

export function validateProcurementContract(values: ProcurementContractValues): string | null {
    const value = values.contractValue === '' ? null : Number(values.contractValue);
    const alertPercent = Number(values.contractAlertPercent);
    const alertDays = Number(values.contractAlertDays);

    if (value != null && (!Number.isFinite(value) || value < 0)) {
        return 'O valor da licitação não pode ser negativo.';
    }
    if (values.contractStart && values.contractEnd && values.contractEnd < values.contractStart) {
        return 'O vencimento da licitação não pode ser anterior ao início da vigência.';
    }
    if (!Number.isFinite(alertPercent) || alertPercent < 0 || alertPercent > 100) {
        return 'O alerta de saldo deve estar entre 0% e 100%.';
    }
    if (!Number.isInteger(alertDays) || alertDays < 1 || alertDays > 365) {
        return 'O alerta de vencimento deve estar entre 1 e 365 dias.';
    }

    return null;
}

export function assertContractDatesPersisted(
    saved: { contract_start?: string | null; contract_end?: string | null },
    expected: { contract_start: string | null; contract_end: string | null },
): void {
    if (
        (saved.contract_start ?? null) !== expected.contract_start
        || (saved.contract_end ?? null) !== expected.contract_end
    ) {
        throw new Error('As datas da licitação não foram confirmadas pelo banco. Revise os dados e tente novamente.');
    }
}
