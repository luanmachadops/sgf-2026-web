import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Toggle } from '@/components/settings/SettingsToggle';
import { Download, Loader2, Printer, Search } from '@/components/sgf/icons';
import { vehiclesApi, departmentsApi } from '@/lib/supabase-api';
import { downloadBlob, openPendingPdfTab, showPdfInTab } from '@/lib/reports/reportPdfBrowser';
import type { QrLabelItem, QrLabelSheet, QrLabelSheetOptions } from '@/lib/qrLabelsPdf';
import { useBranding } from '@/contexts/BrandingContext';
import { cn, formatPlate, matchesSearch } from '@/lib/utils';

interface QrLabelGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
}

// Tamanhos prontos: lado do QR (mm). Largura da etiqueta e fontes derivam dele.
const LABEL_PRESETS: { value: string; label: string; qr: number }[] = [
    { value: 'small', label: 'Pequena — QR 30 mm', qr: 30 },
    { value: 'medium', label: 'Média — QR 45 mm', qr: 45 },
    { value: 'large', label: 'Grande — QR 60 mm', qr: 60 },
    { value: 'xlarge', label: 'Extra grande — QR 90 mm', qr: 90 },
    { value: 'custom', label: 'Personalizado', qr: 0 },
];
const MIN_QR_MM = 20;
const MAX_QR_MM = 180;

const SHEET_OPTIONS: { value: QrLabelSheet; label: string }[] = [
    { value: 'A4', label: 'Folha A4 (210 × 297 mm)' },
    { value: 'letter', label: 'Folha Carta (216 × 279 mm)' },
    { value: 'A5', label: 'Folha A5 (148 × 210 mm)' },
    { value: 'label', label: 'Uma etiqueta por página (impressora de etiquetas)' },
];

const QR_STYLE_OPTIONS = [
    { value: 'styled', label: 'Colorido (degradê da marca)' },
    { value: 'plain', label: 'Escuro sólido (impressora P&B)' },
];

/** Fontes proporcionais ao QR, com limites para continuarem legíveis. */
function sizesFor(qrMm: number) {
    return {
        labelWidthMm: qrMm + 12,
        plateSizePt: Math.min(28, Math.max(9, qrMm * 0.26)),
        captionSizePt: Math.min(14, Math.max(6, qrMm * 0.16)),
    };
}

type VehicleRow = Awaited<ReturnType<typeof vehiclesApi.getAll>>[number];

