/**
 * Política de senha única para toda a API do painel (web/api).
 *
 * Antes desta unificação, cada rota validava por conta própria e as regras
 * divergiam — e divergiam na direção errada: quem tem mais poder (admin da
 * prefeitura, gestor) tinha a exigência mais fraca (mínimo 6), enquanto o
 * motorista tinha mínimo 8. Um teto de 20 caracteres também rejeitava
 * passphrases fortes sem ganho nenhum de segurança.
 *
 * Regra única: mínimo 12, teto 72 (limite físico do bcrypt — acima disso o
 * hash trunca em silêncio, então não é "mais seguro", é só enganoso aceitar).
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
