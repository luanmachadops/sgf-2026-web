import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tenantsApi, type Tenant } from '@/lib/api';
import { Badge } from '@/lib/ui';
import { PageHeader, SectionTitle, SGFTable, SGFButton } from '@/components/sgf';
import { ManagersPanel } from '@/components/ManagersPanel';
import { TenantIdentity } from '@/components/TenantIdentity';

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export default function Access() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const trials = tenants.filter((t) => t.status === 'trial');

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => tenantsApi.update(id, { status }),
    onSuccess: () => { toast.success('Situação atualizada.'); qc.invalidateQueries({ queryKey: ['tenants'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Acessos" subtitle="Gestores das prefeituras e acompanhamento das avaliações (trial)." />

      <div>
        <SectionTitle>Em avaliação</SectionTitle>
        <p className="-mt-1 mb-3 px-1 text-sm text-[var(--rt-ink500)]">{trials.length} {trials.length === 1 ? 'prefeitura' : 'prefeituras'} em período de teste. Acima de 30 dias fica em destaque.</p>
        <SGFTable<Tenant>
          loading={isLoading}
          data={trials}
          keyExtractor={(t) => t.id}
          onRowClick={(t) => navigate(`/prefeituras/${t.id}`)}
          emptyMessage="Nenhuma prefeitura em avaliação."
          columns={[
            { header: 'Prefeitura', accessor: (t) => <TenantIdentity tenant={t} /> },
            { header: 'Criada em', accessor: (t) => (t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '—') },
            {
              header: 'Tempo em teste',
              accessor: (t) => {
                const d = daysSince(t.created_at);
                return <span className={`rt-num font-semibold ${d > 30 ? 'text-[var(--rt-red600)]' : 'text-[var(--rt-ink900)]'}`}>{d} {d === 1 ? 'dia' : 'dias'}</span>;
              },
            },
            { header: 'Situação', accessor: (t) => <Badge status={t.status} /> },
            {
              header: '',
              headerClassName: 'text-right',
              className: 'text-right',
              accessor: (t) => (
                <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <SGFButton size="sm" onClick={() => setStatus.mutate({ id: t.id, status: 'active' })}>Ativar</SGFButton>
                  <SGFButton size="sm" variant="ghost" className="!text-[var(--rt-red600)]" onClick={() => setStatus.mutate({ id: t.id, status: 'suspended' })}>Suspender</SGFButton>
                </div>
              ),
            },
          ]}
        />
      </div>

      <div>
        <SectionTitle>Gestores das prefeituras</SectionTitle>
        <ManagersPanel />
      </div>
    </div>
  );
}
