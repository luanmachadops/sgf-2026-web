import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { contractsApi, type Contract, type Tenant } from '@/lib/api';
import { Button, Input, Badge, fmtBrl, MoneyInput } from '@/lib/ui';
import { Sheet, SGFSelect, SGFButton } from '@/components/sgf';
import { FileText, Trash2, Upload, Clock } from '@/components/sgf/icons';

const br = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Tela do contrato: resumo, dados editáveis, documentos (abrir, enviar, tirar) e exclusão. */
export function ContractSheet({ contract, tenant, onClose }: { contract: Contract | null; tenant?: Tenant; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: '', object: '', value: '', start_date: '', end_date: '', status: 'active' });
  const [docs, setDocs] = useState(contract ? contractsApi.documents(contract) : []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!contract) return;
    setF({
      title: contract.title ?? '', object: contract.object ?? '', value: contract.value != null ? String(contract.value) : '',
      start_date: contract.start_date ?? '', end_date: contract.end_date ?? '', status: contract.status ?? 'active',
    });
    setDocs(contractsApi.documents(contract));
    setConfirmDelete(false);
  }, [contract]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['contracts'] });
  const save = useMutation({
    mutationFn: () => contractsApi.update(contract!.id, {
      title: f.title.trim(), object: f.object.trim() || null, value: f.value ? Number(f.value) : null,
      start_date: f.start_date || null, end_date: f.end_date || null, status: f.status,
    }),
    onSuccess: () => { toast.success('Contrato atualizado.'); refresh(); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const upload = useMutation({
    mutationFn: (files: File[]) => contractsApi.uploadDocuments({ ...contract!, documents: docs as never }, files),
    onSuccess: (next) => { setDocs(next); toast.success('Documento enviado.'); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const unlink = useMutation({
    mutationFn: (path: string) => contractsApi.unlinkDocument({ ...contract!, documents: docs as never }, path),
    onSuccess: (_r, path) => { setDocs((d) => d.filter((x) => x.path !== path)); toast.success('Documento retirado do contrato.'); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => contractsApi.remove(contract!.id),
    onSuccess: () => { toast.success('Contrato excluído.'); refresh(); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const daysLeft = contract?.end_date ? Math.ceil((new Date(`${contract.end_date}T23:59:59`).getTime() - Date.now()) / 864e5) : null;

  return (
    <Sheet
      open={!!contract}
      onClose={onClose}
      size="lg"
      title={contract?.title ?? 'Contrato'}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <SGFButton variant="danger" size="sm" loading={remove.isPending} onClick={() => remove.mutate()}>Confirmar exclusão</SGFButton>
              <SGFButton variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Não</SGFButton>
            </div>
          ) : (
            <SGFButton variant="ghost" size="sm" icon={Trash2} className="!text-[var(--rt-red600)]" onClick={() => setConfirmDelete(true)}>Excluir contrato</SGFButton>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button disabled={!f.title.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Salvando…' : 'Salvar alterações'}</Button>
          </div>
        </div>
      }
    >
      {contract && (
        <div className="space-y-6">
          {/* Resumo */}
          <div className="relative overflow-hidden rounded-[22px] bg-[var(--rt-ink900)] text-white">
            {tenant?.photo_url && <img src={tenant.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--rt-ink900)] via-[var(--rt-ink900)]/85 to-[var(--rt-ink900)]/40" aria-hidden />
            <div className="relative p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white ring-4 ring-white/10">
                  {tenant?.seal_url || tenant?.logo_url
                    ? <img src={(tenant.seal_url || tenant.logo_url) as string} alt="" className="h-full w-full object-contain p-1" />
                    : <FileText width={22} height={22} className="text-[var(--rt-ink900)]" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-snug">{tenant?.name ?? '—'}</p>
                  <p className="text-xs text-white/60">{[tenant?.city && `${tenant.city}${tenant.state ? '/' + tenant.state : ''}`, contract.object].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <Badge status={contract.status} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
              <div>
                <p className="text-xs text-white/55">Valor</p>
                <p className="rt-num mt-1 text-2xl font-light">{contract.value != null ? fmtBrl(Number(contract.value)) : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-white/55">Vigência</p>
                <p className="rt-num mt-1 whitespace-nowrap text-[15px]">{br(contract.start_date)} – {br(contract.end_date)}</p>
              </div>
              <div>
                <p className="text-xs text-white/55">Prazo</p>
                <p className={`mt-1 inline-flex items-center gap-1.5 text-[15px] ${daysLeft != null && daysLeft <= 30 ? 'text-[#FCD34D]' : ''}`}>
                  <Clock width={16} height={16} />
                  {daysLeft == null ? 'Sem data de fim' : daysLeft < 0 ? `Venceu há ${-daysLeft} dias` : `${daysLeft} dias restantes`}
                </p>
              </div>
            </div>
            </div>
          </div>

          {/* Documentos */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-[var(--rt-ink900)]">Documentos <span className="text-[var(--rt-ink400)]">({docs.length})</span></h3>
              <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-[var(--rt-ink900)] px-4 text-[13px] font-semibold text-white transition hover:bg-[#163b40] ${upload.isPending ? 'pointer-events-none opacity-60' : ''}`}>
                <Upload width={16} height={16} /> {upload.isPending ? 'Enviando…' : 'Enviar'}
                <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="sr-only" onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) upload.mutate(files);
                  e.currentTarget.value = '';
                }} />
              </label>
            </div>
            {docs.length === 0 ? (
              <p className="rounded-2xl bg-[var(--rt-paper)] px-4 py-6 text-center text-sm text-[var(--rt-ink500)]">Nenhum documento anexado.</p>
            ) : (
              <ul className="space-y-2">
                {docs.map((d) => (
                  <li key={d.path} className="flex items-center gap-3 rounded-2xl bg-[var(--rt-paper)] p-2.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--rt-ink500)]"><FileText width={20} height={20} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--rt-ink900)]">{d.name}</p>
                      <p className="text-xs text-[var(--rt-ink500)]">{kb(d.size)}</p>
                    </div>
                    <SGFButton size="sm" variant="outline" onClick={() => contractsApi.openDocument(d).catch((e) => toast.error((e as Error).message))}>Abrir</SGFButton>
                    <button type="button" aria-label={`Tirar ${d.name}`} onClick={() => unlink.mutate(d.path)} className="grid h-9 w-9 place-items-center rounded-full text-[var(--rt-ink400)] transition hover:bg-white hover:text-[var(--rt-red600)]">
                      <Trash2 width={16} height={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Dados */}
          <section>
            <h3 className="mb-3 text-[15px] font-semibold text-[var(--rt-ink900)]">Dados do contrato</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Título" value={f.title} onChange={(e) => setF((c) => ({ ...c, title: e.target.value }))} className="sm:col-span-2" />
              <Input label="Objeto" value={f.object} onChange={(e) => setF((c) => ({ ...c, object: e.target.value }))} className="sm:col-span-2" />
              <MoneyInput label="Valor" value={f.value} onChange={(v) => setF((c) => ({ ...c, value: v }))} />
              <SGFSelect label="Situação" fullWidth value={f.status} onChange={(status) => setF((c) => ({ ...c, status }))}
                options={[{ value: 'active', label: 'Ativo' }, { value: 'expired', label: 'Vencido' }, { value: 'canceled', label: 'Cancelado' }]} />
              <Input label="Início" type="date" value={f.start_date} onChange={(e) => setF((c) => ({ ...c, start_date: e.target.value }))} />
              <Input label="Fim" type="date" value={f.end_date} onChange={(e) => setF((c) => ({ ...c, end_date: e.target.value }))} />
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}
