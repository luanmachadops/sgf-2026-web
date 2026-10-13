import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { VehicleCell } from '@/components/sgf/EntityCells';
import { StyledQr } from '@/components/qr/StyledQr';
import { Toggle } from '@/components/settings/SettingsToggle';
import { Download, Loader2, Printer, Search } from '@/components/sgf/icons';
import { vehiclesApi, departmentsApi } from '@/lib/supabase-api';
import { downloadBlob, openPendingPdfTab, showPdfInTab } from '@/lib/reports/reportPdfBrowser';
import type { QrLabelImage, QrLabelItem, QrLabelSheet, QrLabelSheetOptions } from '@/lib/qrLabelsPdf';
import { APPLE_ICON, APP_LOGO_ICON, GOOGLE_PLAY_ICON, type LabelIcon } from '@/lib/labelIcons';
import { createVehicleQr } from '@/lib/vehicleQr';
import { useBranding } from '@/contexts/BrandingContext';
import { cn, formatPlate, matchesSearch } from '@/lib/utils';

interface QrLabelGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
}

// Tamanhos prontos (largura × altura, mm). O QR ocupa o maior espaço que sobra.
const LABEL_PRESETS: { value: string; label: string; w: number; h: number }[] = [
    { value: '50x70', label: 'Pequena — 5 × 7 cm', w: 50, h: 70 },
    { value: '60x85', label: 'Média — 6 × 8,5 cm', w: 60, h: 85 },
    { value: '75x105', label: 'Grande — 7,5 × 10,5 cm', w: 75, h: 105 },
    { value: '100x150', label: 'Extra grande — 10 × 15 cm', w: 100, h: 150 },
    { value: 'custom', label: 'Personalizado (mm ou cm)', w: 0, h: 0 },
];
const MIN_LABEL_MM = 25;
const MAX_LABEL_MM = 280;

const SHEET_OPTIONS: { value: QrLabelSheet; label: string }[] = [
    { value: 'A4', label: 'Folha A4 (210 × 297 mm)' },
    { value: 'letter', label: 'Folha Carta (216 × 279 mm)' },
    { value: 'A5', label: 'Folha A5 (148 × 210 mm)' },
    { value: 'label', label: 'Uma etiqueta por página (impressora de etiquetas)' },
];

const QR_STYLE_OPTIONS = [
    { value: 'styled', label: 'Original (degradê arredondado)' },
    { value: 'plain', label: 'Preto sólido (impressora P&B)' },
];

/** Converte o valor digitado (mm ou cm, vírgula ou ponto) para mm dentro dos limites. */
function toMm(value: string, unit: 'mm' | 'cm'): number {
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return MIN_LABEL_MM;
    return Math.min(MAX_LABEL_MM, Math.max(MIN_LABEL_MM, unit === 'cm' ? n * 10 : n));
}

const fmtMm = (mm: number) => `${(Math.round(mm * 10) / 10).toLocaleString('pt-BR')} mm`;

/** PNG do QR no design original (qr-code-styling), em ~300 dpi para o tamanho impresso. */
async function renderQrPng(plate: string, qrMm: number): Promise<QrLabelImage | null> {
    const px = Math.round(Math.min(2000, Math.max(600, (qrMm / 25.4) * 300)));
    const blob = await createVehicleQr(plate, px, 'canvas').getRawData('png');
    if (!blob || !(blob instanceof Blob)) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'png' };
}

function IconSvg({ icon, size }: { icon: LabelIcon; size: number }) {
    const offset = icon.offset ?? { x: 0, y: 0, scale: 1 };
    return (
        <svg viewBox={`0 0 ${icon.box} ${icon.box}`} width={size} height={size} aria-hidden="true" className="shrink-0">
            {icon.background && <rect width={icon.box} height={icon.box} rx={icon.background.radius} fill={icon.background.fill} />}
            <g transform={`translate(${offset.x} ${offset.y}) scale(${offset.scale})`}>
                {icon.paths.map((path, index) => <path key={index} d={path.d} fill={path.fill} />)}
            </g>
        </svg>
    );
}

