import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { contractsApi, invoicesApi, INVOICE_DOC_KINDS, DOC_ACCEPT, type Invoice, type InvoiceDocKind, type InvoiceDocument } from '@/lib/api';
import { SGFButton } from '@/components/sgf';
import { FileText, Trash2, Upload } from '@/components/sgf/icons';

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const docKindLabel = (k: string) => INVOICE_DOC_KINDS.find((x) => x.value === k)?.label ?? 'Documento';

/** Seletor de tipo de documento em pílulas. */
export function DocKindPicker({ value, onChange }: { value: InvoiceDocKind; onChange: (k: InvoiceDocKind) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de documento">
      {INVOICE_DOC_KINDS.map((k) => (
        <button
          key={k.value}
          type="button"
          role="radio"
          aria-checked={value === k.value}
          onClick={() => onChange(k.value)}
          className={`h-8 rounded-full px-3 text-[13px] font-semibold transition ${
            value === k.value ? 'bg-[var(--rt-ink900)] text-white' : 'bg-[var(--rt-paper)] text-[var(--rt-ink700)] hover:bg-[var(--rt-paper2)]'
          }`}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}

/** Documentos da fatura: escolhe o tipo, envia, abre e retira. */
export function InvoiceDocuments({ invoice }: { invoice: Invoice }) {
  const qc = useQueryClient();
  const [docs, setDocs] = useState<InvoiceDocument[]>(invoicesApi.documents(invoice));
  const [kind, setKind] = useState<InvoiceDocKind>('empenho');
  useEffect(() => { setDocs(invoicesApi.documents(invoice)); }, [invoice]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['invoices'] });
  const upload = useMutation({
    mutationFn: (files: File[]) => invoicesApi.uploadDocuments({ ...invoice, documents: docs as never }, files, kind),
    onSuccess: (next) => { setDocs(next); toast.success('Documento enviado.'); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const unlink = useMutation({
    mutationFn: (path: string) => invoicesApi.unlinkDocument({ ...invoice, documents: docs as never }, path),
    onSuccess: (next) => { setDocs(next); toast.success('Documento retirado da fatura.'); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section>
      <h3 className="mb-3 text-[15px] font-semibold text-[var(--rt-ink900)]">
        Documentos <span className="text-[var(--rt-ink400)]">({docs.length})</span>
      </h3>
      <div className="space-y-3 rounded-[22px] border border-dashed border-[var(--rt-hairline)] p-3">
        <DocKindPicker value={kind} onChange={setKind} />
        <label className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-[var(--rt-paper)] p-3 transition hover:bg-[var(--rt-paper2)] ${upload.isPending ? 'pointer-events-none opacity-60' : ''}`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--rt-ink500)]"><Upload width={20} height={20} /></span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--rt-ink900)]">{upload.isPending ? 'Enviando…' : `Enviar ${docKindLabel(kind).toLowerCase()}`}</span>
            <span className="block text-xs text-[var(--rt-ink400)]">PDF, Word, Excel, XML ou imagem · até 20 MB</span>
          </span>
          <input type="file" multiple accept={DOC_ACCEPT} className="sr-only" onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) upload.mutate(files);
            e.currentTarget.value = '';
          }} />
        </label>
      </div>

      {docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {docs.map((d) => (
            <li key={d.path} className="flex items-center gap-3 rounded-2xl bg-[var(--rt-paper)] p-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--rt-ink500)]"><FileText width={20} height={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--rt-ink900)]">{d.name}</p>
                <p className="truncate text-xs text-[var(--rt-ink500)]">{docKindLabel(d.kind)} · {kb(d.size)}</p>
              </div>
              <SGFButton size="sm" variant="outline" onClick={() => contractsApi.openDocument(d).catch((e) => toast.error((e as Error).message))}>Abrir</SGFButton>
              <button type="button" aria-label={`Tirar ${d.name}`} onClick={() => unlink.mutate(d.path)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--rt-ink400)] transition hover:bg-white hover:text-[var(--rt-red600)]">
                <Trash2 width={16} height={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
