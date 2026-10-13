import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { StyledQr } from '@/components/qr/StyledQr';
import { Printer, Loader2 } from '@/components/sgf/icons';
import { vehiclesApi, departmentsApi } from '@/lib/supabase-api';
import { openPendingPdfTab, showPdfInTab } from '@/lib/reports/reportPdfBrowser';
import { formatPlate } from '@/lib/utils';

interface QrLabelGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
}

// Tamanhos de etiqueta (mm): largura do card e lado do QR.
// Tamanhos de etiqueta: largura do card e lado do QR (mm); textos em pt.
const LABEL_SIZES: Record<string, { label: string; w: number; qr: number; plate: number; caption: number }> = {
    small:  { label: 'Pequena (≈45mm)', w: 45, qr: 34, plate: 10, caption: 6.5 },
    medium: { label: 'Média (≈58mm)',   w: 58, qr: 46, plate: 12, caption: 7.5 },
    large:  { label: 'Grande (≈72mm)',  w: 72, qr: 58, plate: 14, caption: 9 },
};

const SHEET_SIZES: Record<'A4' | 'letter', { label: string }> = {
    A4:     { label: 'A4 (210 × 297 mm)' },
    letter: { label: 'Carta (216 × 279 mm)' },
};

export function QrLabelGenerator({ isOpen, onClose }: QrLabelGeneratorProps) {
    const [departmentId, setDepartmentId] = useState('');
    const [vehicleType, setVehicleType] = useState('');
    const [labelSize, setLabelSize] = useState('medium');
    const [sheet, setSheet] = useState<'A4' | 'letter'>('A4');
    const [generating, setGenerating] = useState(false);

    const { data: vehicles = [] } = useQuery({
        queryKey: ['vehicles', 'all-for-qr'],
        queryFn: () => vehiclesApi.getAll(),
        enabled: isOpen,
    });
    const { data: departments = [] } = useQuery({
        queryKey: ['departments', 'list-all'],
        queryFn: () => departmentsApi.getAll(),
        enabled: isOpen,
    });

    const departmentOptions = useMemo(
        () => [{ value: '', label: 'Todas as secretarias' }, ...departments.map((d) => ({ value: d.id, label: d.name }))],
        [departments],
    );
    const typeOptions = useMemo(() => {
        const types = Array.from(new Set(vehicles.map((v) => v.vehicle_type).filter(Boolean))) as string[];
        return [{ value: '', label: 'Todos os tipos' }, ...types.map((t) => ({ value: t, label: t }))];
    }, [vehicles]);

    const selected = useMemo(
        () => vehicles.filter((v) =>
            !!v.plate &&
            (!departmentId || v.department_id === departmentId) &&
            (!vehicleType || v.vehicle_type === vehicleType),
        ),
        [vehicles, departmentId, vehicleType],
    );

    const handlePrint = async () => {
        if (selected.length === 0) return toast.error('Nenhum veículo com placa para os filtros escolhidos.');
        // A aba precisa abrir no clique, antes do await, para não ser bloqueada.
        const tab = openPendingPdfTab();
        setGenerating(true);
        try {
            const size = LABEL_SIZES[labelSize];
            const { buildQrLabelsPdf } = await import('@/lib/qrLabelsPdf');
            const bytes = await buildQrLabelsPdf({
                items: selected.map((v) => ({
                    data: v.plate as string,
                    plate: formatPlate(v.plate as string),
                    caption: [[v.brand, v.model].filter(Boolean).join(' '), v.departments?.name ?? ''].filter(Boolean).join(' • '),
                })),
                labelWidthMm: size.w,
                qrSizeMm: size.qr,
                plateSizePt: size.plate,
                captionSizePt: size.caption,
                sheet,
            });
            showPdfInTab(tab, new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'etiquetas-qr-frota.pdf');
        } catch (err) {
            tab?.close();
            toast.error((err as { message?: string })?.message ?? 'Falha ao gerar as etiquetas.');
        } finally {
            setGenerating(false);
        }
    };

    const previewPlate = selected[0]?.plate;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Gerador de etiquetas QR"
            description="Gere etiquetas com o QR Code (placa) dos veículos para imprimir e colar."
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose} disabled={generating}>Fechar</SGFButton>
                    <SGFButton icon={generating ? Loader2 : Printer} onClick={handlePrint} disabled={generating || selected.length === 0}>
                        {generating ? 'Gerando...' : `Imprimir ${selected.length} etiqueta${selected.length === 1 ? '' : 's'}`}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_220px]">
                {/* Controles */}
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SGFSelect label="Secretaria" options={departmentOptions} value={departmentId} onChange={setDepartmentId} fullWidth />
                        <SGFSelect label="Tipo de veículo" options={typeOptions} value={vehicleType} onChange={setVehicleType} fullWidth />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SGFSelect
                            label="Tamanho da etiqueta"
                            options={Object.entries(LABEL_SIZES).map(([value, s]) => ({ value, label: s.label }))}
                            value={labelSize}
                            onChange={setLabelSize}
                            fullWidth
                        />
                        <SGFSelect
                            label="Tamanho da folha"
                            options={Object.entries(SHEET_SIZES).map(([value, s]) => ({ value, label: s.label }))}
                            value={sheet}
                            onChange={(value) => setSheet(value === 'letter' ? 'letter' : 'A4')}
                            fullWidth
                        />
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
                        <strong>{selected.length}</strong> veículo{selected.length === 1 ? '' : 's'} com placa selecionado{selected.length === 1 ? '' : 's'}.
                        As etiquetas abrem numa nova aba como PDF vetorial (QR nítido em qualquer tamanho), pronto para imprimir ou salvar.
                    </div>
                </div>

                {/* Prévia da etiqueta */}
                <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Prévia</p>
                    {previewPlate ? (
                        <>
                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                <StyledQr value={previewPlate} size={150} />
                            </div>
                            <p className="mt-2 font-mono text-sm font-bold tracking-wide text-[#0F2B2F]">{formatPlate(previewPlate)}</p>
                        </>
                    ) : (
                        <p className="px-4 py-8 text-center text-xs text-slate-400">Sem veículos para os filtros.</p>
                    )}
                </div>
            </div>
        </Modal>
    );
}

export default QrLabelGenerator;
