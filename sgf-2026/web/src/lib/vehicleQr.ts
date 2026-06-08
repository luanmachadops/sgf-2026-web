import QRCodeStyling, { type Options } from 'qr-code-styling';

// Cores do app (design system SGF)
const PRIMARY_DARK = '#0F2B2F';
const PRIMARY_GREEN = '#00A86B';

/**
 * Opções do QR estilizado do veículo. O conteúdo é a PLACA (o app lê por placa).
 * Gradiente escuro→verde + pontos/cantos arredondados, sobre fundo branco e
 * correção de erro ALTA (H) — bonito e na identidade do app, sem perder leitura.
 */
export function vehicleQrOptions(plate: string, size = 240, type: 'canvas' | 'svg' = 'canvas'): Options {
    return {
        width: size,
        height: size,
        type,
        data: (plate || '').toUpperCase(),
        margin: Math.max(8, Math.round(size * 0.06)),
        qrOptions: { errorCorrectionLevel: 'H' },
        backgroundOptions: { color: '#FFFFFF' },
        dotsOptions: {
            type: 'rounded',
            gradient: {
                type: 'linear',
                rotation: Math.PI / 4,
                colorStops: [
                    { offset: 0, color: PRIMARY_DARK },
                    { offset: 1, color: PRIMARY_GREEN },
                ],
            },
        },
        cornersSquareOptions: { type: 'extra-rounded', color: PRIMARY_DARK },
        cornersDotOptions: { type: 'dot', color: PRIMARY_GREEN },
    };
}

/** Cria uma instância nova do QR estilizado (para anexar a um nó ou baixar). */
export function createVehicleQr(plate: string, size = 240, type: 'canvas' | 'svg' = 'canvas') {
    return new QRCodeStyling(vehicleQrOptions(plate, size, type));
}

/** Baixa o QR do veículo como PNG em alta resolução. */
export async function downloadVehicleQr(plate: string, size = 1024) {
    const qr = createVehicleQr(plate, size, 'canvas');
    await qr.download({ name: `qr-${(plate || 'veiculo').toUpperCase()}`, extension: 'png' });
}
