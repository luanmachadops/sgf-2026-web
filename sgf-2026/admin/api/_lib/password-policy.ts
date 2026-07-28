/**
 * Política de senha única para a API do painel superadmin (admin/api).
 *
 * Espelha `web/api/_lib/password-policy.ts` — duplicado de propósito, e não
 * importado entre pastas: `admin/` e `web/` são dois deployables Vercel
 * separados (vercel.json e node_modules próprios cada um), então um import
 * relativo cruzando a raiz do projeto não seria empacotado pela função
 * serverless. É o mesmo padrão já usado aqui para `getAdmin()`/
 * `assertSuperadmin()`, duplicados entre `managers.ts` e `tenants/create.ts`.
 *
 * Antes desta unificação, o admin da prefeitura (`tenants/create.ts`) e os
 * gestores/secretários (`managers.ts`) — os perfis mais privilegiados do
 * sistema — tinham a exigência mais fraca (mínimo 6), mais fraca até que a
 * do motorista (mínimo 8). Regra única: mínimo 12, teto 72 (limite físico
 * do bcrypt).
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72;

export function passwordPolicyMessage(label = 'Senha'): string {
    return `${label} deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres`;
}

/** Lança com status 400 quando a senha não atende à política. */
export function assertStrongPassword(password: unknown, label = 'Senha'): asserts password is string {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        throw Object.assign(new Error(passwordPolicyMessage(label)), { status: 400 });
    }
}
