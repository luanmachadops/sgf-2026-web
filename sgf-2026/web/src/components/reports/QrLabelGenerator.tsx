import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { StyledQr } from '@/components/qr/StyledQr';
import { Printer, Loader2 } from '@/components/sgf/icons';
import { vehiclesApi, departmentsApi } from '@/lib/supabase-api';
import { createVehicleQr } from '@/lib/vehicleQr';
import { formatPlate } from '@/lib/utils';

interface QrLabelGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
}

// Tamanhos de etiqueta (mm): largura do card e lado do QR.
const LABEL_SIZES: Record<string, { label: string; w: number; qr: number; plate: number; model: number }> = {
    small:  { label: 'Pequena (≈45mm)', w: 45, qr: 34, plate: 11, model: 9 },
    medium: { label: 'Média (≈58mm)',   w: 58, qr: 46, plate: 13, model: 10.5 },
    large:  { label: 'Grande (≈72mm)',  w: 72, qr: 58, plate: 16, model: 13 },
};

const SHEET_SIZES: Record<string, { label: string; css: string }> = {
    A4:     { label: 'A4 (210 × 297 mm)', css: 'A4' },
    letter: { label: 'Carta (216 × 279 mm)', css: 'letter' },
};

async function qrPngDataUrl(plate: string): Promise<string> {
    const qr = createVehicleQr(plate, 420, 'canvas');
    const blob = await qr.getRawData('png');
    if (!blob) return '';
    return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob as Blob);
    });
}

export function QrLabelGenerator({ isOpen, onClose }: QrLabelGeneratorProps) {
    const [departmentId, setDepartmentId] = useState('');
    const [vehicleType, setVehicleType] = useState('');
    const [labelSize, setLabelSize] = useState('medium');
    const [sheet, setSheet] = useState('A4');
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
        setGenerating(true);
        try {
            const size = LABEL_SIZES[labelSize];
            const sheetCss = SHEET_SIZES[sheet].css;

            // Gera o PNG de cada QR (independentes, sem conflito de ids).
            const items = await Promise.all(
                selected.map(async (v) => ({
                    plate: formatPlate(v.plate as string),
                    model: [v.brand, v.model].filter(Boolean).join(' '),
                    dept: v.departments?.name ?? '',
                    img: await qrPngDataUrl(v.plate as string),
                })),
            );

            const labelsHtml = items.map((it) => `
                <div class="label">
                  <img src="${it.img}" alt="QR ${it.plate}" />
                  <div class="plate">${it.plate}</div>
                  <div class="model">${it.model}${it.dept ? ' • ' + it.dept : ''}</div>
                </div>`).join('');

            const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
              <title>Etiquetas QR — Frota</title>
              <style>
                @page { size: ${sheetCss}; margin: 8mm; }
                * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
                body { font-family: Inter, system-ui, -apple-system, sans-serif; background:#fff; padding:6mm; }
                .sheet { display:flex; flex-wrap:wrap; gap:4mm; align-content:flex-start; }
                .label { width:${size.w}mm; border:1px solid #cbd5e1; border-radius:10px; padding:3mm 2mm; display:flex; flex-direction:column; align-items:center; gap:1.5mm; break-inside:avoid; }
                .label img { width:${size.qr}mm; height:${size.qr}mm; display:block; }
                .plate { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight:800; font-size:${size.plate}px; letter-spacing:1px; color:#0F2B2F; }
                .model { font-size:${size.model}px; color:#64748b; text-align:center; line-height:1.2; }
                @media print { .no-print { display:none } }
              </style></head>
              <body>
                <div class="sheet">${labelsHtml}</div>
                <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };</script>
              </body></html>`;

            const win = window.open('', '_blank');
            if (!win) {
                toast.error('Permita pop-ups para abrir a folha de impressão.');
                return;
            }
            win.document.open();
            win.document.write(html);
            win.document.close();
        } catch (err) {
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
                            onChange={setSheet}
                            fullWidth
                        />
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
                        <strong>{selected.length}</strong> veículo{selected.length === 1 ? '' : 's'} com placa selecionado{selected.length === 1 ? '' : 's'}.
                        A impressão abre numa nova aba — use <strong>Salvar como PDF</strong> ou envie para a impressora.
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
