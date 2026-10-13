import { useEffect, useRef } from 'react';
import type QRCodeStyling from 'qr-code-styling';
import { createVehicleQr, vehicleQrOptions } from '@/lib/vehicleQr';

interface StyledQrProps {
    value: string;
    size?: number;
    /** 'svg' é mais leve para impressão de muitas etiquetas; 'canvas' para preview/download. */
    type?: 'canvas' | 'svg';
    className?: string;
    /** Margem branca em fração do lado (padrão 6%). */
    marginRatio?: number;
}

/** Renderiza o QR estilizado do veículo (placa) num container. */
export function StyledQr({ value, size = 240, type = 'canvas', className, marginRatio = 0.06 }: StyledQrProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const qrRef = useRef<QRCodeStyling | null>(null);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        if (!qrRef.current) {
            qrRef.current = createVehicleQr(value, size, type, marginRatio);
            node.innerHTML = '';
            qrRef.current.append(node);
        } else {
            qrRef.current.update(vehicleQrOptions(value, size, type, marginRatio));
        }
    }, [value, size, type, marginRatio]);

    return <div ref={containerRef} className={className} style={{ width: size, height: size }} />;
}
