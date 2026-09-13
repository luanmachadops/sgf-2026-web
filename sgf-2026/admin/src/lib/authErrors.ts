// Serviço de auth (Supabase GoTrue) indisponível: 502/503/504 chegam como
// AuthRetryableFetchError com a mensagem `JSON.stringify(response)`, que para
// um Response é literalmente "{}" — sem isso o alerta de login mostra "{}"
// cru para o usuário em vez de um texto legível.
const UNSTABLE_SERVICE_MESSAGE = 'O serviço de autenticação está instável no momento. Tente novamente em alguns instantes.';

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code ?? '')
    : '';
  const name = typeof error === 'object' && error && 'name' in error
    ? String((error as { name?: string }).name ?? '')
    : '';
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status?: number }).status)
    : undefined;
  const message = (error instanceof Error ? error.message : '').trim();

  if (code === 'user_banned' || message.toLowerCase().includes('user is banned')) {
    return 'Seu acesso está bloqueado. Entre em contato com o suporte para mais informações.';
  }
  if (code === 'invalid_credentials' || message === 'Invalid login credentials') {
    return 'E-mail ou senha incorretos.';
  }
  if (code === 'over_request_rate_limit' || status === 429) {
    return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  }
  const isEmptyOrStringifiedObject = !message || message === '{}';
  const isRetryable = name === 'AuthRetryableFetchError'
    || (typeof status === 'number' && status >= 500 && status < 600)
    || error instanceof TypeError
    || isEmptyOrStringifiedObject;
  if (isRetryable) {
    return UNSTABLE_SERVICE_MESSAGE;
  }
  return message || 'Não foi possível entrar.';
}
