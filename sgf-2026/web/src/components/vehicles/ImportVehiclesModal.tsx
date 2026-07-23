import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';
import * as pdfjsLib from 'pdfjs-dist';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import {
    FileSpreadsheet,
    FileText,
    Upload,
    Download,
    CheckCircle,
    AlertTriangle,
    XCircle,
    Loader2,
    RefreshCw,
    Car,
    Building2,
    Sparkles,
} from '@/components/sgf/icons';
import { departmentsApi, vehiclesApi, type VehicleRecord } from '@/lib/supabase-api';
import type { TablesUpdate } from '@/types/database.types';
import { formatPlate } from '@/lib/utils';
import { extractVehicleRowsFromText, extractVehicleRowsFromImages } from '@/lib/vehicleImportAI';

interface ImportVehiclesModalProps {
    isOpen: boolean;
    onClose: () => void;
    existingVehicles?: VehicleRecord[];
}

export interface ParsedVehicleRow {
    rowIndex: number;
    plate: string;
    brand: string;
    model: string;
    year?: number;
    color?: string;
    fuelType: 'DIESEL' | 'GASOLINE' | 'ETHANOL' | 'FLEX' | 'GNV';
    departmentName?: string;
    departmentId?: string | null;
    tankCapacity: number;
    currentOdometer: number;
    renavam?: string;
    chassis?: string;
    status: 'valid' | 'warning' | 'error';
    /** 'create' = veículo novo; 'update' = já existe e receberá só os campos vazios. */
    action: 'create' | 'update';
    existingVehicleId?: string | null;
    issues: string[];
    aiOrganized?: boolean;
    aiNotes?: string[];
}

/** Estilo dos campos editáveis da tabela de conferência. */
const CELL_INPUT =
    'rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none transition ' +
    'hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ' +
    'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

/** Marcas automotivas brasileiras comuns para separação inteligente de Marca/Modelo por IA */
const KNOWN_BRANDS = [
    'FIAT', 'VOLKSWAGEN', 'VW', 'CHEVROLET', 'GM', 'TOYOTA', 'FORD', 'RENAULT',
    'HYUNDAI', 'HONDA', 'NISSAN', 'JEEP', 'MITSUBISHI', 'MERCEDES', 'MERCEDES-BENZ', 'M.BENZ', 'MBENZ',
    'IVECO', 'SCANIA', 'VOLVO', 'PEUGEOT', 'CITROEN', 'CITROËN', 'RAM', 'BYD', 'CHERY',
    'JAC', 'JAK', 'MARCOPOLO', 'VOLARE', 'AGRALE', 'CAOA CHERY'
];

/** Synonyms mapping dictionary for AI Column Identification */
const FIELD_SYNONYMS: Record<string, string[]> = {
    plate: ['placa', 'plate', 'licença', 'licenca', 'registro', 'patrimonio', 'patrimônio', 'cod', 'código', 'id veiculo', 'placa veiculo'],
    brand: ['marca', 'brand', 'montadora', 'fabricante', 'make'],
    model: ['modelo', 'model', 'veiculo', 'veículo', 'nome', 'descrição', 'descricao', 'carro', 'desc', 'veiculo/modelo'],
    year: ['ano', 'year', 'ano fab', 'ano modelo', 'exercício', 'exercicio', 'ano fabricação', 'ano fabricacao'],
    color: ['cor', 'color', 'pintura'],
    fuel: ['combustivel', 'combustível', 'fuel', 'propulsão', 'propulsao', 'tipo combustivel', 'comb'],
    department: ['secretaria', 'departamento', 'department', 'setor', 'lotação', 'lotacao', 'unidade', 'destinação', 'destinacao', 'sec'],
    tank: ['tanque', 'capacidade', 'vol tanque', 'litros', 'tanq', 'capacidade tanque', 'capacidade (l)', 'tanque (l)'],
    odometer: ['odometro', 'odômetro', 'km', 'quilometragem', 'hodometro', 'km atual', 'hodômetro', 'odometro atual'],
    renavam: ['renavam', 'cod renavam', 'código renavam'],
    chassis: ['chassi', 'chassis', 'vin', 'n° chassi', 'num chassi'],
};