export function QrLabelGenerator({ isOpen, onClose }: QrLabelGeneratorProps) {
    const { branding } = useBranding();
    const [departmentId, setDepartmentId] = useState('');
    const [vehicleType, setVehicleType] = useState('');
    const [search, setSearch] = useState('');
    const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
    const [preset, setPreset] = useState('medium');
    const [customQr, setCustomQr] = useState('45');
    const [sheet, setSheet] = useState<QrLabelSheet>('A4');
    const [qrStyle, setQrStyle] = useState<'styled' | 'plain'>('styled');
    const [showPlate, setShowPlate] = useState(true);
    const [showModel, setShowModel] = useState(true);
    const [showDepartment, setShowDepartment] = useState(true);
    const [showUnitCode, setShowUnitCode] = useState(false);
    const [showHeader, setShowHeader] = useState(false);
    const [headerText, setHeaderText] = useState('');
    const [border, setBorder] = useState(true);
    const [copies, setCopies] = useState('1');
    const [skip, setSkip] = useState('0');
    const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);

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
        return [{ value: '', label: 'Todos os tipos' }, ...types.sort().map((t) => ({ value: t, label: t }))];
    }, [vehicles]);

    // Veículos que passam nos filtros; a marcação individual decide quais saem.
    const filtered = useMemo(
        () => vehicles
            .filter((v) =>
                !!v.plate
                && (!departmentId || v.department_id === departmentId)
                && (!vehicleType || v.vehicle_type === vehicleType)
                && matchesSearch(search, v.plate, v.brand, v.model, v.unit_code))
            .sort((a, b) => String(a.plate).localeCompare(String(b.plate), 'pt-BR')),
        [vehicles, departmentId, vehicleType, search],
    );
    const selected = useMemo(() => filtered.filter((v) => !excluded.has(v.id)), [filtered, excluded]);

    const qrMm = preset === 'custom'
        ? Math.min(MAX_QR_MM, Math.max(MIN_QR_MM, Number(customQr) || MIN_QR_MM))
        : LABEL_PRESETS.find((p) => p.value === preset)?.qr ?? 45;
    const copyCount = Math.min(20, Math.max(1, Math.floor(Number(copies) || 1)));
    const header = showHeader ? (headerText.trim() || branding.name || '') : '';

    const lineFor = (v: VehicleRow): string[] => [
        showModel ? [v.brand, v.model].filter(Boolean).join(' ') : '',
        showDepartment ? v.departments?.name ?? '' : '',
        showUnitCode && v.unit_code ? `Prefixo ${v.unit_code}` : '',
    ].filter(Boolean);

    const items: QrLabelItem[] = useMemo(
        () => selected.flatMap((v) => Array.from({ length: copyCount }, () => ({
            data: v.plate as string,
            plate: formatPlate(v.plate as string),
            lines: lineFor(v),
        }))),
        // lineFor depende só dos toggles listados abaixo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [selected, copyCount, showModel, showDepartment, showUnitCode],
    );

    const baseOptions: Omit<QrLabelSheetOptions, 'items'> = useMemo(() => ({
        ...sizesFor(qrMm),
        qrSizeMm: qrMm,
        sheet,
        qrStyle,
        border,
        header: header || undefined,
        showPlate,
        skip: sheet === 'label' ? 0 : Math.max(0, Math.floor(Number(skip) || 0)),
        title: 'Etiquetas QR — Frota',
    }), [qrMm, sheet, qrStyle, border, header, showPlate, skip]);

    // Contagem de etiquetas por folha (mesma conta do PDF).
    const { data: metrics } = useQuery({
        queryKey: ['qr-label-metrics', baseOptions, items.length > 0 ? Math.max(...items.map((i) => i.lines?.length ?? 0)) : 0],
        queryFn: async () => {
            const { qrLabelMetrics } = await import('@/lib/qrLabelsPdf');
            return qrLabelMetrics({ ...baseOptions, lineCount: Math.max(0, ...items.map((i) => i.lines?.length ?? 0)) });
        },
        enabled: isOpen,
    });
    const perPage = metrics?.perPage ?? 1;
    const pages = items.length === 0 ? 0 : Math.ceil((items.length + (baseOptions.skip ?? 0)) / perPage);
    const fitsSheet = sheet === 'label' || (metrics ? metrics.labelWidth <= metrics.pageWidth - 2 * metrics.margin && metrics.labelHeight <= metrics.pageHeight - 2 * metrics.margin : true);

    // Prévia: a 1ª página do PDF real, gerada com atraso para não refazer a cada tecla.
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const previewRef = useRef<string | null>(null);
    useEffect(() => {
        if (!isOpen || items.length === 0) return;
        let cancelled = false;
        setPreviewLoading(true);
        const timer = window.setTimeout(async () => {
            try {
                const { buildQrLabelsPdf } = await import('@/lib/qrLabelsPdf');
                const firstPage = items.slice(0, Math.max(1, perPage - (baseOptions.skip ?? 0)));
                const bytes = await buildQrLabelsPdf({ ...baseOptions, items: firstPage });
                if (cancelled) return;
                const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
                if (previewRef.current) URL.revokeObjectURL(previewRef.current);
                previewRef.current = url;
                setPreviewUrl(url);
            } catch {
                if (!cancelled) setPreviewUrl(null);
            } finally {
                if (!cancelled) setPreviewLoading(false);
            }
        }, 500);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [isOpen, items, baseOptions, perPage]);
    useEffect(() => () => {
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    }, []);

    const generate = async (mode: 'pdf' | 'print') => {
        if (items.length === 0) {
            toast.error('Selecione ao menos um veículo com placa.');
            return;
        }
        // A aba de impressão precisa abrir no clique, antes do await, para não ser bloqueada.
        const tab = mode === 'print' ? openPendingPdfTab() : null;
        setBusy(mode);
        try {
            const { buildQrLabelsPdf } = await import('@/lib/qrLabelsPdf');
            const bytes = await buildQrLabelsPdf({ ...baseOptions, items });
            const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
            const fileName = `etiquetas-qr-${new Date().toISOString().slice(0, 10)}.pdf`;
            if (mode === 'pdf') {
                downloadBlob(blob, fileName);
                toast.success(`PDF com ${items.length} etiqueta${items.length === 1 ? '' : 's'} baixado.`);
            } else {
                showPdfInTab(tab, blob, fileName);
            }
        } catch (err) {
            tab?.close();
            toast.error((err as { message?: string })?.message ?? 'Falha ao gerar as etiquetas.');
        } finally {
            setBusy(null);
        }
    };

    const toggleVehicle = (id: string) => setExcluded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    const setAll = (include: boolean) => setExcluded((current) => {
        const next = new Set(current);
        filtered.forEach((v) => (include ? next.delete(v.id) : next.add(v.id)));
        return next;
    });

    const sectionTitle = 'mb-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400';
    const fieldLabel = 'mb-1 block text-xs font-semibold text-slate-500';
    const textInput = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[var(--sgf-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--sgf-primary)]/10';
    const check = (label: string, checked: boolean, onChange: (value: boolean) => void, disabled?: boolean) => (
        <label className={cn('flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700', disabled && 'opacity-50')}>
            <span className="font-medium">{label}</span>
            <Toggle checked={checked} onChange={onChange} disabled={disabled} />
        </label>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Etiquetas QR dos veículos"
            description="Escolha os veículos, o tamanho e o conteúdo; baixe o PDF ou imprima direto."
            size="full"
            footer={(
                <ModalFooter>
                    <span className="mr-auto text-sm text-slate-500">
                        {items.length} etiqueta{items.length === 1 ? '' : 's'}
                        {sheet !== 'label' && pages > 0 && ` · ${perPage} por folha · ${pages} folha${pages === 1 ? '' : 's'}`}
                        {sheet === 'label' && pages > 0 && ` · ${pages} página${pages === 1 ? '' : 's'}`}
                    </span>
                    <SGFButton variant="ghost" onClick={onClose} disabled={busy !== null}>Fechar</SGFButton>
                    <SGFButton variant="secondary" icon={busy === 'pdf' ? Loader2 : Download} onClick={() => void generate('pdf')} disabled={busy !== null || items.length === 0 || !fitsSheet}>
                        Baixar PDF
                    </SGFButton>
                    <SGFButton icon={busy === 'print' ? Loader2 : Printer} onClick={() => void generate('print')} disabled={busy !== null || items.length === 0 || !fitsSheet}>
                        Imprimir
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
                {/* Veículos */}
                <section>
                    <p className={sectionTitle}>Veículos</p>
                    <div className="space-y-3">
                        <SGFSelect label="Secretaria" options={departmentOptions} value={departmentId} onChange={setDepartmentId} fullWidth searchable={departmentOptions.length > 10} />
                        <SGFSelect label="Tipo de veículo" options={typeOptions} value={vehicleType} onChange={setVehicleType} fullWidth />
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar placa, modelo ou prefixo" className={cn(textInput, 'pl-9')} aria-label="Buscar veículo" />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">{selected.length} de {filtered.length} marcados</span>
                            <span className="flex gap-3">
                                <button type="button" onClick={() => setAll(true)} className="font-semibold text-[var(--sgf-primary)] hover:underline">Marcar todos</button>
                                <button type="button" onClick={() => setAll(false)} className="font-semibold text-slate-500 hover:underline">Desmarcar</button>
                            </span>
                        </div>
                        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                            {filtered.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">Nenhum veículo com placa para os filtros.</li>}
                            {filtered.map((v) => (
                                <li key={v.id}>
                                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                                        <input type="checkbox" checked={!excluded.has(v.id)} onChange={() => toggleVehicle(v.id)} className="h-4 w-4 accent-[var(--sgf-primary)]" />
                                        <span className="font-mono font-bold text-[var(--sgf-dark)]">{formatPlate(v.plate as string)}</span>
                                        <span className="truncate text-xs text-slate-500">{[v.brand, v.model].filter(Boolean).join(' ')}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* Etiqueta e impressão */}
                <section className="space-y-5">
                    <div>
                        <p className={sectionTitle}>Tamanho e impressão</p>
                        <div className="space-y-3">
                            <SGFSelect label="Tamanho da etiqueta" options={LABEL_PRESETS.map(({ value, label }) => ({ value, label }))} value={preset} onChange={setPreset} fullWidth />
                            {preset === 'custom' && (
                                <div>
                                    <label className={fieldLabel} htmlFor="qr-custom-size">Lado do QR (mm, de {MIN_QR_MM} a {MAX_QR_MM})</label>
                                    <input id="qr-custom-size" type="number" min={MIN_QR_MM} max={MAX_QR_MM} value={customQr} onChange={(e) => setCustomQr(e.target.value)} className={textInput} />
                                </div>
                            )}
                            <SGFSelect label="Papel da impressão" options={SHEET_OPTIONS} value={sheet} onChange={(value) => setSheet(value as QrLabelSheet)} fullWidth />
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={fieldLabel} htmlFor="qr-copies">Cópias por veículo</label>
                                    <input id="qr-copies" type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(e.target.value)} className={textInput} />
                                </div>
                                {sheet !== 'label' && (
                                    <div>
                                        <label className={fieldLabel} htmlFor="qr-skip">Pular posições</label>
                                        <input id="qr-skip" type="number" min={0} max={Math.max(0, perPage - 1)} value={skip} onChange={(e) => setSkip(e.target.value)} className={textInput} title="Para reaproveitar uma folha de etiquetas já usada em parte" />
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-slate-500">
                                Etiqueta de {Math.round(sizesFor(qrMm).labelWidthMm)} mm de largura.
                                {sheet === 'label' ? ' Cada etiqueta sai numa página do próprio tamanho.' : ' Imprima em escala 100% (tamanho real).'}
                            </p>
                            {!fitsSheet && (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    A etiqueta não cabe nesse papel. Diminua o tamanho ou escolha outro papel.
                                </p>
                            )}
                        </div>
                    </div>
                    <div>
                        <p className={sectionTitle}>Conteúdo e estilo</p>
                        <div className="space-y-2">
                            <SGFSelect label="Estilo do QR" options={QR_STYLE_OPTIONS} value={qrStyle} onChange={(value) => setQrStyle(value === 'plain' ? 'plain' : 'styled')} fullWidth />
                            {check('Placa', showPlate, setShowPlate)}
                            {check('Marca e modelo', showModel, setShowModel)}
                            {check('Secretaria', showDepartment, setShowDepartment)}
                            {check('Prefixo', showUnitCode, setShowUnitCode)}
                            {check('Contorno para recorte', border, setBorder)}
                            {check('Título no topo', showHeader, setShowHeader)}
                            {showHeader && (
                                <input type="text" value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder={branding.name || 'Prefeitura Municipal'} maxLength={60} className={textInput} aria-label="Título da etiqueta" />
                            )}
                        </div>
                    </div>
                </section>

                {/* Prévia */}
                <section className="flex min-h-[420px] flex-col">
                    <p className={sectionTitle}>Prévia da 1ª {sheet === 'label' ? 'etiqueta' : 'folha'}</p>
                    <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                        {previewUrl && items.length > 0 && (
                            <iframe title="Prévia das etiquetas" src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`} className="h-full min-h-[420px] w-full" />
                        )}
                        {(items.length === 0 || (!previewUrl && !previewLoading)) && (
                            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-slate-400">
                                {items.length === 0 ? 'Marque ao menos um veículo para ver a prévia.' : 'Prévia indisponível.'}
                            </p>
                        )}
                        {previewLoading && items.length > 0 && (
                            <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-500 shadow" role="status">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </Modal>
    );
}

export default QrLabelGenerator;