type VehicleRow = Awaited<ReturnType<typeof vehiclesApi.getAll>>[number];
type Layout = ReturnType<typeof import('@/lib/qrLabelsPdf').qrLabelLayout>;

/** Prévia de uma etiqueta com as mesmas medidas do PDF, desenhada em mm × escala. */
function LabelPreview({ layout, pxPerMm, plate, lines, header, appPromo, qrStyle, border }: {
    layout: Layout;
    pxPerMm: number;
    plate: string;
    lines: string[];
    header: string;
    appPromo: boolean;
    qrStyle: 'styled' | 'plain';
    border: boolean;
}) {
    const pt = (size: number) => size * (25.4 / 72) * pxPerMm;
    const icon = layout.iconMm * pxPerMm;
    return (
        <div
            className={cn('relative shrink-0 bg-white font-[Helvetica,Arial,sans-serif] shadow-sm', border ? 'border border-slate-300' : 'border border-dashed border-slate-200')}
            style={{ width: layout.width * pxPerMm, height: layout.height * pxPerMm, borderRadius: 3 * pxPerMm }}
        >
            <div className="absolute inset-x-0 flex flex-col items-center text-center" style={{ top: layout.padding * pxPerMm, paddingInline: layout.padding * pxPerMm }}>
                {header && (
                    <p className="w-full truncate font-bold uppercase text-[#0F2B2F]" style={{ fontSize: pt(layout.fonts.name), lineHeight: 1.25 }}>{header}</p>
                )}
                {appPromo && (
                    <>
                        <p className="text-[#64748B]" style={{ fontSize: pt(layout.fonts.promo), lineHeight: 1.3, marginTop: header ? layout.gap * 0.6 * pxPerMm : 0 }}>
                            Baixe o app do motorista:
                        </p>
                        <div className="flex items-center" style={{ gap: icon * 0.3, marginTop: layout.gap * 0.4 * pxPerMm, height: icon }}>
                            <IconSvg icon={APP_LOGO_ICON} size={icon} />
                            <span className="whitespace-nowrap font-bold text-[#0F2B2F]" style={{ fontSize: pt(layout.fonts.promo * 1.1), marginRight: icon * 0.3 }}>Exattus Rotta</span>
                            <IconSvg icon={GOOGLE_PLAY_ICON} size={icon * 0.8} />
                            <IconSvg icon={APPLE_ICON} size={icon * 0.8} />
                        </div>
                    </>
                )}
            </div>
            <div className="absolute" style={{ left: layout.qrLeft * pxPerMm, top: layout.qrTop * pxPerMm, width: layout.qr * pxPerMm, height: layout.qr * pxPerMm }}>
                {qrStyle === 'styled'
                    ? <StyledQr value={plate.replace(/[^A-Za-z0-9]/g, '')} size={Math.max(8, Math.round(layout.qr * pxPerMm))} />
                    : <PlainQrPreview value={plate.replace(/[^A-Za-z0-9]/g, '')} size={layout.qr * pxPerMm} />}
            </div>
            <div className="absolute inset-x-0 flex flex-col items-center text-center" style={{ top: layout.footerTop * pxPerMm, paddingInline: layout.padding * pxPerMm }}>
                {layout.showPlate && (
                    <p className={cn('font-bold', qrStyle === 'plain' ? 'text-black' : 'text-[#0F2B2F]')} style={{ fontSize: pt(layout.fonts.plate), lineHeight: 1.1, marginBottom: layout.gap * 0.5 * pxPerMm }}>{plate}</p>
                )}
                {lines.map((line) => (
                    <p key={line} className="w-full truncate text-[#64748B]" style={{ fontSize: pt(layout.fonts.caption), lineHeight: 1.3 }}>{line}</p>
                ))}
            </div>
        </div>
    );
}

