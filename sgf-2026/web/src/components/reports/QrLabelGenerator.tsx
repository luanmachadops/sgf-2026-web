import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import type { QrLabelFonts, QrLabelItem, QrLabelSheet, QrLabelSheetOptions } from '@/lib/qrLabelsPdf';
import { APPLE_ICON, APP_LOGO_ICON, GOOGLE_PLAY_ICON, type LabelIcon } from '@/lib/labelIcons';
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

/** Espaçamentos prontos: preenchem os ajustes finos, que continuam editáveis. */
const SPACING_PRESETS = {
    compact: { label: 'Compacto', spacing: 0.3, lineHeight: 1.1, align: 'grouped' as const, qrMargin: 0.02, side: 1.5 },
    normal: { label: 'Normal', spacing: 1, lineHeight: 1.25, align: 'grouped' as const, qrMargin: 0.05, side: undefined },
    wide: { label: 'Arejado', spacing: 1.8, lineHeight: 1.4, align: 'grouped' as const, qrMargin: 0.06, side: undefined },
};
type SpacingPreset = keyof typeof SPACING_PRESETS;

/** Margem branca do QR preto (em módulos) equivalente à fração usada no QR original. */
const quietModules = (ratio: number) => Math.max(1, Math.round(ratio * 60));

const DEFAULT_PROMO_TEXT = 'Baixe o app do motorista:';
const DEFAULT_APP_NAME = 'Exattus Rotta';

/** Como a etiqueta é desenhada (compartilhado pela prévia e pelo PDF). */
interface LabelLook {
    header: string;
    appPromo: boolean;
    promoText: string;
    appName: string;
    qrStyle: 'styled' | 'plain';
    border: boolean;
    /** Margem branca do QR em fração do lado. */
    qrMargin: number;
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
function LabelPreview({ layout, pxPerMm, plate, lines, look }: {
    layout: Layout;
    pxPerMm: number;
    plate: string;
    lines: string[];
    look: LabelLook;
}) {
    const pt = (size: number) => size * (25.4 / 72) * pxPerMm;
    const icon = layout.iconMm * pxPerMm;
    const line = (top: number | undefined, size: number, lh: number, className: string, text: string, key?: string) => (top === undefined ? null : (
        <p key={key} className={cn('absolute inset-x-0 truncate text-center', className)}
            style={{ top: top * pxPerMm, fontSize: pt(size), lineHeight: lh, paddingInline: layout.sidePadding * pxPerMm }}>
            {text}
        </p>
    ));
    const rawPlate = plate.replace(/[^A-Za-z0-9]/g, '');
    return (
        <div
            className={cn('relative shrink-0 overflow-hidden bg-white font-[Helvetica,Arial,sans-serif] shadow-sm', look.border ? 'border border-slate-300' : 'border border-dashed border-slate-200')}
            style={{ width: layout.width * pxPerMm, height: layout.height * pxPerMm, borderRadius: 3 * pxPerMm }}
        >
            {look.header && line(layout.nameTop, layout.fonts.name, layout.lineHeight, 'font-bold uppercase text-[#0F2B2F]', look.header)}
            {line(layout.promoTop, layout.fonts.promo, layout.lineHeight, 'text-[#64748B]', look.promoText)}
            {look.appPromo && layout.appTop !== undefined && (
                <div className="absolute inset-x-0 flex items-center justify-center" style={{ top: layout.appTop * pxPerMm, height: icon, gap: icon * 0.3 }}>
                    <IconSvg icon={APP_LOGO_ICON} size={icon} />
                    <span className="whitespace-nowrap font-bold text-[#0F2B2F]" style={{ fontSize: pt(layout.fonts.app), marginRight: icon * 0.3 }}>{look.appName}</span>
                    <IconSvg icon={GOOGLE_PLAY_ICON} size={icon * 0.8} />
                    <IconSvg icon={APPLE_ICON} size={icon * 0.8} />
                </div>
            )}
            <div className="absolute" style={{ left: layout.qrLeft * pxPerMm, top: layout.qrTop * pxPerMm, width: layout.qr * pxPerMm, height: layout.qr * pxPerMm }}>
                {look.qrStyle === 'styled'
                    ? <StyledQr value={rawPlate} size={Math.max(8, Math.round(layout.qr * pxPerMm))} marginRatio={look.qrMargin} />
                    : <PlainQrPreview value={rawPlate} size={layout.qr * pxPerMm} quiet={quietModules(look.qrMargin)} />}
            </div>
            {layout.showPlate && line(layout.plateTop, layout.fonts.plate, Math.max(1, layout.lineHeight * 0.9),
                cn('font-bold', look.qrStyle === 'plain' ? 'text-black' : 'text-[#0F2B2F]'), plate)}
            {lines.map((text, i) => line(layout.lineTops[i], layout.fonts.caption, layout.lineHeight, 'text-[#64748B]', text, `${i}-${text}`))}
        </div>
    );
}

/** QR preto chapado para a prévia (mesma matriz do PDF). */
function PlainQrPreview({ value, size, quiet = 4 }: { value: string; size: number; quiet?: number }) {
    const { data: matrix } = useQuery({
        queryKey: ['plain-qr-matrix', value],
        queryFn: async () => (await import('@/lib/qrLabelsPdf')).qrMatrix(value.toUpperCase(), 'H'),
        staleTime: Infinity,
    });
    if (!matrix) return null;
    const count = matrix.length + quiet * 2;
    return (
        <svg viewBox={`0 0 ${count} ${count}`} width={size} height={size} shapeRendering="crispEdges" aria-label={`QR ${value}`}>
            <rect width={count} height={count} fill="#fff" />
            {matrix.flatMap((row, r) => row.map((dark, c) => (dark ? <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1} height={1} fill="#000" /> : null)))}
        </svg>
    );
}

