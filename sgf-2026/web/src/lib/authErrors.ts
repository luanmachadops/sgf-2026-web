export const SUSPENDED_TENANT_KEY = 'exattus-suspended-tenant';

export interface SuspendedTenantInfo {
  name: string;
  supportEmail?: string;
  supportPhone?: string;
}

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code ?? '')
    : '';
  const message = error instanceof Error ? error.message : '';

  if (code === 'user_banned' || message.toLowerCase().includes('user is banned')) {
    return 'Seu acesso está bloqueado. Entre em contato com o suporte para mais informações.';
  }
  if (code === 'invalid_credentials' || message === 'Invalid login credentials') {
    return 'E-mail ou senha inválidos.';
  }
  if (code === 'email_not_confirmed') {
    return 'Seu e-mail ainda não foi confirmado.';
  }
  if (code === 'over_request_rate_limit') {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }
  return message || 'Não foi possível concluir a operação.';
}

export function rememberSuspendedTenant(info: SuspendedTenantInfo): void {
  try {
    sessionStorage.setItem(SUSPENDED_TENANT_KEY, JSON.stringify(info));
  } catch {
    // O navegador pode bloquear storage em modo privado.
  }
}

export function readSuspendedTenant(): SuspendedTenantInfo | null {
  try {
    const raw = sessionStorage.getItem(SUSPENDED_TENANT_KEY);
    return raw ? JSON.parse(raw) as SuspendedTenantInfo : null;
  } catch {
    return null;
  }
}
