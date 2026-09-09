interface AccessActor {
  id: string;
  role: string;
}
interface AccessTarget {
  id: string;
  role: string;
}

export function assertManagedTarget(
  actor: AccessActor,
  target: AccessTarget,
): void {
  const allowed =
    actor.role === "superadmin"
      ? ["admin", "gestor", "secretario", "motorista"]
      : actor.role === "admin"
        ? ["admin", "gestor", "secretario", "motorista"]
        : actor.role === "gestor"
          ? ["secretario", "motorista"]
          : [];
  if (!allowed.includes(target.role)) {
    throw Object.assign(
      new Error("Este perfil não pode ser alterado por você nesta área."),
      { status: 403 },
    );
  }
}