/** QR preto chapado para a prévia (mesma matriz do PDF). */
function PlainQrPreview({ value, size }: { value: string; size: number }) {
    const { data: matrix } = useQuery({
        queryKey: ['plain-qr-matrix', value],
        queryFn: async () => (await import('@/lib/qrLabelsPdf')).qrMatrix(value.toUpperCase(), 'H'),
        staleTime: Infinity,
    });
    if (!matrix) return null;
    const count = matrix.length + 8;
    return (
        <svg viewBox={`0 0 ${count} ${count}`} width={size} height={size} shapeRendering="crispEdges" aria-label={`QR ${value}`}>
            <rect width={count} height={count} fill="#fff" />
            {matrix.flatMap((row, r) => row.map((dark, c) => (dark ? <rect key={`${r}-${c}`} x={c + 4} y={r + 4} width={1} height={1} fill="#000" /> : null)))}
        </svg>
    );
}

export function QrLabelGenerator({ isOpen, onClose }: QrLabelGeneratorProps) {
    const { branding } = useBranding();
    const [departmentId, setDepartmentId] = useState('');
    const [vehicleType, setVehicleType] = useState('');
    const [search, setSearch] = useState('');
    const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
    const [preset, setPreset] = useState('60x85');
    const [unit, setUnit] = useState<'mm' | 'cm'>('cm');
    const [customW, setCustomW] = useState('6');
    const [customH, setCustomH] = useState('8,5');
    const [sheet, setSheet] = useState<QrLabelSheet>('A4');
    const [qrStyle, setQrStyle] = useState<'styled' | 'plain'>('styled');
    const [showPlate, setShowPlate] = useState(true);
    const [showModel, setShowModel] = useState(true);
    const [showDepartment, setShowDepartment] = useState(true);
    const [showUnitCode, setShowUnitCode] = useState(false);
    const [showHeader, setShowHeader] = useState(true);
    const [appPromo, setAppPromo] = useState(true);
    const [border, setBorder] = useState(true);
    const [copies, setCopies] = useState('1');
    const [skip, setSkip] = useState('0');
    const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
    const [progress, setProgress] = useState('');

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
    const { data: pdfLib } = useQuery({
        queryKey: ['qr-labels-lib'],
        queryFn: () => import('@/lib/qrLabelsPdf'),
        enabled: isOpen,
        staleTime: Infinity,
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

    const presetDef = LABEL_PRESETS.find((p) => p.value === preset);
    const labelW = preset === 'custom' ? toMm(customW, unit) : presetDef?.w ?? 60;
    const labelH = preset === 'custom' ? toMm(customH, unit) : presetDef?.h ?? 85;
    const copyCount = Math.min(20, Math.max(1, Math.floor(Number(copies) || 1)));
    const header = showHeader ? branding.name || 'Prefeitura Municipal' : '';

    const linesFor = (v: VehicleRow): string[] => [
        showModel ? [v.brand, v.model].filter(Boolean).join(' ') : '',
        showDepartment ? v.departments?.name ?? '' : '',
        showUnitCode && v.unit_code ? `Prefixo ${v.unit_code}` : '',
    ].filter(Boolean);
    const lineCount = Math.max(0, ...selected.map((v) => linesFor(v).length));

    const baseOptions: Omit<QrLabelSheetOptions, 'items'> = {
        labelWidthMm: labelW,
        labelHeightMm: labelH,
        sheet,
        qrStyle,
        border,
        header: header || undefined,
        appPromo,
        appName: 'Exattus Rotta',
        showPlate,
        skip: sheet === 'label' ? 0 : Math.max(0, Math.floor(Number(skip) || 0)),
        title: 'Etiquetas QR — Frota',
    };
    const metrics = pdfLib?.qrLabelMetrics({ ...baseOptions, lineCount });
    const layout = metrics?.layout;
    const totalLabels = selected.length * copyCount;
    const perPage = metrics?.perPage ?? 1;
    const pages = totalLabels === 0 ? 0 : Math.ceil((totalLabels + (baseOptions.skip ?? 0)) / perPage);
    const canPrint = totalLabels > 0 && Boolean(metrics?.fitsSheet);

    // Escala da prévia: cabe em ~320 × 440 px, nunca acima do tamanho real (≈3,78 px/mm).
    const pxPerMm = layout ? Math.min(3.78, 320 / layout.width, 400 / layout.height) : 3;
    const sample = selected[0] ?? filtered[0];

    // Prévia da folha: a 1ª página montada, com as posições puladas em branco.
    const [previewMode, setPreviewMode] = useState<'sheet' | 'label'>('sheet');
    const showSheet = previewMode === 'sheet' && sheet !== 'label';
    const PT_TO_MM = 25.4 / 72;
    const pageWmm = metrics ? metrics.pageWidth * PT_TO_MM : 210;
    const pageHmm = metrics ? metrics.pageHeight * PT_TO_MM : 297;
    const sheetPxPerMm = Math.min(320 / pageWmm, 400 / pageHmm);
    const skipCount = Math.min(baseOptions.skip ?? 0, Math.max(0, perPage - 1));
    const firstPage = useMemo(() => {
        if (!metrics) return [];
        const vehiclesOnPage = selected.flatMap((v) => Array.from({ length: copyCount }, () => v));
        return Array.from({ length: metrics.perPage }, (_, slot) => (slot < skipCount ? null : vehiclesOnPage[slot - skipCount] ?? undefined));
    }, [metrics, selected, copyCount, skipCount]);

    useEffect(() => {
        if (!isOpen) setProgress('');
    }, [isOpen]);

    const generate = async (mode: 'pdf' | 'print') => {
        if (!pdfLib || !layout || !canPrint) return;
        // A aba de impressão precisa abrir no clique, antes do await, para não ser bloqueada.
        const tab = mode === 'print' ? openPendingPdfTab() : null;
        setBusy(mode);
        try {
            const items: QrLabelItem[] = selected.flatMap((v) => Array.from({ length: copyCount }, () => ({
                data: v.plate as string,
                plate: formatPlate(v.plate as string),
                lines: linesFor(v),
            })));
            const qrImages: Record<string, QrLabelImage> = {};
            if (qrStyle === 'styled') {
                const plates = [...new Set(selected.map((v) => v.plate as string))];
                for (let i = 0; i < plates.length; i += 8) {
                    setProgress(`Desenhando QR ${Math.min(i + 8, plates.length)} de ${plates.length}…`);
                    const batch = plates.slice(i, i + 8);
                    const images = await Promise.all(batch.map((plate) => renderQrPng(plate, layout.qr)));
                    batch.forEach((plate, index) => {
                        const image = images[index];
                        if (image) qrImages[plate] = image;
                    });
                }
            }
            setProgress('Montando o PDF…');
            const bytes = await pdfLib.buildQrLabelsPdf({ ...baseOptions, items, qrImages });
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
            setProgress('');
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

    const changeUnit = (next: 'mm' | 'cm') => {
        if (next === unit) return;
        const convert = (value: string) => {
            const mm = toMm(value, unit);
            const out = next === 'cm' ? mm / 10 : mm;
            return String(Math.round(out * 10) / 10).replace('.', ',');
        };
        setCustomW(convert(customW));
        setCustomH(convert(customH));
        setUnit(next);
    };

    const sectionTitle = 'mb-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400';
    const fieldLabel = 'mb-1 block text-xs font-semibold text-slate-500';
    const textInput = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[var(--sgf-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--sgf-primary)]/10';
    const check = (label: string, checked: boolean, onChange: (value: boolean) => void, hint?: string) => (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
            <span className="min-w-0">
                <span className="block font-medium">{label}</span>
                {hint && <span className="block text-xs text-slate-400">{hint}</span>}
            </span>
            <Toggle checked={checked} onChange={onChange} />
        </div>
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
                        {progress || (
                            <>
                                {totalLabels} etiqueta{totalLabels === 1 ? '' : 's'}
                                {pages > 0 && (sheet === 'label'
                                    ? ` · ${pages} página${pages === 1 ? '' : 's'}`
                                    : ` · ${perPage} por folha · ${pages} folha${pages === 1 ? '' : 's'}`)}
                            </>
                        )}
                    </span>
                    <SGFButton variant="ghost" onClick={onClose} disabled={busy !== null}>Fechar</SGFButton>
                    <SGFButton variant="secondary" icon={busy === 'pdf' ? Loader2 : Download} onClick={() => void generate('pdf')} disabled={busy !== null || !canPrint}>
                        Baixar PDF
                    </SGFButton>
                    <SGFButton icon={busy === 'print' ? Loader2 : Printer} onClick={() => void generate('print')} disabled={busy !== null || !canPrint}>
                        Imprimir
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1fr)]">
                {/* Veículos */}
                <section>
                    <p className={sectionTitle}>Veículos</p>
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                            <SGFSelect label="Secretaria" options={departmentOptions} value={departmentId} onChange={setDepartmentId} fullWidth searchable={departmentOptions.length > 10} />
                            <SGFSelect label="Tipo de veículo" options={typeOptions} value={vehicleType} onChange={setVehicleType} fullWidth />
                        </div>
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
                        <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                            {filtered.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">Nenhum veículo com placa para os filtros.</li>}
                            {filtered.map((v) => (
                                <li key={v.id}>
                                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                                        <input type="checkbox" checked={!excluded.has(v.id)} onChange={() => toggleVehicle(v.id)} className="h-4 w-4 shrink-0 accent-[var(--sgf-primary)]" />
                                        <VehicleCell plate={v.plate} name={[v.brand, v.model].filter(Boolean).join(' ')} photoUrl={v.photo_url} />
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
                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-500">Medidas da etiqueta</span>
                                        <div className="flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Unidade">
                                            {(['mm', 'cm'] as const).map((value) => (
                                                <button key={value} type="button" role="radio" aria-checked={unit === value} onClick={() => changeUnit(value)}
                                                    className={cn('rounded-full px-3 py-1', unit === value ? 'bg-[var(--sgf-dark)] text-white' : 'text-slate-500')}>
                                                    {value}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={fieldLabel} htmlFor="qr-label-w">Largura ({unit})</label>
                                            <input id="qr-label-w" inputMode="decimal" value={customW} onChange={(e) => setCustomW(e.target.value)} className={textInput} />
                                        </div>
                                        <div>
                                            <label className={fieldLabel} htmlFor="qr-label-h">Altura ({unit})</label>
                                            <input id="qr-label-h" inputMode="decimal" value={customH} onChange={(e) => setCustomH(e.target.value)} className={textInput} />
                                        </div>
                                    </div>
                                    <p className="mt-2 text-xs text-slate-400">
                                        De {unit === 'cm' ? `${MIN_LABEL_MM / 10} a ${MAX_LABEL_MM / 10} cm` : `${MIN_LABEL_MM} a ${MAX_LABEL_MM} mm`}.
                                    </p>
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
                            {layout && (
                                <p className="text-xs text-slate-500">
                                    Etiqueta {fmtMm(layout.width)} × {fmtMm(layout.height)} · QR de {fmtMm(Math.max(0, layout.qr))}.
                                    {sheet === 'label' ? ' Cada etiqueta sai numa página do próprio tamanho.' : ' Imprima em escala 100% (tamanho real).'}
                                </p>
                            )}
                            {metrics && !metrics.fitsSheet && (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    {!metrics.layout.fits
                                        ? 'A etiqueta ficou pequena demais para o QR com esse conteúdo. Aumente a etiqueta ou desligue algum texto.'
                                        : 'A etiqueta não cabe nesse papel. Diminua o tamanho ou escolha outro papel.'}
                                </p>
                            )}
                        </div>
                    </div>
                    <div>
                        <p className={sectionTitle}>Conteúdo e estilo</p>
                        <div className="space-y-2">
                            <SGFSelect label="Estilo do QR" options={QR_STYLE_OPTIONS} value={qrStyle} onChange={(value) => setQrStyle(value === 'plain' ? 'plain' : 'styled')} fullWidth />
                            {check('Cabeçalho com a prefeitura', showHeader, setShowHeader, header || undefined)}
                            {check('Convite para o app do motorista', appPromo, setAppPromo, 'Logo do Exattus Rotta e lojas Google Play e App Store')}
                            {check('Placa', showPlate, setShowPlate)}
                            {check('Marca e modelo', showModel, setShowModel)}
                            {check('Secretaria', showDepartment, setShowDepartment)}
                            {check('Prefixo', showUnitCode, setShowUnitCode)}
                            {check('Contorno para recorte', border, setBorder)}
                        </div>
                    </div>
                </section>

                {/* Prévia: fica parada enquanto as opções rolam. */}
                <section className="flex flex-col lg:sticky lg:top-0 lg:self-start">
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Prévia</p>
                        {sheet !== 'label' && (
                            <div className="flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold" role="tablist" aria-label="Tipo de prévia">
                                {([['sheet', 'Folha'], ['label', 'Etiqueta']] as const).map(([value, label]) => (
                                    <button key={value} type="button" role="tab" aria-selected={previewMode === value} onClick={() => setPreviewMode(value)}
                                        className={cn('rounded-full px-3 py-1', previewMode === value ? 'bg-[var(--sgf-dark)] text-white' : 'text-slate-500')}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex min-h-[440px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-100 p-4">
                        {!layout || !sample ? (
                            <p className="px-6 text-center text-xs text-slate-400">Marque ao menos um veículo para ver a prévia.</p>
                        ) : showSheet && metrics ? (
                            <>
                                <div className="relative bg-white shadow-md" style={{ width: pageWmm * sheetPxPerMm, height: pageHmm * sheetPxPerMm }} aria-label="Prévia da 1ª folha">
                                    {metrics.fitsSheet && firstPage.map((vehicle, slot) => {
                                        const ptToPx = PT_TO_MM * sheetPxPerMm;
                                        const offsetX = (metrics.pageWidth - (metrics.columns * metrics.labelWidth + (metrics.columns - 1) * metrics.gap)) / 2;
                                        const left = (offsetX + (slot % metrics.columns) * (metrics.labelWidth + metrics.gap)) * ptToPx;
                                        const top = (metrics.margin + Math.floor(slot / metrics.columns) * (metrics.labelHeight + metrics.gap)) * ptToPx;
                                        return (
                                            <div key={slot} className="absolute" style={{ left, top }}>
                                                {vehicle ? (
                                                    <LabelPreview
                                                        layout={layout}
                                                        pxPerMm={sheetPxPerMm}
                                                        plate={formatPlate(vehicle.plate as string)}
                                                        lines={linesFor(vehicle)}
                                                        header={header}
                                                        appPromo={appPromo}
                                                        qrStyle={qrStyle}
                                                        border={border}
                                                    />
                                                ) : (
                                                    <div
                                                        className={cn('border border-dashed', vehicle === null ? 'border-slate-300 bg-slate-50' : 'border-slate-200')}
                                                        style={{ width: layout.width * sheetPxPerMm, height: layout.height * sheetPxPerMm, borderRadius: 3 * sheetPxPerMm }}
                                                        title={vehicle === null ? 'Posição pulada' : 'Posição livre'}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                    {!metrics.fitsSheet && (
                                        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-amber-700">
                                            A etiqueta não cabe nesse papel.
                                        </p>
                                    )}
                                </div>
                                <p className="text-center text-xs text-slate-500">
                                    1ª folha · {metrics.columns} × {metrics.rows} = {perPage} etiqueta{perPage === 1 ? '' : 's'} por folha
                                    {skipCount > 0 && ` · ${skipCount} ${skipCount === 1 ? 'posição pulada' : 'posições puladas'}`}
                                </p>
                            </>
                        ) : (
                            <>
                                <LabelPreview
                                    layout={layout}
                                    pxPerMm={pxPerMm}
                                    plate={formatPlate(sample.plate as string)}
                                    lines={linesFor(sample)}
                                    header={header}
                                    appPromo={appPromo}
                                    qrStyle={qrStyle}
                                    border={border}
                                />
                                <p className="text-center text-xs text-slate-500">
                                    {fmtMm(layout.width)} × {fmtMm(layout.height)}
                                    {pxPerMm < 3.78 ? ` · prévia em ${Math.round((pxPerMm / 3.78) * 100)}% do tamanho real` : ' · tamanho real aproximado'}
                                </p>
                            </>
                        )}
                    </div>
                </section>
            </div>
        </Modal>
    );
}

export default QrLabelGenerator;