/** Gerador do modelo Excel (.xlsx) */
export async function downloadExcelTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Veículos');

    sheet.columns = [
        { header: 'Placa *', key: 'plate', width: 14 },
        { header: 'Marca *', key: 'brand', width: 18 },
        { header: 'Modelo *', key: 'model', width: 22 },
        { header: 'Ano', key: 'year', width: 10 },
        { header: 'Cor', key: 'color', width: 14 },
        { header: 'Combustível *', key: 'fuel_type', width: 16 },
        { header: 'Secretaria', key: 'department', width: 25 },
        { header: 'Capacidade Tanque (L)', key: 'tank_capacity', width: 22 },
        { header: 'Odômetro Atual (km)', key: 'current_odometer', width: 22 },
        { header: 'RENAVAM', key: 'renavam', width: 16 },
        { header: 'Chassi', key: 'chassis', width: 22 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF00A86B' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.addRow({
        plate: 'ABC1D23',
        brand: 'Fiat',
        model: 'Argo 1.0',
        year: 2023,
        color: 'Branco',
        fuel_type: 'Flex',
        department: 'Secretaria de Obras',
        tank_capacity: 48,
        current_odometer: 15400,
        renavam: '12345678901',
        chassis: '9BWCA05W012345678',
    });

    sheet.addRow({
        plate: 'XYZ9876',
        brand: 'Volkswagen',
        model: 'Gol 1.6',
        year: 2021,
        color: 'Prata',
        fuel_type: 'Gasolina',
        department: 'Secretaria de Saúde',
        tank_capacity: 55,
        current_odometer: 42300,
        renavam: '98765432109',
        chassis: '9BWCA05W098765432',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_veiculos.xlsx';
    a.click();
    URL.revokeObjectURL(url);
}

/** Gerador do modelo CSV (.csv) */
export function downloadCsvTemplate() {
    const csvContent = [
        'Placa;Marca;Modelo;Ano;Cor;Combustível;Secretaria;Capacidade Tanque (L);Odômetro (km);RENAVAM;Chassi',
        'ABC1D23;Fiat;Argo 1.0;2023;Branco;Flex;Secretaria de Obras;48;15400;12345678901;9BWCA05W012345678',
        'XYZ9876;Volkswagen;Gol 1.6;2021;Prata;Gasolina;Secretaria de Saúde;55;42300;98765432109;9BWCA05W098765432',
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_veiculos.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function normalizeFuel(fuelStr?: string): 'DIESEL' | 'GASOLINE' | 'ETHANOL' | 'FLEX' | 'GNV' {
    if (!fuelStr) return 'FLEX';
    const clean = fuelStr.trim().toUpperCase().replace(/[-_]/g, '/');
    // FLEX deve vir ANTES do check individual de ALCOOL ou GASOLINA
    if (
        clean.includes('FLEX') ||
        clean.includes('ALCOOL/GAS') ||
        clean.includes('ÁLCOOL/GAS') ||
        clean.includes('GASOLINA/ALC') ||
        clean.includes('GAS/ALC') ||
        (clean.includes('ALCOOL') && clean.includes('GASOLINA')) ||
        (clean.includes('ÁLCOOL') && clean.includes('GASOLINA'))
    ) return 'FLEX';
    if (clean.includes('DIESEL')) return 'DIESEL';
    if (clean.includes('GNV') || clean.includes('GAS NATURAL')) return 'GNV';
    if (clean.includes('ETANOL') || clean.includes('ALCOOL') || clean.includes('ÁLCOOL') || clean.includes('ETHANOL')) return 'ETHANOL';
    if (clean.includes('GAS') || clean.includes('GASOLINA')) return 'GASOLINE';
    return 'FLEX';
}

function lookupTankCapacity(brand?: string, model?: string): number {
    if (!model && !brand) return 50;
    const u = `${brand || ''} ${model || ''}`.toUpperCase();

    // Pickups & Utilitários Grandes / Caminhões
    if (u.includes('F350') || u.includes('F-350') || u.includes('F4000') || u.includes('F-4000') || u.includes('CARGO')) return 105;
    if (u.includes('RAM') || u.includes('SILVERADO')) return 98;
    if (u.includes('HILUX') || u.includes('SW4')) return 80;
    if (u.includes('RANGER')) return 80;
    if (u.includes('S10') || u.includes('S-10')) return 76;
    if (u.includes('AMAROK')) return 80;
    if (u.includes('L200') || u.includes('TRITON')) return 75;
    if (u.includes('FRONTIER')) return 80;
    if (u.includes('TORO')) return 60;
    if (u.includes('OROCH')) return 50;
    if (u.includes('STRADA')) return 55;
    if (u.includes('SAVEIRO')) return 55;
    if (u.includes('MONTANA')) return 52;
    if (u.includes('KOMBI')) return 45;
    if (u.includes('DUCATO') || u.includes('JUMPER') || u.includes('BOXER') || u.includes('MASTER') || u.includes('SPRINTER') || u.includes('TRANSIT')) return 80;

    // Vans / Minivans / SUVs
    if (u.includes('SPIN')) return 53;
    if (u.includes('DOBLO') || u.includes('DOBLÒ')) return 60;
    if (u.includes('FIORINO')) return 55;
    if (u.includes('KANGOO')) return 50;
    if (u.includes('RENEGADE') || u.includes('COMPASS') || u.includes('COMMANDER')) return 60;
    if (u.includes('CRETA') || u.includes('HR-V') || u.includes('HRV') || u.includes('KICKS') || u.includes('TRACKER') || u.includes('DUSTER') || u.includes('T-CROSS') || u.includes('NIVUS') || u.includes('PULSE') || u.includes('FASTBACK')) return 50;

    // Carros de Passeio / Hatches / Sedans
    if (u.includes('GOL') || u.includes('VOYAGE') || u.includes('POLO') || u.includes('VIRTUS')) return 52;
    if (u.includes('PALIO') || u.includes('SIENA') || u.includes('UNO') || u.includes('MOBI') || u.includes('ARGO') || u.includes('CRONOS')) return 48;
    if (u.includes('ONIX') || u.includes('PRISMA') || u.includes('CELTA') || u.includes('CORSA') || u.includes('COBALT') || u.includes('SPARK')) return 54;
    if (u.includes('KA') || u.includes('FIESTA') || u.includes('FOCUS') || u.includes('ECOSPORT')) return 52;
    if (u.includes('HB20') || u.includes('HB20S') || u.includes('TUCSON')) return 50;
    if (u.includes('COROLLA') || u.includes('ETIOS') || u.includes('YARIS')) return 50;
    if (u.includes('CIVIC') || u.includes('FIT') || u.includes('CITY')) return 47;
    if (u.includes('SANDERO') || u.includes('LOGAN') || u.includes('KWID')) return 50;
    if (u.includes('208') || u.includes('2008') || u.includes('308') || u.includes('C3') || u.includes('AIRCROSS')) return 47;
    if (u.includes('PRIUS')) return 45;

    // Maquinário / Ônibus / Caminhões genéricos
    return 50;
}

// Configura worker do pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;

/** Extrator de texto de arquivos PDF no navegador */
async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            let lastY: number | null = null;
            const lines: string[] = [];
            let currentLine = '';

            for (const item of textContent.items as any[]) {
                if ('str' in item) {
                    const y = item.transform ? item.transform[5] : null;
                    if (lastY !== null && y !== null && Math.abs(y - lastY) > 6) {
                        if (currentLine.trim()) lines.push(currentLine.trim());
                        currentLine = item.str;
                    } else {
                        currentLine += (currentLine ? ' ' : '') + item.str;
                    }
                    if (y !== null) lastY = y;
                }
            }
            if (currentLine.trim()) lines.push(currentLine.trim());
            fullText += lines.join('\n') + '\n';
        }

        return fullText;
    } catch (e) {
        console.warn('pdfjs extração com aviso, tentando fallback bruto:', e);
        const textDecoder = new TextDecoder('utf-8');
        const raw = textDecoder.decode(arrayBuffer);
        const matches = raw.match(/\(([^()]+)\)\s*Tj|\[([^\[\]]+)\]\s*TJ/g) || [];
        const extracted = matches
            .map((m) => m.replace(/[\(\)\[\]]/g, '').replace(/Tj|TJ/g, '').trim())
            .filter(Boolean)
            .join('\n');
        return extracted || raw;
    }
}

/** Renderiza páginas do PDF como imagens (data:URL) para OCR visual da IA. */
async function renderPdfPagesToImages(arrayBuffer: ArrayBuffer, maxPages = 12): Promise<string[]> {
    // clona o buffer porque a extração de texto pode ter consumido/transferido o original
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const total = Math.min(pdf.numPages, maxPages);
    const images: string[] = [];

    for (let pageNum = 1; pageNum <= total; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 }); // resolução boa p/ OCR sem ficar pesado
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.8));
        canvas.width = 0;
        canvas.height = 0;
    }

    return images;
}

