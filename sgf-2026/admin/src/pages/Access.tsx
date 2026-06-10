import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { tenantsApi } from '@/lib/api';
import { Card, Badge } from '@/lib/ui';
import { ManagersPanel } from '@/components/ManagersPanel';

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export default function Access() {
  const qc = useQueryClient();
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const trials = tenants.filter((t) => t.status === 'trial');

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => tenantsApi.update(id, { status }),
    onSuccess: () => { toast.success('Status atualizado.'); qc.invalidateQueries({ queryKey: ['tenants'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gestão de Acessos</h1>
        <p className="text-sm text-slate-500">Gestores das prefeituras e acompanhamento de trials/demos.</p>
      </div>

      {/* Trials / Demos */}
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Trials & Demos</h2>
        <p className="mb-3 text-sm text-slate-500">{trials.length} prefeitura(s) em período de avaliação.</p>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-5 py-3">Prefeitura</th><th className="px-5 py-3">Criada em</th><th className="px-5 py-3">Dias em trial</th><th className="px-5 py-3">Status</th><th></th>
              </tr></thead>
              <tbody>
                {trials.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      <Link to={`/prefeituras/${t.id}`} className="hover:text-[var(--sgf-primary)] hover:underline">{t.name}</Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`font-semibold ${daysSince(t.created_at) > 30 ? 'text-rose-600' : 'text-slate-700'}`}>{daysSince(t.created_at)} dias</span>
                    </td>
                    <td className="px-5 py-3"><Badge status={t.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => setStatus.mutate({ id: t.id, status: 'active' })} className="text-xs font-semibold text-[var(--sgf-primary)] hover:underline">Ativar</button>
                        <button onClick={() => setStatus.mutate({ id: t.id, status: 'suspended' })} className="text-xs font-semibold text-rose-600 hover:underline">Suspender</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {trials.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Nenhuma prefeitura em trial.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Gestores */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Gestores das prefeituras</h2>
        <ManagersPanel />
      </div>
    </div>
  );
}