/** Tamanho de fonte (pt); vazio = automático (cinza). */
function SizeStepper({ label, value, auto, onChange }: {
    label: string;
    value: number | undefined;
    auto: number | undefined;
    onChange: (value: number | undefined) => void;
}) {
    const current = value ?? auto ?? 8;
    const step = (delta: number) => onChange(Math.min(40, Math.max(4, Math.round((current + delta) * 2) / 2)));
    return (
        <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-white" title={`${label}${value === undefined ? ' (automático)' : ''}`}>
            <button type="button" onClick={() => step(-0.5)} className="px-2 py-1 text-slate-500 hover:text-slate-900" aria-label={`Diminuir ${label}`}>−</button>
            <button type="button" onClick={() => value !== undefined && onChange(undefined)} disabled={value === undefined}
                className={cn('min-w-[50px] text-center text-xs font-semibold tabular-nums', value === undefined ? 'text-slate-400' : 'text-slate-800 hover:text-[var(--sgf-primary)]')}
                aria-label={value === undefined ? `${label}: automático` : `${label}: voltar ao automático`}>
                {current.toLocaleString('pt-BR')} pt
            </button>
            <button type="button" onClick={() => step(0.5)} className="px-2 py-1 text-slate-500 hover:text-slate-900" aria-label={`Aumentar ${label}`}>+</button>
        </div>
    );
}

/** Um elemento da etiqueta: liga/desliga e tamanho no título; texto e opções embaixo. */
function ElementCard({ title, enabled, onToggle, size, autoSize, onSize, children }: {
    title: string;
    enabled: boolean;
    onToggle?: (value: boolean) => void;
    size: number | undefined;
    autoSize: number | undefined;
    onSize: (value: number | undefined) => void;
    children?: ReactNode;
}) {
    return (
        <div className={cn('rounded-xl border border-slate-200 bg-white p-3', !enabled && 'bg-slate-50')}>
            <div className="flex items-center gap-2">
                <span className={cn('min-w-0 flex-1 text-sm font-semibold', enabled ? 'text-slate-800' : 'text-slate-400')}>{title}</span>
                {enabled && <SizeStepper label={`Tamanho — ${title}`} value={size} auto={autoSize} onChange={onSize} />}
                {onToggle && <Toggle checked={enabled} onChange={onToggle} />}
            </div>
            {enabled && children && <div className="mt-2 space-y-2">{children}</div>}
        </div>
    );
}