/** Transforma texto bruto / PDF em linhas de veículos */
function parseRawTextToRows(text: string): Record<string, any>[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rawRows: Record<string, any>[] = [];

    if (lines.length === 0) return [];

    const splitCols = (line: string) => line.split(/[;,\t|]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const firstLineCols = splitCols(lines[0]);
    const hasHeader = firstLineCols.some((c) =>
        ['placa', 'marca', 'modelo', 'ano', 'cor', 'combustivel', 'secretaria', 'tanque', 'km', 'renavam', 'chassi'].some((k) =>
            c.toLowerCase().includes(k)
        )
    );

    if (hasHeader) {
        const headers = firstLineCols.map((h) => h.toLowerCase());
        for (let i = 1; i < lines.length; i++) {
            const cols = splitCols(lines[i]);
            const obj: Record<string, any> = {};
            headers.forEach((h, colIdx) => {
                obj[h] = cols[colIdx] ?? '';
            });
            rawRows.push(obj);
        }
    } else {
        lines.forEach((line) => {
            const cols = splitCols(line);
            if (cols.length >= 2) {
                const obj: Record<string, any> = {};
                cols.forEach((col, idx) => {
                    obj[`col_${idx}`] = col;
                });

                const upperLine = line.toUpperCase();
                const plateMatch = line.match(/[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/gi);
                const yearMatch = line.match(/\b(19[89][0-9]|20[0-2][0-9])\b/);
                const kmMatch = line.match(/([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+)\s*km/i);
                const tankMatch = line.match(/([0-9]+)\s*l/i);

                if (plateMatch) obj.plate = plateMatch[0];
                if (yearMatch) obj.year = yearMatch[0];
                if (kmMatch) obj.current_odometer = kmMatch[1];
                if (tankMatch) obj.tank_capacity = tankMatch[1];

                const matchedBrand = KNOWN_BRANDS.find((b) => upperLine.includes(b));
                if (matchedBrand) obj.brand = matchedBrand;

                obj.model = line;
                rawRows.push(obj);
            } else {
                const upperLine = line.toUpperCase();
                const plateMatch = line.match(/[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/gi);
                const yearMatch = line.match(/\b(19[89][0-9]|20[0-2][0-9])\b/);
                const kmMatch = line.match(/([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+)\s*km/i);
                const tankMatch = line.match(/([0-9]+)\s*l/i);
                const matchedBrand = KNOWN_BRANDS.find((b) => upperLine.includes(b));

                rawRows.push({
                    plate: plateMatch ? plateMatch[0] : '',
                    brand: matchedBrand || '',
                    model: line,
                    year: yearMatch ? yearMatch[0] : '',
                    current_odometer: kmMatch ? kmMatch[1] : '',
                    tank_capacity: tankMatch ? tankMatch[1] : '',
                });
            }
        });
    }

    return rawRows;
}

export function ImportVehiclesModal({ isOpen, onClose, existingVehicles = [] }: ImportVehiclesModalProps) {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [fileName, setFileName] = useState<string>('');
    const [parsedRows, setParsedRows] = useState<ParsedVehicleRow[]>([]);
    const [useAi, setUseAi] = useState<boolean>(true);
    const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
    const [rawText, setRawText] = useState<string>('');
    const [parsing, setParsing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
    const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'error'>('all');
    const [aiOrganizedCount, setAiOrganizedCount] = useState<number>(0);

    // Carrega secretarias para casar nomes
    const { data: departments = [] } = useQuery({
        queryKey: ['departments', 'all-for-import'],
        queryFn: () => departmentsApi.getAll(),
        enabled: isOpen,
    });

    // Frota COMPLETA (sem os filtros da tela de veículos): é o que permite detectar
    // corretamente quais placas já existem para completar em vez de duplicar.
    const { data: allVehicles = [] } = useQuery({
        queryKey: ['vehicles', 'all-for-import'],
        queryFn: () => vehiclesApi.getAll(),
        enabled: isOpen,
    });

    const knownVehicles = allVehicles.length > 0 ? allVehicles : existingVehicles;

    const resetState = () => {
        setFileName('');
        setParsedRows([]);
        setParsing(false);
        setImporting(false);
        setProgress({ current: 0, total: 0 });
        setFilterMode('all');
        setAiOrganizedCount(0);
        setRawText('');
        setInputMode('file');
        setIsDragging(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        if (importing) return;
        resetState();
        onClose();
    };

    const cleanPlateStr = (p: string) => (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    /** Índice dos veículos já cadastrados, por placa normalizada (para detectar atualização). */
    const existingByPlate = useMemo(() => {
        const map = new Map<string, VehicleRecord>();
        knownVehicles.forEach((v) => {
            const key = cleanPlateStr(v.plate || v.unit_code || '');
            if (key) map.set(key, v);
        });
        return map;
    }, [knownVehicles]);

    /**
     * Revalida as linhas (usado após a análise e a cada edição manual na tabela).
     * Regra: SOMENTE a placa é obrigatória. Placa já cadastrada vira atualização
     * (preenche apenas os campos vazios do veículo existente).
     */
    const validateRows = (rows: ParsedVehicleRow[]): ParsedVehicleRow[] => {
        const seen = new Set<string>();

        return rows.map((r) => {
            const issues: string[] = [];
            let status: 'valid' | 'warning' | 'error' = 'valid';
            let action: 'create' | 'update' = 'create';
            let existingVehicleId: string | null = null;

            const plate = cleanPlateStr(r.plate);

            if (!plate) {
                issues.push('Placa não informada (único campo obrigatório)');
                status = 'error';
            } else if (plate.length < 7) {
                issues.push('Placa com formato inválido (mínimo 7 caracteres)');
                status = 'error';
            } else if (seen.has(plate)) {
                issues.push('Placa duplicada no arquivo');
                status = 'error';
            } else {
                seen.add(plate);
                const existing = existingByPlate.get(plate);
                if (existing) {
                    action = 'update';
                    existingVehicleId = existing.id;
                    issues.push('Já cadastrado — só os campos vazios serão preenchidos');
                    status = 'warning';
                }
            }

            // Marca/modelo são opcionais: apenas avisam, não bloqueiam.
            if (!r.brand?.trim()) {
                issues.push('Marca não informada');
                if (status === 'valid') status = 'warning';
            }
            if (!r.model?.trim()) {
                issues.push('Modelo não informado');
                if (status === 'valid') status = 'warning';
            }

            // Casamento da secretaria (recalculado para refletir edições manuais).
            let departmentId: string | null = null;
            const deptName = r.departmentName?.trim();
            if (deptName) {
                const target = deptName.toLowerCase();
                const match = departments.find((d) => {
                    const name = d.name.toLowerCase().trim();
                    return name === target || name.includes(target) || target.includes(name);
                });
                if (match) {
                    departmentId = match.id;
                } else {
                    issues.push(`Secretaria "${deptName}" não cadastrada (ficará sem secretaria)`);
                    if (status === 'valid') status = 'warning';
                }
            }

            return { ...r, plate, departmentId, status, action, existingVehicleId, issues };
        });
    };

    /** IA Smart Mapper & Validador de Linhas */
    const processRowsWithAI = (rawRows: Record<string, any>[]): ParsedVehicleRow[] => {
        let countAiFixes = 0;

        const results = rawRows.map((row, idx) => {
            const issues: string[] = [];
            const aiNotes: string[] = [];
            let status: 'valid' | 'warning' | 'error' = 'valid';
            let isAiOrganized = false;

            // 1. Mapeamento Inteligente de Colunas por Sinonímia de IA
            const findColumnValue = (targetField: string): string => {
                const synonyms = FIELD_SYNONYMS[targetField] || [targetField];
                for (const key of Object.keys(row)) {
                    const cleanKey = key.toLowerCase().trim();
                    if (synonyms.some((s) => cleanKey.includes(s) || s.includes(cleanKey))) {
                        const val = row[key];
                        if (val !== undefined && val !== null && String(val).trim() !== '') {
                            return String(val).trim();
                        }
                    }
                }
                return '';
            };

            let rawPlate = findColumnValue('plate');
            let rawBrand = findColumnValue('brand');
            let rawModel = findColumnValue('model');
            let rawYearStr = findColumnValue('year');
            let rawColor = findColumnValue('color');
            let rawFuelStr = findColumnValue('fuel');
            let rawDept = findColumnValue('department');
            let rawTankStr = findColumnValue('tank');
            let rawOdoStr = findColumnValue('odometer');
            let rawRenavam = findColumnValue('renavam');
            let rawChassis = findColumnValue('chassis');

            // 2. IA - Separação de Marca e Modelo se combinados (ex.: "Fiat Argo 1.0", "VW/SAVEIRO", "MARCOPOLO/VOLARE")
            const normBrand = (b: string) => {
                const cleanB = (b || '').toUpperCase().trim();
                if (cleanB === 'VW' || cleanB.includes('VOLKS')) return 'Volkswagen';
                if (cleanB === 'GM' || cleanB.includes('CHEVROLET')) return 'Chevrolet';
                if (cleanB.includes('M.BENZ') || cleanB.includes('MERCEDES') || cleanB.includes('BENZ')) return 'Mercedes-Benz';
                if (cleanB.includes('MARCOPOLO') || cleanB.includes('VOLARE')) return 'Marcopolo';
                if (cleanB === 'FIAT') return 'Fiat';
                if (cleanB === 'FORD') return 'Ford';
                if (cleanB === 'TOYOTA') return 'Toyota';
                if (cleanB === 'HONDA') return 'Honda';
                if (cleanB === 'HYUNDAI') return 'Hyundai';
                if (cleanB === 'RENAULT') return 'Renault';
                if (cleanB === 'CITROEN' || cleanB === 'CITROËN') return 'Citroën';
                if (cleanB === 'PEUGEOT') return 'Peugeot';
                if (cleanB === 'NISSAN') return 'Nissan';
                if (cleanB === 'IVECO') return 'Iveco';
                if (cleanB === 'VOLVO') return 'Volvo';
                if (cleanB === 'SCANIA') return 'Scania';
                if (cleanB === 'AGRALE') return 'Agrale';
                if (cleanB === 'JAC' || cleanB === 'JAK') return 'JAC';
                return cleanB ? cleanB[0] + cleanB.slice(1).toLowerCase() : '';
            };

            if (useAi && rawModel) {
                // Padrão com barra: "VW/SAVEIRO", "FIAT/PALIO FIRE", "MARCOPOLO/VOLARE", "M.BENZ/CAIO"
                const slashMatch = rawModel.match(/^([A-Z0-9.\-\s]{2,15})\/(.+)$/i);
                if (slashMatch) {
                    const brandPart = slashMatch[1].toUpperCase().trim();
                    const modelPart = slashMatch[2].trim();
                    const extractedBrand = normBrand(brandPart);
                    if (extractedBrand) {
                        rawBrand = extractedBrand;
                        rawModel = modelPart;
                        isAiOrganized = true;
                        aiNotes.push(`Marca "${rawBrand}" separada do modelo via IA`);
                    }
                } else if (!rawBrand) {
                    // Padrão sem barra: "Fiat Argo 1.0" — procura marca no início
                    const upperModel = rawModel.toUpperCase();
                    const matchedBrand = KNOWN_BRANDS.find((b) => upperModel.startsWith(b));
                    if (matchedBrand) {
                        rawBrand = normBrand(matchedBrand);
                        rawModel = rawModel.slice(matchedBrand.length).trim() || rawBrand;
                        isAiOrganized = true;
                        aiNotes.push(`Marca "${rawBrand}" extraída do modelo`);
                    }
                }

                // Normaliza marca se já existente de forma rústica (ex: "VW" -> "Volkswagen")
                if (rawBrand) {
                    const normalized = normBrand(rawBrand);
                    if (normalized && normalized !== rawBrand) {
                        rawBrand = normalized;
                    }
                }

                // Limpa duplicações em rawModel (ex.: "VOLARE V8L EO VOLARE V8L EO" → "VOLARE V8L EO")
                if (rawModel) {
                    if (rawBrand && rawModel.toLowerCase().startsWith(rawBrand.toLowerCase())) {
                        rawModel = rawModel.slice(rawBrand.length).replace(/^[\/\-\s]+/, '').trim();
                    }

                    const parts = rawModel.split(/\s+/);
                    if (parts.length >= 2 && parts.length % 2 === 0) {
                        const half = parts.length / 2;
                        const firstHalf = parts.slice(0, half).join(' ');
                        const secondHalf = parts.slice(half).join(' ');
                        if (firstHalf.toUpperCase() === secondHalf.toUpperCase()) {
                            rawModel = firstHalf;
                            isAiOrganized = true;
                        }
                    } else if (rawModel.length > 6) {
                        const half = Math.floor(rawModel.length / 2);
                        const a = rawModel.slice(0, half).trim();
                        const b = rawModel.slice(half).trim();
                        if (a.toUpperCase() === b.toUpperCase()) {
                            rawModel = a;
                            isAiOrganized = true;
                        }
                    }
                }
            }

            // 3. IA - Normalização e Limpeza de Placa (Mercosul ou Padrão antigo)
            let cleanPlate = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (useAi && rawPlate && cleanPlate !== rawPlate) {
                isAiOrganized = true;
                aiNotes.push(`Placa formatada (${rawPlate} → ${cleanPlate})`);
            }

            // 4. IA - Limpeza de Valores Numéricos (ex.: "15.400 km" -> 15400, "55 Litros" -> 55)
            const rawYear = parseInt(rawYearStr.replace(/[^0-9]/g, ''), 10);
            const rawTank = parseFloat(rawTankStr.replace(',', '.').replace(/[^0-9.]/g, ''));
            const rawOdo = parseInt(rawOdoStr.replace(/[^0-9]/g, ''), 10);

            if (useAi && (rawTankStr.includes('L') || rawOdoStr.toLowerCase().includes('km'))) {
                isAiOrganized = true;
                aiNotes.push('Valores de unidade (L/km) limpos pela IA');
            }

            // 5. IA - Casamento Inteligente de Secretaria por Similaridade (só a nota; o
            // vínculo e as validações são recalculados em validateRows, inclusive após edições).
            if (useAi && rawDept) {
                const targetDept = rawDept.toLowerCase().trim();
                const match = departments.find((d) => {
                    const name = d.name.toLowerCase().trim();
                    return name === targetDept || name.includes(targetDept) || targetDept.includes(name);
                });
                if (match && match.name.toLowerCase() !== targetDept) {
                    isAiOrganized = true;
                    aiNotes.push(`Secretaria associada a "${match.name}"`);
                }
            }

            const fuelType = normalizeFuel(rawFuelStr);
            if (useAi && rawFuelStr && !['DIESEL', 'GASOLINE', 'ETHANOL', 'FLEX', 'GNV'].includes(rawFuelStr.toUpperCase())) {
                isAiOrganized = true;
                aiNotes.push(`Combustível "${rawFuelStr}" normalizado para "${fuelType}"`);
            }

            let tankCapacity = Number.isNaN(rawTank) || rawTank <= 0 ? 0 : rawTank;
            if (useAi && tankCapacity === 0) {
                tankCapacity = lookupTankCapacity(rawBrand, rawModel);
                isAiOrganized = true;
                aiNotes.push(`Capacidade do tanque (${tankCapacity} L) estimada via IA para o modelo`);
            } else if (tankCapacity === 0) {
                tankCapacity = 50;
            }

            if (isAiOrganized) countAiFixes++;

            return {
                rowIndex: idx + 2,
                plate: cleanPlate,
                brand: rawBrand,
                model: rawModel,
                year: Number.isNaN(rawYear) ? undefined : rawYear,
                color: rawColor || undefined,
                fuelType,
                departmentName: rawDept || undefined,
                departmentId: null,
                tankCapacity,
                currentOdometer: Number.isNaN(rawOdo) || rawOdo < 0 ? 0 : rawOdo,
                renavam: rawRenavam || undefined,
                chassis: rawChassis || undefined,
                status,
                action: 'create' as const,
                existingVehicleId: null,
                issues,
                aiOrganized: isAiOrganized,
                aiNotes,
            };
        });

        setAiOrganizedCount(countAiFixes);
        return validateRows(results);
    };

    /** Edição manual de um campo na tabela de conferência (revalida na hora). */
    const updateRow = (rowIndex: number, patch: Partial<ParsedVehicleRow>) => {
        setParsedRows((prev) =>
            validateRows(prev.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r))),
        );
    };

    const [isDragging, setIsDragging] = useState(false);

    /**
     * Converte texto bruto (PDF/lista colada) em linhas de veículo.
     * Com IA ligada, usa a edge function (gemini) que separa as colunas corretamente;
     * se a IA falhar ou não retornar nada, cai no parser local por delimitadores.
     */
    const resolveRowsFromText = async (text: string): Promise<Record<string, any>[]> => {
        if (useAi) {
            try {
                const aiRows = await extractVehicleRowsFromText(text);
                if (aiRows.length > 0) return aiRows;
                console.warn('IA de importação não retornou linhas; usando parser local.');
            } catch (e) {
                console.warn('IA de importação falhou, usando parser local:', e);
                toast.warning('A IA não conseguiu organizar o arquivo agora — usando leitura básica.');
            }
        }
        return parseRawTextToRows(text);
    };

    /** Processamento do Arquivo (via input de arquivo ou Drag and Drop) */
    const processFile = async (file: File) => {
        setParsing(true);
        setFileName(file.name);

        try {
            const ext = file.name.split('.').pop()?.toLowerCase();
            let rawRows: Record<string, any>[] = [];

            if (ext === 'pdf' || file.type.includes('pdf')) {
                const buffer = await file.arrayBuffer();
                const pdfText = await extractTextFromPdf(buffer);
                if (pdfText.trim()) {
                    // PDF com texto selecionável → leitura por texto (mais barata).
                    rawRows = await resolveRowsFromText(pdfText);
                } else if (useAi) {
                    // PDF digitalizado/scanner (sem texto) → OCR visual pela IA.
                    toast.info('PDF sem texto — lendo por reconhecimento visual (IA). Pode levar alguns segundos...');
                    // relê do arquivo: a extração de texto pode ter "detachado" o buffer original.
                    const freshBuffer = await file.arrayBuffer();
                    const images = await renderPdfPagesToImages(freshBuffer);
                    if (images.length === 0) {
                        toast.error('Não foi possível renderizar as páginas do PDF.');
                        setParsing(false);
                        return;
                    }
                    rawRows = await extractVehicleRowsFromImages(images);
                    if (rawRows.length === 0) {
                        toast.error('A IA não encontrou veículos legíveis nas páginas do PDF.');
                        setParsing(false);
                        return;
                    }
                } else {
                    toast.error('Este PDF é digitalizado (imagem). Ative a "Organização Inteligente com IA" para ler por reconhecimento visual.');
                    setParsing(false);
                    return;
                }
            } else if (ext === 'csv' || file.type.includes('csv') || file.type.includes('text')) {
                const text = await file.text();
                rawRows = parseRawTextToRows(text);
            } else {
                // Excel (.xlsx, .xls)
                const buffer = await file.arrayBuffer();
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer);
                const sheet = workbook.worksheets[0];

                if (sheet) {
                    const headers: string[] = [];
                    sheet.getRow(1).eachCell((cell, colNumber) => {
                        headers[colNumber] = String(cell.value || '').toLowerCase().trim();
                    });

                    sheet.eachRow((row, rowNumber) => {
                        if (rowNumber === 1) return;
                        const obj: Record<string, any> = {};
                        row.eachCell((cell, colNumber) => {
                            const headerKey = headers[colNumber];
                            if (headerKey) {
                                obj[headerKey] = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
                            }
                        });
                        if (Object.keys(obj).length > 0) rawRows.push(obj);
                    });
                }
            }

            const validated = processRowsWithAI(rawRows);
            setParsedRows(validated);

            if (validated.length === 0) {
                toast.error('Nenhum dado válido encontrado no arquivo enviado.');
            } else {
                const validCount = validated.filter((r) => r.status !== 'error').length;
                toast.success(`${validated.length} linhas analisadas (${validCount} válidas para importação).`);
            }
        } catch (err) {
            console.error('Erro ao ler arquivo:', err);
            toast.error('Não foi possível ler o arquivo. Verifique o formato enviado.');
        } finally {
            setParsing(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    // Manipuladores de Drag & Drop para o Modal Inteiro
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (file) {
            await processFile(file);
        }
    };

    /** Analisador de Texto Livre / Texto Copiado com IA */
    const handleAnalyzeText = async () => {
        if (!rawText.trim()) {
            toast.error('Por favor, cole um texto ou lista com os dados dos veículos.');
            return;
        }

        setParsing(true);
        setFileName('Texto / Lista Copiada');

        try {
            const rawRows = await resolveRowsFromText(rawText);
            const validated = processRowsWithAI(rawRows);
            setParsedRows(validated);

            if (validated.length === 0) {
                toast.error('Nenhum dado válido extraído do texto colado.');
            } else {
                const validCount = validated.filter((r) => r.status !== 'error').length;
                toast.success(`${validated.length} veículo(s) identificados e organizados pela IA (${validCount} válidos).`);
            }
        } catch (err) {
            console.error('Erro ao analisar texto:', err);
            toast.error('Erro ao processar o texto colado.');
        } finally {
            setParsing(false);
        }
    };

    // Processamento da importação no Supabase
    const handleExecuteImport = async () => {
        const validRows = parsedRows.filter((r) => r.status !== 'error');
        if (validRows.length === 0) {
            toast.error('Não há veículos válidos para importar.');
            return;
        }

        setImporting(true);
        setProgress({ current: 0, total: validRows.length });

        let successCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        let failCount = 0;
        const failReasons: string[] = [];

        // vazio = null/undefined/string em branco (para saber o que completar num veículo existente)
        const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

        for (let i = 0; i < validRows.length; i++) {
            const r = validRows[i];
            try {
                if (r.action === 'update' && r.existingVehicleId) {
                    // Veículo já cadastrado: completa SOMENTE os campos que estão vazios hoje.
                    const existing = knownVehicles.find((v) => v.id === r.existingVehicleId);
                    const patch: TablesUpdate<'vehicles'> = {};

                    if (isEmpty(existing?.brand) && r.brand?.trim()) patch.brand = r.brand.trim();
                    if (isEmpty(existing?.model) && r.model?.trim()) patch.model = r.model.trim();
                    if (existing?.year == null && r.year) patch.year = r.year;
                    if (isEmpty(existing?.color) && r.color?.trim()) patch.color = r.color.trim();
                    if (existing?.fuel_type == null && r.fuelType) patch.fuel_type = r.fuelType as unknown as TablesUpdate<'vehicles'>['fuel_type'];
                    if (!existing?.tank_capacity && r.tankCapacity) patch.tank_capacity = r.tankCapacity;
                    if (!existing?.current_odometer && r.currentOdometer) patch.current_odometer = r.currentOdometer;
                    if (!existing?.department_id && r.departmentId) patch.department_id = r.departmentId;
                    if (isEmpty(existing?.renavam) && r.renavam?.trim()) patch.renavam = r.renavam.trim();
                    if (isEmpty(existing?.chassis) && r.chassis?.trim()) patch.chassis = r.chassis.trim();

                    if (Object.keys(patch).length === 0) {
                        skippedCount++;
                    } else {
                        await vehiclesApi.update(r.existingVehicleId, patch);
                        updatedCount++;
                    }
                } else {
                    await vehiclesApi.create({
                        // unit_code é NOT NULL no banco; segue o mesmo padrão do cadastro manual (placa normalizada).
                        unit_code: r.plate,
                        qr_code: r.plate,
                        plate: r.plate,
                        brand: r.brand?.trim() || null,
                        model: r.model?.trim() || null,
                        year: r.year ?? null,
                        color: r.color ?? null,
                        fuel_type: r.fuelType,
                        tank_capacity: r.tankCapacity,
                        current_odometer: r.currentOdometer,
                        department_id: r.departmentId ?? null,
                        renavam: r.renavam ?? null,
                        chassis: r.chassis ?? null,
                        status: 'AVAILABLE',
                    });
                    successCount++;
                }
            } catch (err) {
                console.error(`Erro ao importar placa ${r.plate}:`, err);
                failCount++;
                const raw = (err as { message?: string })?.message ?? 'Erro desconhecido';
                // Traduz os erros de banco mais comuns para algo acionável pelo gestor.
                const friendly = /duplicate key|already exists|unique constraint/i.test(raw)
                    ? `Placa ${formatPlate(r.plate) || r.plate} já existe no sistema`
                    : `${formatPlate(r.plate) || r.plate}: ${raw}`;
                if (!failReasons.includes(friendly)) failReasons.push(friendly);
            }
            setProgress({ current: i + 1, total: validRows.length });
        }

        queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        setImporting(false);

        if (successCount > 0 || updatedCount > 0 || skippedCount > 0) {
            const partes: string[] = [];
            if (successCount > 0) partes.push(`${successCount} cadastrado(s)`);
            if (updatedCount > 0) partes.push(`${updatedCount} atualizado(s)`);
            if (skippedCount > 0) partes.push(`${skippedCount} já completo(s)`);
            toast.success(`Importação concluída: ${partes.join(', ')}.`);
            if (failCount > 0) {
                toast.error(`${failCount} com falha. Motivo: ${failReasons.slice(0, 2).join(' | ')}`, { duration: 10000 });
            }
            handleClose();
        } else {
            toast.error(`Nenhum veículo importado. Motivo: ${failReasons.slice(0, 2).join(' | ') || 'erro desconhecido'}`, { duration: 12000 });
        }
    };

    const validCount = useMemo(() => parsedRows.filter((r) => r.status !== 'error').length, [parsedRows]);
    const createCount = useMemo(() => parsedRows.filter((r) => r.status !== 'error' && r.action === 'create').length, [parsedRows]);
    const updateCount = useMemo(() => parsedRows.filter((r) => r.status !== 'error' && r.action === 'update').length, [parsedRows]);
    const errorCount = useMemo(() => parsedRows.filter((r) => r.status === 'error').length, [parsedRows]);
    const warningCount = useMemo(() => parsedRows.filter((r) => r.status === 'warning').length, [parsedRows]);

    const displayedRows = useMemo(() => {
        if (filterMode === 'valid') return parsedRows.filter((r) => r.status !== 'error');
        if (filterMode === 'error') return parsedRows.filter((r) => r.status === 'error');
        return parsedRows;
    }, [parsedRows, filterMode]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Importar Veículos via Planilha"
            description="Envie um arquivo Excel (.xlsx), CSV (.csv) ou PDF (.pdf). Só a placa é obrigatória — veículos já cadastrados têm apenas os campos vazios completados, e você pode revisar e editar tudo antes de importar."
            size="full"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={handleClose} disabled={importing}>
                        Cancelar
                    </SGFButton>

                    {parsedRows.length > 0 ? (
                        <div className="flex items-center gap-2">
                            <SGFButton variant="outline" onClick={resetState} disabled={importing}>
                                Escolher outro arquivo
                            </SGFButton>
                            <SGFButton onClick={handleExecuteImport} loading={importing} disabled={validCount === 0 || importing}>
                                {importing
                                    ? `Importando (${progress.current}/${progress.total})...`
                                    : `Importar ${validCount}${updateCount > 0 ? ` (${createCount} novo(s), ${updateCount} a completar)` : ' Veículo(s)'}`}
                            </SGFButton>
                        </div>
                    ) : null}
                </ModalFooter>
            )}
        >
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className="relative space-y-6 min-h-[360px]"
            >
                {/* Drag and Drop Full Overlay Indicator */}
                {isDragging && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3.5 rounded-2xl border-3 border-dashed border-emerald-500 bg-emerald-50/95 p-6 backdrop-blur-xs transition-all animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg animate-bounce">
                            <Upload className="h-8 w-8" />
                        </div>
                        <p className="text-base font-bold text-emerald-900">Solte a planilha aqui para analisar e importar</p>
                        <p className="text-xs font-semibold text-emerald-700">A IA lerá os dados e organizará os campos automaticamente</p>
                    </div>
                )}
                {/* SELETOR DE MODO DE ANÁLISE POR IA */}
                <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-purple-50/80 p-3.5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                            <Sparkles className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                <span>Organização Inteligente com IA</span>
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 uppercase tracking-wide">Ativa</span>
                            </p>
                            <p className="text-[11px] text-slate-600">Mapeia colunas personalizadas, corrige marcas/modelos e limpa dados automaticamente.</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setUseAi(!useAi)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${useAi ? 'bg-emerald-600' : 'bg-slate-300'}`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useAi ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                    </button>
                </div>

                {/* ABA DE SELEÇÃO: ARQUIVO OU TEXTO */}
                {parsedRows.length === 0 && (
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                        <button
                            type="button"
                            onClick={() => setInputMode('file')}
                            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                                inputMode === 'file'
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            <FileSpreadsheet className="h-4 w-4" />
                            <span>Subir Arquivo / Arrastar</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setInputMode('text')}
                            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                                inputMode === 'text'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            <Sparkles className="h-4 w-4 text-amber-300" />
                            <span>Colar Texto / Lista com IA</span>
                        </button>
                    </div>
                )}

                {/* ETAPA 1: SELEÇÃO DE ARQUIVO OU COLAR TEXTO */}
                {parsedRows.length === 0 ? (
                    inputMode === 'text' ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-2">
                                <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                                    <Sparkles className="h-4 w-4 text-emerald-600" />
                                    <span>Colar Texto Livre para Análise da IA</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    Cole abaixo dados copiados de conversas, e-mails, relatórios ou tabelas do Excel/Word.
                                    A <strong>IA</strong> identificará as placas, marcas, modelos, secretarias e quilometragens automaticamente.
                                </p>
                            </div>

                            <textarea
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                rows={7}
                                placeholder={`Cole o texto ou lista de veículos aqui...\n\nExemplo:\nABC1D23 | Fiat Argo 1.0 | 2023 | Flex | Secretaria de Obras | 15.400 km\nXYZ9876 Volkswagen Gol 1.6 Gasolina Saude 42000 km`}
                                className="w-full rounded-2xl border border-slate-200 p-4 text-xs font-mono text-slate-800 shadow-sm outline-none transition hover:border-emerald-500/50 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 placeholder:text-slate-400"
                            />

                            <div className="flex justify-end">
                                <SGFButton
                                    type="button"
                                    onClick={handleAnalyzeText}
                                    loading={parsing}
                                    icon={Sparkles}
                                    disabled={!rawText.trim() || parsing}
                                    className="!rounded-full"
                                >
                                    {parsing ? 'Analisando Texto com IA...' : 'Analisar e Organizar Texto com IA'}
                                </SGFButton>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Orientações + Downloads */}
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
                                        <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                                        <span>Planilhas Suportadas & Modelos:</span>
                                    </div>
                                    <span className="text-xs font-medium text-slate-500">Aceita Excel (.xlsx), CSV (.csv) ou PDF (.pdf)</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    Você pode enviar relatórios em <strong>PDF</strong>, planilhas no modelo oficial do SGF ou planilhas próprias.
                                    A <strong>IA</strong> lerá o arquivo e organizará os campos automaticamente.
                                </p>

                                <div className="pt-2 flex flex-wrap items-center gap-3">
                                    <SGFButton type="button" variant="outline" size="sm" onClick={downloadExcelTemplate} icon={Download} className="bg-white">
                                        Baixar Modelo Excel (.xlsx)
                                    </SGFButton>
                                    <SGFButton type="button" variant="outline" size="sm" onClick={downloadCsvTemplate} icon={FileText} className="bg-white">
                                        Baixar Modelo CSV (.csv)
                                    </SGFButton>
                                </div>
                            </div>

                            {/* Dropzone / Upload area */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-10 text-center transition-all hover:border-emerald-500 hover:bg-emerald-50/20 cursor-pointer group"
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls,.csv,.pdf"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                                {parsing ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                                        <p className="text-sm font-semibold text-slate-700">A IA está lendo e organizando os dados da planilha...</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 group-hover:scale-105 group-hover:ring-emerald-400 transition-all">
                                            <Upload className="h-7 w-7 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">Clique para selecionar o arquivo</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Suba a planilha editada no modelo ou seu próprio arquivo</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                ) : (
                    /* ETAPA 2: PREVIEW E CONFERÊNCIA DOS DADOS ANALISADOS */
                    <div className="space-y-4">
                        {/* Banner da Análise por IA */}
                        {useAi && aiOrganizedCount > 0 && (
                            <div className="flex items-center gap-2.5 rounded-xl border border-purple-200 bg-purple-50/80 p-3 text-xs font-semibold text-purple-900">
                                <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />
                                <span>A IA analisou e organizou automaticamente {aiOrganizedCount} campo(s) na planilha para evitar erros de importação!</span>
                            </div>
                        )}

                        {/* Instruções de conferência/edição */}
                        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                                Confira e <strong>edite qualquer campo</strong> direto na tabela antes de importar.
                                Só a <strong>placa</strong> é obrigatória.
                                {updateCount > 0 && (
                                    <> As linhas marcadas como <strong className="text-blue-700">Completar</strong> já existem na frota — nelas, apenas os campos hoje vazios serão preenchidos (nada é sobrescrito).</>
                                )}
                            </span>
                        </div>

                        {/* Resumo do Arquivo */}
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                                    <FileSpreadsheet className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-900">{fileName}</p>
                                    <p className="text-xs text-slate-500">{parsedRows.length} veículo(s) identificados e conferidos</p>
                                </div>
                            </div>

                            {/* Badges de Contagem */}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFilterMode('all')}
                                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                                >
                                    Todos ({parsedRows.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilterMode('valid')}
                                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'valid' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}
                                >
                                    Válidos ({validCount})
                                </button>
                                {errorCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setFilterMode('error')}
                                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'error' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}
                                    >
                                        Erros ({errorCount})
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Barra de Progresso de Importação */}
                        {importing && (
                            <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                                <div className="flex justify-between text-xs font-bold text-emerald-800">
                                    <span>Importando veículos...</span>
                                    <span>{progress.current} / {progress.total}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200">
                                    <div
                                        className="h-full bg-emerald-600 transition-all duration-200"
                                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Tabela de Preview */}
                        <div className="max-h-[420px] w-full overflow-x-scroll overflow-y-auto rounded-2xl border border-slate-200 bg-white custom-scrollbar">
                            <table className="w-full min-w-[1750px] text-left text-xs text-slate-700">
                                <thead className="sticky top-0 bg-slate-100/95 text-slate-500 font-semibold uppercase backdrop-blur-sm border-b border-slate-200">
                                    <tr>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Linha</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Ação</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Placa *</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Marca</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Modelo</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Ano</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Cor</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Combustível</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Secretaria</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Tanque (L)</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Odômetro (km)</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">RENAVAM</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Chassi</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">Observações / Ajustes da IA</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {displayedRows.map((r) => (
                                        <tr
                                            key={r.rowIndex}
                                            className={
                                                r.status === 'error'
                                                    ? 'bg-rose-50/50 hover:bg-rose-50'
                                                    : r.status === 'warning'
                                                    ? 'bg-amber-50/40 hover:bg-amber-50'
                                                    : 'hover:bg-slate-50'
                                            }
                                        >
                                            <td className="py-2.5 px-3 font-mono font-medium text-slate-400 whitespace-nowrap">#{r.rowIndex}</td>
                                            <td className="py-2.5 px-3 whitespace-nowrap">
                                                {r.status === 'valid' && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                                        <CheckCircle className="h-3 w-3" /> OK
                                                    </span>
                                                )}
                                                {r.status === 'warning' && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                                                        <AlertTriangle className="h-3 w-3" /> Aviso
                                                    </span>
                                                )}
                                                {r.status === 'error' && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                                                        <XCircle className="h-3 w-3" /> Erro
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap">
                                                {r.action === 'update' ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                                                        <RefreshCw className="h-3 w-3" /> Completar
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                                        <Car className="h-3 w-3" /> Novo
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    value={r.plate}
                                                    onChange={(e) => updateRow(r.rowIndex, { plate: e.target.value })}
                                                    disabled={importing}
                                                    placeholder="ABC1D23"
                                                    className={`${CELL_INPUT} w-[110px] font-mono font-bold uppercase`}
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    value={r.brand ?? ''}
                                                    onChange={(e) => updateRow(r.rowIndex, { brand: e.target.value })}
                                                    disabled={importing}
                                                    placeholder="Marca"
                                                    className={`${CELL_INPUT} w-[130px]`}
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    value={r.model ?? ''}
                                                    onChange={(e) => updateRow(r.rowIndex, { model: e.target.value })}
                                                    disabled={importing}
                                                    placeholder="Modelo"
                                                    className={`${CELL_INPUT} w-[160px]`}
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    type="number"
                                                    value={r.year ?? ''}
                                                    onChange={(e) => updateRow(r.rowIndex, { year: e.target.value ? Number(e.target.value) : undefined })}
                                                    disabled={importing}
                                                    placeholder="Ano"
                                                    className={`${CELL_INPUT} w-[80px] font-mono`}
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    value={r.color ?? ''}
                                                    onChange={(e) => updateRow(r.rowIndex, { color: e.target.value })}
                                                    disabled={importing}
                                                    placeholder="Cor"
                                                    className={`${CELL_INPUT} w-[100px]`}
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <select
                                                    value={r.fuelType}
                                                    onChange={(e) => updateRow(r.rowIndex, { fuelType: e.target.value as ParsedVehicleRow['fuelType'] })}
                                                    disabled={importing}
                                                    className={`${CELL_INPUT} w-[110px]`}
                                                >
                                                    <option value="FLEX">Flex</option>
                                                    <option value="GASOLINE">Gasolina</option>
                                                    <option value="ETHANOL">Etanol</option>
                                                    <option value="DIESEL">Diesel</option>
                                                    <option value="GNV">GNV</option>
                                                </select>
                                            </td>
                                            <td className="py-2 px-2">
                                                <select
                                                    value={r.departmentName ?? ''}
                                                    onChange={(e) => updateRow(r.rowIndex, { departmentName: e.target.value || undefined })}
                                                    disabled={importing}
                                                    className={`${CELL_INPUT} w-[180px]`}
                                                >
                                                    <option value="">— Sem secretaria —</option>
                                                    {departments.map((d) => (
                                                        <option key={d.id} value={d.name}>{d.name}</option>
                                                    ))}
                                                    {r.departmentName && !departments.some((d) => d.name === r.departmentName) && (
                                                        <option value={r.departmentName}>{r.departmentName} (não cadastrada)</option>
                                                    )}
                                                </select>
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    type="number"
                                                    value={r.tankCapacity || ''}
                                                    onChange={(e) => updateRow(r.rowIndex, { tankCapacity: Number(e.target.value) || 0 })}
                                                    disabled={importing}
                                                    className={`${CELL_INPUT} w-[80px] font-mono`}
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    type="number"
                                                    value={r.currentOdometer || ''}
                                                    onChange={(e) => updateRow(r.rowIndex, { currentOdometer: Number(e.target.value) || 0 })}
                                                    disabled={importing}
                                                    className={`${CELL_INPUT} w-[100px] font-mono`}
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    value={r.renavam ?? ''}
                                                    onChange={(e) => updateRow(r.rowIndex, { renavam: e.target.value })}
                                                    disabled={importing}
                                                    placeholder="RENAVAM"
                                                    className={`${CELL_INPUT} w-[130px] font-mono`}
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    value={r.chassis ?? ''}
                                                    onChange={(e) => updateRow(r.rowIndex, { chassis: e.target.value })}
                                                    disabled={importing}
                                                    placeholder="Chassi"
                                                    className={`${CELL_INPUT} w-[170px] font-mono`}
                                                />
                                            </td>
                                            <td className="py-2.5 px-3 min-w-[280px]">
                                                <div className="flex flex-col gap-0.5">
                                                    {r.issues.length > 0 && (
                                                        <span className={r.status === 'error' ? 'text-rose-600 font-semibold' : 'text-amber-600'}>
                                                            {r.issues.join('; ')}
                                                        </span>
                                                    )}
                                                    {r.aiOrganized && r.aiNotes && r.aiNotes.length > 0 && (
                                                        <span className="text-[11px] font-medium text-purple-700 flex items-center gap-1">
                                                            <Sparkles className="h-3 w-3 text-purple-500 shrink-0" />
                                                            {r.aiNotes.join('; ')}
                                                        </span>
                                                    )}
                                                    {!r.issues.length && !r.aiOrganized && (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

export default ImportVehiclesModal;
