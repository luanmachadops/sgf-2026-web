interface AccessActor {
  id: string;
  role: string;
}
interface AccessTarget {
  id: string;
  role: string;
}

/** Quem pode abrir a Gestão de acessos: só administrador e superadministrador. */
export const ACCESS_MANAGER_ROLES = ["admin", "superadmin"] as const;

export function canManageAccess(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

/** Papéis que a Gestão de acessos cria, edita e remove (nunca o superadmin). */
export const MANAGEABLE_ROLES = ["admin", "gestor", "secretario", "motorista", "posto", "oficina"] as const;

export function assertManagedTarget(
  actor: AccessActor,
  target: AccessTarget,
): void {
  const allowed: readonly string[] = canManageAccess(actor.role) ? MANAGEABLE_ROLES : [];
  if (!allowed.includes(target.role)) {
    throw Object.assign(
      new Error("Este perfil não pode ser alterado por você nesta área."),
      { status: 403 },
    );
  }
}
