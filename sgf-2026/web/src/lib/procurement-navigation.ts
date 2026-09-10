import { canAccessModule } from './accessModules.ts';

interface ProcurementUser {
  accountRole?: string;
  departmentScopeId?: string;
  allowedModules?: readonly string[];
}

export function procurementAccess(user: ProcurementUser | null | undefined) {
  const manager = ['admin', 'gestor', 'superadmin'].includes(user?.accountRole ?? '');
  // The existing RPC returns both supplier types. Only expose the overview
  // to global readers already entitled to both types or to financial reports.
  const overview = manager && !user?.departmentScopeId && (
    canAccessModule(user?.allowedModules, 'reports') || (
      canAccessModule(user?.allowedModules, 'stations') &&
      canAccessModule(user?.allowedModules, 'repair_shops')
    )
  );
  const budgets = Boolean(user) && (manager || user?.accountRole === 'secretario')
    && canAccessModule(user?.allowedModules, 'budgets');
  return { overview, budgets, entry: overview ? '/licitacoes' : budgets ? '/licitacoes/limites' : null };
}
