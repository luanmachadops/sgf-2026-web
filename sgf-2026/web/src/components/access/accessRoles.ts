import type { ManagedAccess, ManagedAccessRole } from '@/lib/backend-api';

export const ROLE_LABEL: Record<ManagedAccessRole, string> = {
    admin: 'Administrador',
    gestor: 'Gestor',
    secretario: 'Secretário',
    motorista: 'Motorista',
    posto: 'Posto',
    oficina: 'Oficina',
};

export const STAFF_ROLES: ManagedAccessRole[] = ['admin', 'gestor', 'secretario'];

/** Como a pessoa entra: e-mail (equipe e parceiros) ou CPF (motorista). */
export function loginOf(access: Pick<ManagedAccess, 'role' | 'email' | 'cpf'>): string {
    if (access.role === 'motorista') return access.cpf ? `CPF ${access.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : 'Sem CPF';
    return access.email ?? 'Sem e-mail';
}
