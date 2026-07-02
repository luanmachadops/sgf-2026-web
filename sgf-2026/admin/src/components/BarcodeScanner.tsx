import { useEffect, useRef, useState } from 'react';
import { X } from '@/components/sgf/icons';

/**
 * Leitor de código de barras / QR pela câmera. Usa a API nativa BarcodeDetector
 * (Chrome/Edge). Ao detectar, chama onDetect(valor) e fecha.
 */
export function BarcodeScanner({ open, onClose, onDetect }: {
  open: boolean; onClose: () => void; onDetect: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    setError(null);

    const supported = 'BarcodeDetector' in window;
    const video = videoRef.current;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        if (stopped || !video) { stream?.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        await video.play();

        if (!supported) {
          setError('Este navegador não suporta leitura automática (use o Chrome). Você pode digitar o IMEI manualmente.');
          return;
        }
        // @ts-expect-error BarcodeDetector não está nos tipos padrão
        const detector = new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'codabar', 'upc_a', 'data_matrix'],
        });
        const tick = async () => {
          if (stopped || !video) return;
          try {
            const codes = await detector.detect(video);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              onDetect(String(codes[0].rawValue).trim());
              return;
            }
          } catch { /* frame sem código */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError('Não foi possível acessar a câmera. Permita o acesso nas configurações do navegador.');
      }
    })();

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetect]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[5000] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Ler IMEI</h3>
            <p className="text-xs text-slate-500">Aponte a câmera para o código de barras ou QR do rastreador.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {/* moldura de mira */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-28 w-3/4 rounded-xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
        </div>
        {error && <p className="px-5 py-3 text-sm text-amber-700">{error}</p>}
        <div className="flex justify-end gap-2 px-5 py-3">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Fechar</button>
        </div>
      </div>
    </div>
  );
}

export default BarcodeScanner;
