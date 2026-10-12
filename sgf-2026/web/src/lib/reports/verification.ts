// Código de verificação dos relatórios (register_report_snapshot/verify_report).
// Separado de `pdf.ts` para a tela não carregar o motor de PDF só para formatar.

/** "ABCD2345EFGH" → "ABCD-2345-EFGH". */
export function formatVerificationCode(code: string): string {
    return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().match(/.{1,4}/g)?.join('-') ?? code;
}

/** Normaliza o que a pessoa digitou ou o que veio na URL. */
export function normalizeVerificationCode(value: string): string {
    return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
