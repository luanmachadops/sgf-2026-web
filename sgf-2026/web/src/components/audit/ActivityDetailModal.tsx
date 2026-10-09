import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { ChevronDown, ChevronRight, Copy } from '@/components/sgf/icons';
import { maskCpfLGPD } from '@/lib/utils';
import { actionLabel, entityTypeLabel, type ActivityRow } from '@/lib/audit-api';
import {
  actorRoleLabel,
  formatDateTime,
  originLabel,
  parseChanges,
  shortHash,
} from './auditFormat';

function CopyHash({ value }: { value: string | null }) {
  if (!value) return <span>—</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Hash copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700" title={value}>
        {shortHash(value)}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copiar hash"
        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <Copy className="h-4 w-4" />
      </button>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export function ActivityDetailModal({ row, onClose }: { row: ActivityRow | null; onClose: () => void }) {
  const [showSnapshot, setShowSnapshot] = useState(false);
  if (!row) return null;
  const diff = parseChanges(row.changes);

  return (
    <Modal
      isOpen
      onClose={() => { setShowSnapshot(false); onClose(); }}
      title={`Registro de auditoria #${row.chain_seq}`}
      description={formatDateTime(row.created_at)}
      size="lg"
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-2">
          <Field label="Usuário">
            {row.actor_name ?? 'Sistema'}
            {row.actor_incomplete && <span className="ml-1 text-xs text-amber-600">(identificação incompleta)</span>}
          </Field>
          <Field label="Perfil">{actorRoleLabel(row.actor_role)}</Field>
          <Field label="CPF">{maskCpfLGPD(row.actor_cpf)}</Field>
          <Field label="Secretaria do usuário">{row.actor_department_name ?? '—'}</Field>
          <Field label="Ação">{actionLabel(row.action)}</Field>
          <Field label="Sensibilidade">
            <SGFBadge variant={row.sensitivity === 'sensivel' ? 'warning' : 'default'} size="sm">
              {row.sensitivity === 'sensivel' ? 'Sensível' : 'Operacional'}
            </SGFBadge>
          </Field>
          <Field label="Registro afetado">
            {entityTypeLabel(row.entity_type)}{row.entity_label ? ` · ${row.entity_label}` : ''}
          </Field>
          <Field label="Origem / IP">{originLabel(row)}</Field>
          <div className="sm:col-span-2">
            <Field label="Navegador / dispositivo (user agent)">{row.user_agent ?? '—'}</Field>
          </div>
        </dl>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Alterações</h3>
          {diff.length === 0 ? (
            <p className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-500">
              Este evento não registra alteração campo a campo.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
              {diff.map((d) => (
                <li key={d.field} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-3">
                  <span className="w-44 shrink-0 font-medium text-slate-700">{d.label}</span>
                  <span className="min-w-0 break-words text-slate-500 line-through decoration-slate-300">{d.before}</span>
                  <span aria-hidden className="text-slate-400">→</span>
                  <span className="min-w-0 break-words font-medium text-slate-900">{d.after}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <button
            type="button"
            onClick={() => setShowSnapshot((v) => !v)}
            aria-expanded={showSnapshot}
            className="flex items-center gap-1 text-sm font-semibold text-slate-800"
          >
            {showSnapshot ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Registro completo (snapshot)
          </button>
          {showSnapshot && (
            <pre className="mt-2 max-h-72 overflow-auto rounded-2xl border border-slate-100 bg-white p-4 text-xs text-slate-700">
              {row.snapshot ? JSON.stringify(row.snapshot, null, 2) : 'Sem snapshot neste evento.'}
            </pre>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Integridade (encadeamento)</h3>
          <dl className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-3">
            <Field label="Sequência">#{row.chain_seq}</Field>
            <Field label="Hash do registro"><CopyHash value={row.row_hash} /></Field>
            <Field label="Hash anterior"><CopyHash value={row.prev_hash} /></Field>
          </dl>
        </section>
      </div>
    </Modal>
  );
}
