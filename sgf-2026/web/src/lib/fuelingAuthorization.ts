/**
 * Autorização de abastecimento vencida: o posto deixa de vê-la (a lista do
 * posto filtra expires_at > agora), mas ela continua "autorizado" no banco até
 * o gestor cancelar — e, se for de contrato, segue reservando saldo.
 */
export function isAuthorizationExpired(workflowStatus: string | null | undefined, expiresAt: string | null | undefined): boolean {
    return workflowStatus === 'autorizado' && !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
}
