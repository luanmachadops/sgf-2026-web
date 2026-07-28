/**
 * Política de senha do cliente (painel superadmin) — espelha `admin/api/_lib/password-policy.ts`.
 *
 * A API já rejeita senhas fora da política (mínimo 12, teto 72 — limite físico do
 * bcrypt), mas se o formulário aceitar 6 caracteres o usuário só descobre isso num 400
 * sem explicação clara. Este arquivo é a fonte única do número no cliente, para nenhum
 * campo/mensagem/placeholder divergir do que a API exige.
 *
 * Duplicado de propósito em `web/src/lib/passwordPolicy.ts`: `admin/` e `web/` são dois
 * deployables Vercel separados, então não há import cruzando a raiz do projeto.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_MIN_LENGTH_MESSAGE = `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
export const PASSWORD_MAX_LENGTH_MESSAGE = `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
export const PASSWORD_PLACEHOLDER = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres`;

export function isPasswordLongEnough(password: string): boolean {
    return password.trim().length >= PASSWORD_MIN_LENGTH;
}
