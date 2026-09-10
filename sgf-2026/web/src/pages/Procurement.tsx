import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useHeader } from '@/contexts/HeaderContext';
import { SGFCard, SGFButton, SGFInput, SGFSelect, SGFBadge } from '@/components/sgf';
import { ProcurementNavigation } from '@/components/procurement/ProcurementNavigation';
import { procurementApi } from '@/lib/procurement-api';
import { procurementAccess } from '@/lib/procurement-navigation';
import { canAccessModule } from '@/lib/accessModules';
import { formatCurrency, matchesSearch } from '@/lib/utils';

const PAGE_SIZE = 10;
const money = (value: number | null) => value === null ? 'Não informado' : formatCurrency(value);
const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada';

export default function Procurement() {
  const { user } = useAuth();
  const access = procurementAccess(user);
  if (!access.overview) return <Navigate to={access.entry ?? '/perfil'} replace />;
  return <ContractOverview />;
}

function ContractOverview() {
  const { user } = useAuth();
  const { setTitle, setDescription } = useHeader();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['procurement-contract-usage', user?.tenantId],
    queryFn: procurementApi.getContractUsage,
    enabled: Boolean(user?.tenantId),
  });
  useEffect(() => {
    setTitle('Licitações e Contratos');
    setDescription('Consulta dos contratos de fornecedores e dos limites por secretaria.');
  }, [setTitle, setDescription]);

  const records = (query.data ?? []).filter((row) =>
    (!kind || row.partnerKind === kind) &&
    matchesSearch(search, row.partnerName, row.contractNumber ?? '') &&
    (!filter || (filter === 'incomplete'
      ? !row.contractNumber?.trim() || row.contractValue === null || !row.contractStart || !row.contractEnd
      : filter === 'expired'
        ? row.daysRemaining !== null && row.daysRemaining < 0
        : !row.canCreateNew)),
  ).sort((a, b) => a.partnerName.localeCompare(b.partnerName, 'pt-BR') || a.partnerId.localeCompare(b.partnerId));
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = records.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const pending = query.isPending;

  return (
    <div className="space-y-6">
      <ProcurementNavigation />
      <SGFCard>
        <h2 className="font-semibold text-slate-900">Contratos informados nos fornecedores</h2>
        <p className="mt-2 text-sm text-slate-600">
          Cada linha corresponde ao cadastro atual de um posto ou oficina. Referências iguais
          precisam ser conferidas nos documentos antes de serem tratadas como uma única licitação.
          Os valores apresentados são os limites informados em cada cadastro.
        </p>
      </SGFCard>
      <div className="grid gap-3 sm:grid-cols-3">
        <SGFInput label="Buscar fornecedor ou referência" value={search} fullWidth
          onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
        <SGFSelect label="Fornecedor" value={kind} fullWidth
          options={[{ value: '', label: 'Postos e oficinas' }, { value: 'posto', label: 'Postos' }, { value: 'oficina', label: 'Oficinas' }]}
          onChange={(value) => { setKind(value); setPage(0); }} />
        <SGFSelect label="Conferência" value={filter} fullWidth
          options={[{ value: '', label: 'Todos os registros' }, { value: 'incomplete', label: 'Dados contratuais incompletos' }, { value: 'expired', label: 'Vigência encerrada' }, { value: 'blocked', label: 'Novas operações bloqueadas' }]}
          onChange={(value) => { setFilter(value); setPage(0); }} />
      </div>
      {pending ? <p role="status">Carregando contratos…</p> : query.isError ? (
        <SGFCard>
          <p role="alert" className="mb-3 text-red-700">Não foi possível carregar os contratos. Confira sua conexão e tente novamente.</p>
          <SGFButton onClick={() => void query.refetch()} loading={query.isFetching}>Tentar novamente</SGFButton>
        </SGFCard>
      ) : (
        <SGFCard padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <p className="text-sm text-slate-600" role="status">{records.length} registro(s) encontrado(s)</p>
            <SGFButton size="sm" variant="ghost" loading={query.isFetching} onClick={() => void query.refetch()}>Atualizar</SGFButton>
          </div>
          {records.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">Nenhum registro encontrado. Revise os filtros ou confira os cadastros de fornecedores.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <caption className="sr-only">Contratos atuais por fornecedor, com vigência e composição do saldo</caption>
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>{['Fornecedor / referência', 'Vigência', 'Valor informado', 'Reservado', 'Realizado', 'Contestado', 'Disponível', 'Situação'].map((heading) => <th key={heading} scope="col" className="px-4 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((row) => {
                    const canOpen = canAccessModule(user?.allowedModules, row.partnerKind === 'posto' ? 'stations' : 'repair_shops');
                    const href = `/${row.partnerKind === 'posto' ? 'postos' : 'oficinas'}/${row.partnerId}`;
                    return (
                      <tr key={`${row.partnerKind}:${row.partnerId}`}>
                        <th scope="row" className="px-4 py-4 font-normal">
                          {canOpen ? <Link to={href} className="font-semibold text-[var(--sgf-primary)] hover:underline">{row.partnerName}</Link> : <span className="font-semibold">{row.partnerName}</span>}
                          <p className="mt-1 text-xs text-slate-500">{row.partnerKind === 'posto' ? 'Posto' : 'Oficina'} · {row.contractNumber?.trim() || 'Referência não informada'}</p>
                        </th>
                        <td className="px-4 py-4 text-xs">{date(row.contractStart)}<br />até {date(row.contractEnd)}</td>
                        <td className="px-4 py-4">{money(row.contractValue)}</td>
                        <td className="px-4 py-4">{money(row.reservedValue)}</td>
                        <td className="px-4 py-4">{money(row.realizedValue)}</td>
                        <td className="px-4 py-4">{money(row.disputedValue)}</td>
                        <td className="px-4 py-4 font-semibold">{money(row.remainingValue)}</td>
                        <td className="px-4 py-4"><SGFBadge variant={row.canCreateNew ? 'info' : 'warning'}>{row.canCreateNew ? 'Sem bloqueio operacional' : 'Novas operações bloqueadas'}</SGFBadge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4">
            <p className="text-xs text-slate-500">Página {currentPage + 1} de {pages}</p>
            <div className="flex gap-2">
              <SGFButton variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</SGFButton>
              <SGFButton variant="ghost" size="sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Próxima</SGFButton>
            </div>
          </div>
        </SGFCard>
      )}
      <p className="text-xs text-slate-500">A situação operacional reflete os controles atuais. A regularidade documental deve ser conferida no instrumento da contratação. Faturamento e pagamento são etapas da mesma despesa e não são somados novamente ao consumo.</p>
    </div>
  );
}
