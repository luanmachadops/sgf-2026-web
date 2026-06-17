import { useEffect, useRef } from 'react';
import type QRCodeStyling from 'qr-code-styling';
import { createVehicleQr, vehicleQrOptions } from '@/lib/vehicleQr';

interface StyledQrProps {
    value: string;
    size?: number;
    /** 'svg' é mais leve para impressão de muitas etiquetas; 'canvas' para preview/download. */
    type?: 'canvas' | 'svg';
    className?: string;
}

/** Renderiza o QR estilizado do veículo (placa) num container. */
export function StyledQr({ value, size = 240, type = 'canvas', className }: StyledQrProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const qrRef = useRef<QRCodeStyling | null>(null);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        if (!qrRef.current) {
            qrRef.current = createVehicleQr(value, size, type);
            node.innerHTML = '';
            qrRef.current.append(node);
        } else {
            qrRef.current.update(vehicleQrOptions(value, size, type));
        }
    }, [value, size, type]);

    return <div ref={containerRef} className={className} style={{ width: size, height: size }} />;
}
