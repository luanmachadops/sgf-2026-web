import ExcelJS from 'exceljs';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from './supabase';

export type DriverImportRow = {
    name: string;
    cpf: string;
    registrationNumber?: string;
};

pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;

const clean = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();

async function invokeDriverExtractor(payload: { text?: string; images?: string[] }): Promise<DriverImportRow[]> {
    const { data, error } = await supabase.functions.invoke('drivers-import-extract', { body: payload });
    if (error) {
        const context = (error as { context?: { body?: { error?: string } } }).context;
        throw new Error(context?.body?.error ?? error.message ?? 'Falha na organização inteligente.');
    }
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

    return ((data as { data?: Array<Record<string, unknown>> })?.data ?? [])
        .map((row) => ({
            name: clean(row.name),
            cpf: clean(row.cpf).replace(/\D/g, ''),
            registrationNumber: clean(row.registrationNumber) || undefined,
        }))
        .filter((row) => row.name || row.cpf);
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
    const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items
            .map((item) => 'str' in item ? item.str : '')
            .filter(Boolean)
            .join(' '));
    }
    return pages.join('\n');
}

async function renderPdfImages(buffer: ArrayBuffer, maxPages = 12): Promise<string[]> {
    const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
    const images: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, maxPages); pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport, canvas } as never).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.82));
    }
    return images;
}

function imageToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
        reader.readAsDataURL(file);
    });
}

function rowsFromWorksheet(workbook: ExcelJS.Workbook): DriverImportRow[] {
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, column) => {
        headers[column] = clean(cell.value).toLowerCase();
    });
    const findColumn = (aliases: string[]) => headers.findIndex((header) => aliases.includes(header));
    const nameColumn = findColumn(['nome', 'name', 'motorista', 'nome completo']);
    const cpfColumn = findColumn(['cpf', 'documento']);
    const registrationColumn = findColumn(['matricula', 'matrícula', 'registration', 'registro']);
    const rows: DriverImportRow[] = [];
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const value = (column: number) => column > 0 ? clean(row.getCell(column).value) : '';
        const item = {
            name: value(nameColumn),
            cpf: value(cpfColumn).replace(/\D/g, ''),
            registrationNumber: value(registrationColumn) || undefined,
        };
        if (item.name || item.cpf) rows.push(item);
    });
    return rows;
}

export async function organizeDriverImportFile(file: File, useAI = true): Promise<DriverImportRow[]> {
    if (file.size > 15 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 15 MB.');
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (file.type.startsWith('image/')) {
        if (!useAI) throw new Error('Ative a organização com IA para ler imagens.');
        return invokeDriverExtractor({ images: [await imageToDataUrl(file)] });
    }

    if (extension === 'pdf' || file.type.includes('pdf')) {
        const buffer = await file.arrayBuffer();
        const text = await extractPdfText(buffer);
        if (text.trim().length > 30) {
            return useAI ? invokeDriverExtractor({ text }) : [];
        }
        if (!useAI) throw new Error('Este PDF é digitalizado. Ative a organização com IA.');
        return invokeDriverExtractor({ images: await renderPdfImages(buffer) });
    }

    if (extension === 'xlsx' || extension === 'xls') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const localRows = rowsFromWorksheet(workbook);
        if (!useAI || localRows.length > 0) return localRows;
        throw new Error('Não encontrei as colunas nome, CPF e matrícula na planilha.');
    }

    const text = await file.text();
    return useAI ? invokeDriverExtractor({ text }) : [];
}
