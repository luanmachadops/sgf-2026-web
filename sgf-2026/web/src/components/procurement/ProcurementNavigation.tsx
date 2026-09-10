import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { procurementAccess, canManageProcurement } from '@/lib/procurement-navigation';

export function ProcurementNavigation() {
  const { user } = useAuth();
  const access = procurementAccess(user);
  const links = [
    ...(canManageProcurement(user) ? [{ to: '/licitacoes/processos', label: 'Processos, atas e contratos' }] : []),
    ...(access.overview ? [{ to: '/licitacoes', label: 'Contratos atuais' }] : []),
    ...(access.budgets ? [{ to: '/licitacoes/limites', label: 'Limites por secretaria' }] : []),
  ];
  return (
    <nav aria-label="Licitações e contratos" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {links.map(({ to, label }) => (
        <NavLink key={to} to={to} end className={({ isActive }) =>
          `rounded-xl px-4 py-2 text-sm font-medium ${isActive
            ? 'bg-[var(--sgf-primary)] text-white'
            : 'text-slate-600 hover:bg-slate-100'}`
        }>{label}</NavLink>
      ))}
    </nav>
  );
}
