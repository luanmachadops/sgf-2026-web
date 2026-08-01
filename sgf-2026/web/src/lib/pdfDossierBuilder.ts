import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase } from './supabase';
import { resolveDocUrl } from './docStorage';
import { formatCurrency, formatDate, formatRoleLabel, maskCpfLGPD } from './utils';

export interface DossierOptions {
    orderId: string;
}

export interface DossierResult {
    blob: Blob;
    url: string;
    filename: string;
    protocolNumber: string;
}

/**
 * Baixa um recurso binário a partir de uma URL ou path privado do storage.
 */
async function fetchArrayBuffer(pathOrUrl: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
    try {
        const url = await resolveDocUrl(pathOrUrl);
        if (!url) return null;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const contentType = resp.headers.get('content-type') || '';
        const bytes = await resp.arrayBuffer();
        return { bytes, contentType };
    } catch (err) {
        console.warn('Erro ao buscar documento para o dossiê:', pathOrUrl, err);
        return null;
    }
}

/**
 * Constrói o PDF Consolidado (Capa + Anexos PDF + Fotos) para a Ordem de Serviço.
 */
export async function generateServiceOrderDossier(orderId: string): Promise<DossierResult> {
    // 1. Buscar dados completos da OS
    const { data: os, error: osError } = await supabase
        .from('service_orders')
        .select(`
            *,
            vehicles (plate, brand, model, department_id, departments (name)),
            driver:profiles!service_orders_driver_id_fkey (full_name, cpf, role, department, departments (name)),
            approver:profiles!service_orders_approved_by_fkey (full_name, cpf, role, department, departments (name)),
            repair_shops (name, cnpj, phone)
        `)
        .eq('id', orderId)
        .single();

    if (osError || !os) {
        throw new Error(`Não foi possível localizar os dados da ordem de serviço: ${osError?.message ?? 'registro não encontrado'}`);
    }

    // Buscar dados da prefeitura/tenant
    const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', os.tenant_id)
        .maybeSingle();

    const driverObj = os.driver as { full_name?: string; cpf?: string; role?: string; department?: string; departments?: { name?: string } } | null;
    const approverObj = os.approver as { full_name?: string; cpf?: string; role?: string; department?: string; departments?: { name?: string } } | null;
    const vehicleObj = os.vehicles as { plate?: string; brand?: string; model?: string; departments?: { name?: string } | null } | null;
    const shopObj = os.repair_shops as { name?: string; cnpj?: string; phone?: string } | null;

    // Buscar orçamentos e itens
    const { data: quotesData } = await supabase
        .from('service_order_quotes')
        .select('*, service_order_quote_items(*)')
        .eq('service_order_id', orderId)
        .order('version', { ascending: false });

    // Buscar notas fiscais
    const { data: invoicesData } = await supabase
        .from('service_order_invoices')
        .select('*')
        .eq('service_order_id', orderId)
        .order('issued_at', { ascending: false });

    // Buscar pagamentos
    const { data: paymentsData } = await supabase
        .from('service_order_payments')
        .select('*')
        .eq('service_order_id', orderId)
        .order('paid_at', { ascending: false });

    const protocolNumber = os.commitment_number
        ? `OS-${os.id.slice(0, 8).toUpperCase()}`
        : `PROCESSO-${os.id.slice(0, 8).toUpperCase()}`;

    const plate = vehicleObj?.plate ?? 'VEICULO';
    const filename = `PROCESSO_${protocolNumber}_PLACA_${plate}.pdf`;

    // 2. Iniciar pdf-lib mestre
    const masterPdf = await PDFDocument.create();

    const fontRegular = await masterPdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);

    // DADOS PARA A CAPA (A4: 595.28 x 841.89)
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 36;
    const contentWidth = pageWidth - (margin * 2);

    const coverPage = masterPdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // Tentar carregar a logo do município se existir
    let logoImage;
    const logoPath = tenant?.seal_url || tenant?.logo_url;
    if (logoPath) {
        const fetchedLogo = await fetchArrayBuffer(logoPath);
        if (fetchedLogo?.bytes) {
            try {
                if (fetchedLogo.contentType.includes('png') || logoPath.endsWith('.png')) {
                    logoImage = await masterPdf.embedPng(fetchedLogo.bytes);
                } else {
                    logoImage = await masterPdf.embedJpg(fetchedLogo.bytes);
                }
            } catch (err) {
                console.warn('Erro ao embutir logo do município no PDF:', err);
            }
        }
    }

    // Cabeçalho Principal (Timbre Institucional com Logo)
    const headerHeight = 65;
    coverPage.drawRectangle({
        x: margin,
        y: y - headerHeight,
        width: contentWidth,
        height: headerHeight,
        color: rgb(0.06, 0.17, 0.18), // #0F2B2F Primary Dark SGF
    });

    let textStartX = margin + 15;
    if (logoImage) {
        const logoH = 45;
        const logoW = (logoImage.width / logoImage.height) * logoH;
        coverPage.drawImage(logoImage, {
            x: margin + 10,
            y: y - headerHeight + 10,
            width: Math.min(logoW, 70),
            height: logoH,
        });
        textStartX = margin + Math.min(logoW, 70) + 20;
    }

    const munName = tenant?.name ? `PREFEITURA MUNICIPAL DE ${tenant.name.toUpperCase()}` : 'PREFEITURA MUNICIPAL';
    const stateUf = tenant?.state ? ` - ${tenant.state.toUpperCase()}` : '';

    coverPage.drawText(`${munName}${stateUf}`, {
        x: textStartX,
        y: y - 22,
        size: 12,
        font: fontBold,
        color: rgb(1, 1, 1),
    });

    coverPage.drawText('SISTEMA DE GESTÃO DE FROTAS MUNICIPAL - SGF 2026', {
        x: textStartX,
        y: y - 38,
        size: 10,
        font: fontBold,
        color: rgb(0.0, 0.85, 0.55), // Emerald
    });

    coverPage.drawText('DOSSIÊ ELETRÔNICO E PRESTAÇÃO DE CONTAS DE MANUTENÇÃO', {
        x: textStartX,
        y: y - 52,
        size: 9,
        font: fontRegular,
        color: rgb(0.85, 0.9, 0.95),
    });

    y -= headerHeight + 15;

    // Tarja de Identificação do Processo
    coverPage.drawRectangle({
        x: margin,
        y: y - 30,
        width: contentWidth,
        height: 30,
        color: rgb(0.96, 0.97, 0.98),
        borderColor: rgb(0.85, 0.88, 0.9),
        borderWidth: 1,
    });

    coverPage.drawText(`PROTOCOLO / O.S.: ${protocolNumber}`, {
        x: margin + 10,
        y: y - 20,
        size: 10,
        font: fontBold,
        color: rgb(0.06, 0.17, 0.18),
    });

    coverPage.drawText(`DATA DE EMISSÃO: ${formatDate(os.created_at)}`, {
        x: margin + 300,
        y: y - 20,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.35, 0.4),
    });

    y -= 45;

    // Função Auxiliar para Seções de Tabela
    const drawSectionHeader = (title: string) => {
        coverPage.drawRectangle({
            x: margin,
            y: y - 18,
            width: contentWidth,
            height: 18,
            color: rgb(0, 0.66, 0.42), // #00A86B Primary Green
        });
        coverPage.drawText(title.toUpperCase(), {
            x: margin + 8,
            y: y - 13,
            size: 9,
            font: fontBold,
            color: rgb(1, 1, 1),
        });
        y -= 24;
    };

    const drawGridRow = (items: { label: string; value: string }[]) => {
        const itemWidth = contentWidth / items.length;
        const rowHeight = 28;

        coverPage.drawRectangle({
            x: margin,
            y: y - rowHeight,
            width: contentWidth,
            height: rowHeight,
            color: rgb(0.98, 0.98, 0.99),
            borderColor: rgb(0.9, 0.92, 0.94),
            borderWidth: 0.5,
        });

        items.forEach((item, idx) => {
            const ix = margin + (idx * itemWidth) + 8;
            coverPage.drawText(item.label.toUpperCase(), {
                x: ix,
                y: y - 10,
                size: 7.5,
                font: fontBold,
                color: rgb(0.5, 0.55, 0.6),
            });
            coverPage.drawText(item.value || '—', {
                x: ix,
                y: y - 22,
                size: 9.5,
                font: fontRegular,
                color: rgb(0.1, 0.15, 0.2),
            });
        });
        y -= rowHeight + 4;
    };

    // 1. Identificação do Veículo & Condutor Solicitante
    drawSectionHeader('1. Identificação do Veículo & Condutor Solicitante');
    drawGridRow([
        { label: 'Placa do Veículo', value: vehicleObj?.plate ?? '—' },
        { label: 'Marca / Modelo', value: `${vehicleObj?.brand ?? ''} ${vehicleObj?.model ?? ''}`.trim() || '—' },
        { label: 'Secretaria / Setor', value: vehicleObj?.departments?.name ?? '—' },
    ]);

    const driverName = driverObj?.full_name ?? '—';
    const driverRole = formatRoleLabel(driverObj?.role);
    const driverCpf = maskCpfLGPD(driverObj?.cpf);
    const driverDept = driverObj?.departments?.name || driverObj?.department || vehicleObj?.departments?.name || '—';

    drawGridRow([
        { label: 'Hodômetro Entrada', value: os.odometer != null ? `${Number(os.odometer).toLocaleString('pt-BR')} km` : 'Não inf.' },
        { label: 'Motorista / Solicitante', value: `${driverName} (${driverRole})` },
        { label: 'CPF (LGPD) / Secretaria', value: `CPF: ${driverCpf} · ${driverDept}` },
    ]);

    y -= 6;

    // 2. Responsável Autorizador & Oficina Credenciada
    drawSectionHeader('2. Responsável pela Triagem / Autorização & Oficina');
    const approverName = approverObj?.full_name ?? 'Gestão de Frotas';
    const approverRole = formatRoleLabel(approverObj?.role ?? 'manager');
    const approverCpf = maskCpfLGPD(approverObj?.cpf);
    const approverDept = approverObj?.departments?.name || approverObj?.department || 'Gabinete / Frotas';

    drawGridRow([
        { label: 'Servidor Autorizador', value: `${approverName} (${approverRole})` },
        { label: 'CPF (LGPD) / Lotação', value: `CPF: ${approverCpf} · ${approverDept}` },
        { label: 'Prioridade da O.S.', value: String(os.priority ?? 'Média').toUpperCase() },
    ]);

    drawGridRow([
        { label: 'Oficina Credenciada', value: shopObj?.name ?? os.repair_shop ?? '—' },
        { label: 'CNPJ da Oficina', value: shopObj?.cnpj ?? 'Não informado' },
        { label: 'Status Operacional / Financeiro', value: `${String(os.operational_status ?? '').toUpperCase()} / ${String(os.financial_status ?? '').toUpperCase()}` },
    ]);

    // Relato da Avaria / Descrição
    if (os.description) {
        coverPage.drawRectangle({
            x: margin,
            y: y - 36,
            width: contentWidth,
            height: 36,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.9, 0.92, 0.94),
            borderWidth: 0.5,
        });
        coverPage.drawText('RELATO DE AVARIA / MOTIVO DA MANUTENÇÃO:', {
            x: margin + 8,
            y: y - 10,
            size: 7.5,
            font: fontBold,
            color: rgb(0.5, 0.55, 0.6),
        });
        const descText = os.description.length > 120 ? `${os.description.slice(0, 117)}...` : os.description;
        coverPage.drawText(descText, {
            x: margin + 8,
            y: y - 24,
            size: 9,
            font: fontRegular,
            color: rgb(0.2, 0.25, 0.3),
        });
        y -= 42;
    }

    y -= 6;

    // 3. Controle Fiscal, Empenho e Liquidação
    drawSectionHeader('3. Registro Fiscal, Empenho e Liquidação Contábil');
    const firstInvoice = invoicesData?.[0];
    const totalPayments = (paymentsData ?? []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

    drawGridRow([
        { label: 'Número do Empenho', value: os.commitment_number ?? 'Aguardando' },
        { label: 'Valor Empenhado / Total', value: formatCurrency(os.budget ?? os.cost ?? 0) },
        { label: 'Nota Fiscal (NF-e)', value: firstInvoice?.invoice_number ? `NF nº ${firstInvoice.invoice_number}` : 'Aguardando' },
    ]);
    drawGridRow([
        { label: 'Total Pago / Quitado', value: formatCurrency(totalPayments) },
        { label: 'Data da Liquidação', value: firstInvoice?.attested_at ? formatDate(firstInvoice.attested_at) : '—' },
        { label: 'Situação Contábil', value: totalPayments > 0 ? 'Quitado / Pago' : 'Em trâmite' },
    ]);

    y -= 6;

    // 4. Resumo do Orçamento / Peças
    const approvedQuote = quotesData?.find((q) => q.status === 'aprovado') || quotesData?.[0];
    const rawQuoteItems = (approvedQuote as { service_order_quote_items?: unknown[] } | null)?.service_order_quote_items;
    const quoteItems = Array.isArray(rawQuoteItems) ? rawQuoteItems : [];

    if (quoteItems.length > 0) {
        drawSectionHeader('4. Relação de Peças & Mão de Obra (Orçamento Aprovado)');

        // Cabeçalho da tabela de itens
        coverPage.drawRectangle({
            x: margin,
            y: y - 14,
            width: contentWidth,
            height: 14,
            color: rgb(0.93, 0.94, 0.96),
        });
        coverPage.drawText('TIPO', { x: margin + 6, y: y - 10, size: 7.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
        coverPage.drawText('DESCRIÇÃO DO ITEM / SERVIÇO', { x: margin + 60, y: y - 10, size: 7.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
        coverPage.drawText('QTD', { x: margin + 310, y: y - 10, size: 7.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
        coverPage.drawText('UNITÁRIO', { x: margin + 370, y: y - 10, size: 7.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
        coverPage.drawText('SUBTOTAL', { x: margin + 450, y: y - 10, size: 7.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
        y -= 16;

        // Linhas dos itens (limite de 5 para a capa)
        quoteItems.slice(0, 5).forEach((itemRaw) => {
            const item = itemRaw as { kind?: string; description?: string; unit_price?: number; qty?: number };
            const unit = Number(item.unit_price) || 0;
            const qty = Number(item.qty) || 1;
            const sub = unit * qty;

            coverPage.drawRectangle({
                x: margin,
                y: y - 14,
                width: contentWidth,
                height: 14,
                color: rgb(1, 1, 1),
                borderColor: rgb(0.95, 0.95, 0.95),
                borderWidth: 0.5,
            });

            coverPage.drawText(item.kind === 'peca' ? 'PEÇA' : 'SERVIÇO', { x: margin + 6, y: y - 10, size: 8, font: fontRegular });
            const itemDesc = item.description ?? '';
            const desc = itemDesc.length > 45 ? `${itemDesc.slice(0, 42)}...` : itemDesc;
            coverPage.drawText(desc, { x: margin + 60, y: y - 10, size: 8, font: fontRegular });
            coverPage.drawText(String(qty), { x: margin + 310, y: y - 10, size: 8, font: fontRegular });
            coverPage.drawText(formatCurrency(unit), { x: margin + 370, y: y - 10, size: 8, font: fontRegular });
            coverPage.drawText(formatCurrency(sub), { x: margin + 450, y: y - 10, size: 8, font: fontBold });
            y -= 15;
        });

        if (quoteItems.length > 5) {
            coverPage.drawText(`* e mais ${quoteItems.length - 5} item(ns) listados no orçamento anexo.`, {
                x: margin + 6,
                y: y - 8,
                size: 6.5,
                font: fontRegular,
                color: rgb(0.5, 0.5, 0.5),
            });
            y -= 12;
        }

        y -= 6;
    }

    // 5. Assinaturas e Autenticação no Rodapé da Capa
    const sigY = margin + 55;
    coverPage.drawLine({
        start: { x: margin, y: sigY + 30 },
        end: { x: margin + 150, y: sigY + 30 },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5),
    });
    coverPage.drawText('GESTOR DE FROTAS', { x: margin + 25, y: sigY + 18, size: 7, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
    coverPage.drawText('Responsável pela Autorização', { x: margin + 12, y: sigY + 8, size: 6, font: fontRegular, color: rgb(0.6, 0.6, 0.6) });

    coverPage.drawLine({
        start: { x: margin + 175, y: sigY + 30 },
        end: { x: margin + 325, y: sigY + 30 },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5),
    });
    coverPage.drawText('OFICINA CREDENCIADA', { x: margin + 195, y: sigY + 18, size: 7, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
    coverPage.drawText('Empresa Executora dos Serviços', { x: margin + 185, y: sigY + 8, size: 6, font: fontRegular, color: rgb(0.6, 0.6, 0.6) });

    coverPage.drawLine({
        start: { x: margin + 350, y: sigY + 30 },
        end: { x: margin + contentWidth, y: sigY + 30 },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5),
    });
    coverPage.drawText('CONTABILIDADE / LIQUIDAÇÃO', { x: margin + 360, y: sigY + 18, size: 7, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
    coverPage.drawText('Ateste de Recebimento / Pagamento', { x: margin + 355, y: sigY + 8, size: 6, font: fontRegular, color: rgb(0.6, 0.6, 0.6) });

    // Rodapé Solicitado: Apenas em texto simples com o nome do App e o site
    coverPage.drawText('SGF 2026 - Sistema de Gestão de Frotas Municipal | www.sgf2026.com.br', {
        x: margin,
        y: margin,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
    });

    // -------------------------------------------------------------
    // COLETAR ANEXOS (PDFs e Fotos)
    // -------------------------------------------------------------
    interface AttachmentItem {
        label: string;
        path: string;
    }

    const attachments: AttachmentItem[] = [];

    // Documento de Empenho
    if (os.commitment_document_path) {
        attachments.push({ label: 'Documento de Empenho / Reserva', path: os.commitment_document_path });
    }

    // Orçamentos em PDF / Imagem
    (quotesData ?? []).forEach((q: Record<string, unknown>, i) => {
        const p = (q.quote_document_path || q.file_path || q.document_path) as string | undefined;
        if (p) {
            attachments.push({ label: `Orçamento de Oficina (v${String(q.version ?? i + 1)})`, path: p });
        }
    });

    // Notas Fiscais
    (invoicesData ?? []).forEach((inv: Record<string, unknown>, i) => {
        const p = (inv.file_path || inv.invoice_document_path) as string | undefined;
        if (p) {
            attachments.push({ label: `Nota Fiscal nº ${String(inv.invoice_number || i + 1)}`, path: p });
        }
    });

    // Comprovantes de Pagamento
    (paymentsData ?? []).forEach((p: Record<string, unknown>, i) => {
        const path = (p.file_path || p.proof_document_path) as string | undefined;
        if (path) {
            attachments.push({ label: `Comprovante de Pagamento #${i + 1}`, path });
        }
    });

    // Processar cada anexo
    for (const att of attachments) {
        const fetched = await fetchArrayBuffer(att.path);
        if (!fetched || !fetched.bytes || fetched.bytes.byteLength === 0) continue;

        const isPdf = att.path.toLowerCase().endsWith('.pdf') ||
            fetched.contentType.includes('pdf') ||
            new Uint8Array(fetched.bytes.slice(0, 4)).toString() === '37,80,68,70'; // %PDF

        if (isPdf) {
            try {
                const subPdf = await PDFDocument.load(fetched.bytes, { ignoreEncryption: true });
                const pageIndices = subPdf.getPageIndices();
                const copiedPages = await masterPdf.copyPages(subPdf, pageIndices);

                copiedPages.forEach((subPage) => {
                    masterPdf.addPage(subPage);
                });
            } catch (pdfErr) {
                console.warn('Não foi possível mesclar PDF anexo:', att.label, pdfErr);
            }
        } else {
            // Imagem (JPG / PNG)
            try {
                let img;
                if (fetched.contentType.includes('png') || att.path.toLowerCase().endsWith('.png')) {
                    img = await masterPdf.embedPng(fetched.bytes);
                } else {
                    img = await masterPdf.embedJpg(fetched.bytes);
                }

                const imgPage = masterPdf.addPage([pageWidth, pageHeight]);

                // Cabeçalho da página de imagem
                imgPage.drawRectangle({
                    x: margin,
                    y: pageHeight - margin - 24,
                    width: contentWidth,
                    height: 24,
                    color: rgb(0.06, 0.17, 0.18),
                });
                imgPage.drawText(`ANEXO: ${att.label.toUpperCase()}`, {
                    x: margin + 10,
                    y: pageHeight - margin - 16,
                    size: 8.5,
                    font: fontBold,
                    color: rgb(1, 1, 1),
                });

                // Redimensionar e centralizar foto
                const maxImgW = contentWidth;
                const maxImgH = pageHeight - (margin * 2) - 40;
                const scale = Math.min(maxImgW / img.width, maxImgH / img.height, 1);
                const drawW = img.width * scale;
                const drawH = img.height * scale;
                const imgX = margin + ((contentWidth - drawW) / 2);
                const imgY = margin + ((maxImgH - drawH) / 2);

                imgPage.drawImage(img, {
                    x: imgX,
                    y: imgY,
                    width: drawW,
                    height: drawH,
                });
            } catch (imgErr) {
                console.warn('Não foi possível anexar imagem:', att.label, imgErr);
            }
        }
    }

    // 3. Salvar o PDF final
    const pdfBytes = await masterPdf.save();
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    return {
        blob,
        url,
        filename,
        protocolNumber,
    };
}
