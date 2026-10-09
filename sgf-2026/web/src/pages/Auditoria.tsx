import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useHeader } from '@/contexts/HeaderContext';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { Download, ShieldCheck, Search, Info } from '@/components/sgf/icons';
import { ActivityDetailModal } from '@/components/audit/ActivityDetailModal';
import {
  actorRoleLabel,
  buildCsv,
  formatDateTime,
  originLabel,
} from '@/components/audit/auditFormat';
import {
  ACTION_LABELS,
  ENTITY_TYPE_LABELS,
  actionLabel,
  auditApi,
  entityTypeLabel,
  type ActivityRow,
  type ChainVerification,
} from '@/lib/audit-api';

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 10_000;

const ENTITY_OPTIONS = [
  { value: '', label: 'Todos os tipos' },
  ...Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];
const ACTION_OPTIONS = [
  { value: '', label: 'Todas as ações' },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

export default function Auditoria() {
  const { user } = useAuth();
  const { setTitle, setDescription } = useHeader();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<ChainVerification | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setTitle('Trilha de auditoria');
    setDescription('Registro permanente das ações realizadas no sistema');
  }, [setTitle, setDescription]);

  // Debounce da busca textual.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      entityType: entityType || undefined,
      actorId: actorId || undefined,
      action: action || undefined,
      search: search || undefined,
      tenantId: user?.tenantId,
    }),
    [from, to, entityType, actorId, action, search, user?.tenantId],
  );

  const actorsQuery = useQuery({
    queryKey: ['audit-actors', user?.tenantId],
    queryFn: () => auditApi.listActors(),
    staleTime: 5 * 60_000,
  });
  const actorOptions = useMemo(
    () => [
      { value: '', label: 'Todos os usuários' },
      ...(actorsQuery.data ?? []).map((a) => ({
        value: a.id,
        label: a.name,
        description: actorRoleLabel(a.role),
      })),
    ],
    [actorsQuery.data],
  );

  const listQuery = useQuery({
    queryKey: ['audit-log', user?.tenantId, filters, page],
    queryFn: () => auditApi.listActivity({ ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(0); setVerification(null); };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyError(null);
    setVerification(null);
    try {
      setVerification(await auditApi.verifyChain(from || undefined, to || undefined));
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : 'Falha ao verificar a integridade.');
    } finally {
      setVerifying(false);
    }
  };

  const openBroken = async () => {
    if (!verification?.firstBrokenId) return;
    try {
      const row = await auditApi.getById(verification.firstBrokenId);
      if (row) setSelected(row);
      else toast.error('Registro não disponível para o seu perfil.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao abrir o registro.');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { rows: all, truncated } = await auditApi.listForExport(filters, EXPORT_LIMIT);
      if (all.length === 0) {
        toast.info('Nenhum registro para exportar.');
        return;
      }
      const blob = new Blob([buildCsv(all)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trilha-auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (truncated) {
        toast.warning(`Exportação limitada aos ${EXPORT_LIMIT.toLocaleString('pt-BR')} registros mais recentes. Refine o período para obter o restante.`);
      } else {
        toast.success(`${all.length.toLocaleString('pt-BR')} registros exportados.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao exportar.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--sgf-primary)]" />
        <p>
          Os registros desta trilha são permanentes: não podem ser alterados nem apagados.
          Cada registro é encadeado ao anterior por um hash, o que permite detectar qualquer adulteração.
        </p>
      </div>

      <SGFCard className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SGFInput label="De" type="date" value={from} max={to || undefined} onChange={(e) => resetPage(setFrom)(e.target.value)} />
          <SGFInput label="Até" type="date" value={to} min={from || undefined} onChange={(e) => resetPage(setTo)(e.target.value)} />
          <SGFSelect label="Tipo de registro" options={ENTITY_OPTIONS} value={entityType} onChange={resetPage(setEntityType)} />
          <SGFSelect label="Ação" options={ACTION_OPTIONS} value={action} onChange={resetPage(setAction)} />
          <SGFSelect label="Usuário" options={actorOptions} value={actorId} onChange={resetPage(setActorId)} searchable searchPlaceholder="Buscar usuário" />
          <div className="sm:col-span-1 lg:col-span-3">
            <SGFInput
              label="Buscar no registro"
              icon={Search}
              placeholder="Placa, nome ou identificação do registro"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {listQuery.isLoading ? 'Carregando…' : `${total.toLocaleString('pt-BR')} registro(s)`}
          </p>
          <div className="flex flex-wrap gap-2">
            <SGFButton variant="outline" icon={ShieldCheck} loading={verifying} onClick={handleVerify}>
              Verificar integridade
            </SGFButton>
            <SGFButton variant="outline" icon={Download} loading={exporting} onClick={handleExport} disabled={total === 0}>
              Exportar CSV
            </SGFButton>
          </div>
        </div>

        {verifyError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Não foi possível verificar a integridade: {verifyError}
          </div>
        )}
        {verification && verification.ok && (
          <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-700">
            Íntegra — {verification.checked.toLocaleString('pt-BR')} registros verificados
            {(from || to) ? ' no período filtrado.' : '.'}
          </div>
        )}
        {verification && !verification.ok && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <span>
              Divergência a partir do registro #{verification.firstBrokenSeq ?? '?'} ({verification.checked.toLocaleString('pt-BR')} verificados antes da falha).
            </span>
            {verification.firstBrokenId && (
              <button type="button" onClick={openBroken} className="underline underline-offset-2 hover:text-red-900">
                Abrir registro #{verification.firstBrokenSeq}
              </button>
            )}
          </div>
        )}
      </SGFCard>

      <SGFCard className="overflow-hidden p-0">
        {listQuery.isError ? (
          <div role="alert" className="p-8 text-center text-sm text-red-700">
            Erro ao carregar a trilha: {listQuery.error instanceof Error ? listQuery.error.message : 'tente novamente.'}
            <div className="mt-3">
              <SGFButton variant="outline" size="sm" onClick={() => listQuery.refetch()}>Tentar novamente</SGFButton>
            </div>
          </div>
        ) : listQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Carregando trilha de auditoria…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Nenhum registro encontrado para os filtros selecionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Data/hora</th>
                  <th className="px-4 py-3 font-semibold">Usuário</th>
                  <th className="px-4 py-3 font-semibold">Ação</th>
                  <th className="px-4 py-3 font-semibold">Registro</th>
                  <th className="px-4 py-3 font-semibold">Origem / IP</th>
                  <th className="px-4 py-3 font-semibold">Seq.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => setSelected(r)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelected(r); }}
                    className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{r.actor_name ?? 'Sistema'}</div>
                      <div className="text-xs text-slate-500">{actorRoleLabel(r.actor_role)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <SGFBadge variant={r.action === 'delete' || r.action === 'reject' ? 'error' : r.action === 'create' || r.action === 'approve' ? 'success' : 'default'} size="sm">
                        {actionLabel(r.action)}
                      </SGFBadge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{entityTypeLabel(r.entity_type)}</div>
                      <div className="text-xs text-slate-500">{r.entity_label ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{originLabel(r)}</td>
                    <td className="px-4 py-3 text-slate-500">#{r.chain_seq}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <SGFButton variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</SGFButton>
              <SGFButton variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</SGFButton>
            </div>
          </div>
        )}
      </SGFCard>

      <ActivityDetailModal row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
