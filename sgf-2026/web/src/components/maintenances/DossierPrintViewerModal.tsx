import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Download, Printer, Loader2, FileText, X } from '@/components/sgf/icons';
import type { DossierResult } from '@/lib/pdfDossierBuilder';

interface DossierPrintViewerModalProps {
    orderId: string | null;
    onClose: () => void;
}

export function DossierPrintViewerModal({ orderId, onClose }: DossierPrintViewerModalProps) {
    const [loading, setLoading] = useState(false);
    const [dossier, setDossier] = useState<DossierResult | null>(null);

    useEffect(() => {
        if (!orderId) {
            setDossier(null);
            return;
        }

        let isMounted = true;
        let generatedUrl: string | null = null;
        setLoading(true);

        import('@/lib/pdfDossierBuilder')
            .then(({ generateServiceOrderDossier }) => generateServiceOrderDossier(orderId))
            .then((result) => {
                generatedUrl = result.url;
                if (isMounted) {
                    setDossier(result);
                    setLoading(false);
                }
            })
            .catch((err) => {
                console.error('Erro ao gerar dossiê:', err);
                if (isMounted) {
                    toast.error(err instanceof Error ? err.message : 'Erro ao compilar o PDF do processo.');
                    setLoading(false);
                    onClose();
                }
            });

        return () => {
            isMounted = false;
            if (generatedUrl?.startsWith('blob:')) URL.revokeObjectURL(generatedUrl);
        };
    }, [orderId]);

    const handleDownload = () => {
        if (!dossier) return;
        const a = document.createElement('a');
        a.href = dossier.url;
        a.download = dossier.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`Download iniciado: ${dossier.filename}`);
    };

    const handlePrint = () => {
        if (!dossier) return;
        const win = window.open(dossier.url, '_blank');
        if (win) {
            win.focus();
            setTimeout(() => {
                win.print();
            }, 500);
        } else {
            toast.error('O navegador bloqueou a abertura da janela de impressão.');
        }
    };

    if (!orderId) return null;

    return (
        <Modal isOpen={Boolean(orderId)} onClose={onClose} size="full">
            <div className="flex h-[85vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                {/* Cabeçalho */}
                <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 shadow-xs">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Prestação de contas</p>
                            <h2 className="mt-1 text-lg font-bold leading-tight text-slate-950">
                                {dossier ? `Dossiê do Processo (${dossier.protocolNumber})` : 'Compilando Dossiê em PDF...'}
                            </h2>
                            <p className="mt-1 truncate text-sm text-slate-500">
                                {dossier ? dossier.filename : 'Reunindo espelho da O.S., orçamentos, empenhos, NFs e fotos em 1 único arquivo'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
                        {dossier && (
                            <>
                                <SGFButton
                                    variant="outline"
                                    onClick={handleDownload}
                                    icon={Download}
                                >
                                    Salvar PDF
                                </SGFButton>
                                <SGFButton
                                    variant="primary"
                                    onClick={handlePrint}
                                    icon={Printer}
                                    className="font-semibold"
                                >
                                    Imprimir
                                </SGFButton>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Fechar dossiê"
                            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Corpo de Visualização */}
                <div className="relative flex-1 bg-slate-100 p-3 sm:p-5">
                    {loading ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-600">
                            <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                            <div className="text-center">
                                <p className="text-base font-semibold text-slate-800">Compilando documento único do processo...</p>
                                <p className="mt-1 text-sm text-slate-500">Aguarde enquanto mesclamos os PDFs e fotos anexados.</p>
                            </div>
                        </div>
                    ) : dossier ? (
                        <iframe
                            src={dossier.url}
                            className="h-full w-full rounded-xl border border-slate-200 shadow-sm"
                            title={`Dossiê O.S. ${dossier.protocolNumber}`}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-slate-500">
                            Não foi possível carregar a pré-visualização do PDF.
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