function Slider({ label, value, min, max, step, onChange, format }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    format: (value: number) => string;
}) {
    return (
        <label className="block">
            <span className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
                <span>{label}</span>
                <span className="tabular-nums text-slate-700">{format(value)}</span>
            </span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--sgf-primary)]" />
        </label>
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
    const [showPromoText, setShowPromoText] = useState(true);
    const [headerText, setHeaderText] = useState('');
    const [promoText, setPromoText] = useState(DEFAULT_PROMO_TEXT);
    const [appName, setAppName] = useState(DEFAULT_APP_NAME);
    const [fontOverrides, setFontOverrides] = useState<Partial<QrLabelFonts>>({});
    const [spacingPreset, setSpacingPreset] = useState<SpacingPreset | 'custom'>('normal');
    const [spacing, setSpacing] = useState(SPACING_PRESETS.normal.spacing);
    const [lineHeight, setLineHeight] = useState(SPACING_PRESETS.normal.lineHeight);
    const [align, setAlign] = useState<'spread' | 'grouped'>(SPACING_PRESETS.normal.align);
    const [sidePadding, setSidePadding] = useState<number | undefined>(SPACING_PRESETS.normal.side);
    const [qrMargin, setQrMargin] = useState(SPACING_PRESETS.normal.qrMargin);
    const [border, setBorder] = useState(true);
    const [copies, setCopies] = useState('1');
    // Disposição na folha (mm).
    const [gapX, setGapX] = useState(4);
    const [gapY, setGapY] = useState(4);
    const [linkGaps, setLinkGaps] = useState(true);
    const [marginTop, setMarginTop] = useState(8);
    const [marginSide, setMarginSide] = useState(8);
    const [gridAlign, setGridAlign] = useState<'center' | 'margin'>('center');
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
    const header = showHeader ? (headerText.trim() || branding.name || 'Prefeitura Municipal') : '';

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
        showPromoText,
        appName: appName.trim() || DEFAULT_APP_NAME,
        promoText: promoText.trim() || DEFAULT_PROMO_TEXT,
        showPlate,
        fonts: fontOverrides,
        spacing,
        sidePaddingMm: sidePadding,
        lineHeight,
        align,
        qrQuietModules: quietModules(qrMargin),
        qrMarginRatio: qrMargin,
        skip: sheet === 'label' ? 0 : Math.max(0, Math.floor(Number(skip) || 0)),
        gapXMm: gapX,
        gapYMm: gapY,
        sheetMarginTopMm: marginTop,
        sheetMarginSideMm: marginSide,
        gridAlign,
        title: 'Etiquetas QR — Frota',
    };
    const metrics = pdfLib?.qrLabelMetrics({ ...baseOptions, lineCount });
    const layout = metrics?.layout;
    const totalLabels = selected.length * copyCount;
    const perPage = metrics?.perPage ?? 1;
    const pages = totalLabels === 0 ? 0 : Math.ceil((totalLabels + (baseOptions.skip ?? 0)) / perPage);
    const canPrint = totalLabels > 0 && Boolean(metrics?.fitsSheet);
    const look: LabelLook = {
        header,
        appPromo,
        promoText: baseOptions.promoText ?? DEFAULT_PROMO_TEXT,
        appName: baseOptions.appName ?? DEFAULT_APP_NAME,
        qrStyle,
        border,
        qrMargin,
    };
    const applySpacingPreset = (value: string) => {
        if (value === 'custom') {
            setSpacingPreset('custom');
            return;
        }
        const presetValues = SPACING_PRESETS[value as SpacingPreset];
        if (!presetValues) return;
        setSpacingPreset(value as SpacingPreset);
        setSpacing(presetValues.spacing);
        setLineHeight(presetValues.lineHeight);
        setAlign(presetValues.align);
        setQrMargin(presetValues.qrMargin);
        setSidePadding(presetValues.side);
    };
    const tweak = <T,>(setter: (value: T) => void) => (value: T) => {
        setter(value);
        setSpacingPreset('custom');
    };
    const setFont = (key: keyof QrLabelFonts, value: number | undefined) =>
        setFontOverrides((current) => ({ ...current, [key]: value }));

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
            setProgress('Montando o PDF…');
            const bytes = await pdfLib.buildQrLabelsPdf({ ...baseOptions, items });
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
                            {sheet !== 'label' && (
                                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-slate-800">Disposição na folha</span>
                                        {metrics && <span className="text-xs font-semibold text-slate-500">{metrics.columns} col. × {metrics.rows} lin.</span>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 p-1 text-xs font-semibold" role="radiogroup" aria-label="Posição da grade">
                                        {([['center', 'Centralizada'], ['margin', 'A partir da margem']] as const).map(([value, label]) => (
                                            <button key={value} type="button" role="radio" aria-checked={gridAlign === value} onClick={() => setGridAlign(value)}
                                                className={cn('rounded-md px-2 py-1.5', gridAlign === value ? 'bg-[var(--sgf-dark)] text-white' : 'text-slate-500 hover:bg-slate-50')}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <Slider label="Espaço horizontal (entre colunas)" value={gapX} min={0} max={20} step={0.5}
                                        onChange={(v) => { setGapX(v); if (linkGaps) setGapY(v); }} format={(v) => `${v.toLocaleString('pt-BR')} mm`} />
                                    <Slider label="Espaço vertical (entre linhas)" value={gapY} min={0} max={20} step={0.5}
                                        onChange={(v) => { setGapY(v); if (linkGaps) setGapX(v); }} format={(v) => `${v.toLocaleString('pt-BR')} mm`} />
                                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                                        <input type="checkbox" checked={linkGaps} onChange={(e) => { setLinkGaps(e.target.checked); if (e.target.checked) setGapY(gapX); }} className="h-3.5 w-3.5 accent-[var(--sgf-primary)]" />
                                        Mesmo espaço nos dois sentidos
                                    </label>
                                    <Slider label="Margem da folha — topo e base" value={marginTop} min={0} max={30} step={0.5}
                                        onChange={setMarginTop} format={(v) => `${v.toLocaleString('pt-BR')} mm`} />
                                    <Slider label="Margem da folha — laterais" value={marginSide} min={0} max={30} step={0.5}
                                        onChange={setMarginSide} format={(v) => `${v.toLocaleString('pt-BR')} mm`} />
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <button type="button" onClick={() => { setGapX(0); setGapY(0); }} className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">Etiquetas coladas</button>
                                        <button type="button" onClick={() => { setGapX(4); setGapY(4); setMarginTop(8); setMarginSide(8); setGridAlign('center'); setLinkGaps(true); }} className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">Restaurar padrão</button>
                                    </div>
                                    {gridAlign === 'center' && (
                                        <p className="text-[11px] text-slate-400">Centralizada: a grade fica no meio da folha e as margens só limitam até onde ela vai. Para folhas de etiquetas já recortadas, use "A partir da margem" com as medidas da embalagem.</p>
                                    )}
                                </div>
                            )}
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
                        <p className={sectionTitle}>Estilo do QR e espaçamento</p>
                        <div className="space-y-3">
                            <SGFSelect label="Estilo do QR" options={QR_STYLE_OPTIONS} value={qrStyle} onChange={(value) => setQrStyle(value === 'plain' ? 'plain' : 'styled')} fullWidth />
                            <div>
                                <span className={fieldLabel}>Espaçamento</span>
                                <div className="grid grid-cols-4 gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold" role="radiogroup" aria-label="Espaçamento">
                                    {([...Object.entries(SPACING_PRESETS).map(([value, p]) => [value, p.label]), ['custom', 'Ajustado']] as [string, string][]).map(([value, label]) => (
                                        <button key={value} type="button" role="radio" aria-checked={spacingPreset === value} onClick={() => applySpacingPreset(value)}
                                            className={cn('rounded-lg px-2 py-1.5', spacingPreset === value ? 'bg-[var(--sgf-dark)] text-white' : 'text-slate-500 hover:bg-slate-50')}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" open={spacingPreset === 'custom'}>
                                <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500">Ajuste fino do espaçamento</summary>
                                <div className="mt-3 space-y-3">
                                    <Slider label="Margens laterais" value={sidePadding ?? layout?.autoSidePadding ?? 3} min={0} max={Math.max(2, Math.round(labelW / 4))} step={0.5}
                                        onChange={tweak((v: number) => setSidePadding(v))} format={(v) => `${v.toLocaleString('pt-BR')} mm${sidePadding === undefined ? ' (auto)' : ''}`} />
                                    <Slider label="Espaço entre elementos" value={spacing} min={0} max={3} step={0.05} onChange={tweak(setSpacing)} format={(v) => `${Math.round(v * 100)}%`} />
                                    <Slider label="Entrelinha dos textos" value={lineHeight} min={0.9} max={1.8} step={0.05} onChange={tweak(setLineHeight)} format={(v) => v.toFixed(2).replace('.', ',')} />
                                    <Slider label="Margem branca do QR" value={qrMargin} min={0.01} max={0.1} step={0.01} onChange={tweak(setQrMargin)} format={(v) => `${Math.round(v * 100)}%`} />
                                    <SGFSelect label="Distribuição na etiqueta" fullWidth value={align} onChange={(value) => tweak(setAlign)(value === 'grouped' ? 'grouped' : 'spread')}
                                        options={[{ value: 'grouped', label: 'Tudo junto no centro' }, { value: 'spread', label: 'Cabeçalho no topo, textos embaixo' }]} />
                                </div>
                            </details>
                            {check('Contorno para recorte', border, setBorder)}
                        </div>
                    </div>
                    <div>
                        <p className={sectionTitle}>Elementos e textos</p>
                        <div className="space-y-2">
                            <ElementCard title="Nome da prefeitura" enabled={showHeader} onToggle={setShowHeader}
                                size={fontOverrides.name} autoSize={layout?.fonts.name} onSize={(v) => setFont('name', v)}>
                                <input type="text" value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder={branding.name || 'Prefeitura Municipal'} maxLength={80} className={textInput} aria-label="Texto do cabeçalho" />
                            </ElementCard>
                            <ElementCard title="Texto do convite" enabled={showPromoText} onToggle={setShowPromoText}
                                size={fontOverrides.promo} autoSize={layout?.fonts.promo} onSize={(v) => setFont('promo', v)}>
                                <input type="text" value={promoText} onChange={(e) => setPromoText(e.target.value)} placeholder={DEFAULT_PROMO_TEXT} maxLength={60} className={textInput} aria-label="Texto do convite" />
                            </ElementCard>
                            <ElementCard title="Logo e nome do app" enabled={appPromo} onToggle={setAppPromo}
                                size={fontOverrides.app} autoSize={layout?.fonts.app} onSize={(v) => setFont('app', v)}>
                                <input type="text" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder={DEFAULT_APP_NAME} maxLength={40} className={textInput} aria-label="Nome do app" />
                                <p className="text-[11px] text-slate-400">Com os ícones do Google Play e da App Store.</p>
                            </ElementCard>
                            <ElementCard title="Placa" enabled={showPlate} onToggle={setShowPlate}
                                size={fontOverrides.plate} autoSize={layout?.fonts.plate} onSize={(v) => setFont('plate', v)} />
                            <ElementCard title="Linhas abaixo da placa" enabled
                                size={fontOverrides.caption} autoSize={layout?.fonts.caption} onSize={(v) => setFont('caption', v)}>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    {([['Modelo', showModel, setShowModel], ['Secretaria', showDepartment, setShowDepartment], ['Prefixo', showUnitCode, setShowUnitCode]] as const).map(([label, value, setter]) => (
                                        <label key={label} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 font-medium text-slate-600">
                                            <input type="checkbox" checked={value} onChange={(e) => setter(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--sgf-primary)]" />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            </ElementCard>
                            {Object.values(fontOverrides).some((v) => v !== undefined) && (
                                <button type="button" onClick={() => setFontOverrides({})} className="text-xs font-semibold text-slate-500 hover:underline">
                                    Voltar todos os tamanhos ao automático
                                </button>
                            )}
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
                                        const position = metrics.slot(slot);
                                        const left = position.x * ptToPx;
                                        const top = position.top * ptToPx;
                                        return (
                                            <div key={slot} className="absolute" style={{ left, top }}>
                                                {vehicle ? (
                                                    <LabelPreview
                                                        layout={layout}
                                                        pxPerMm={sheetPxPerMm}
                                                        plate={formatPlate(vehicle.plate as string)}
                                                        lines={linesFor(vehicle)}
                                                        look={look}
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
                                    look={look}
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
