import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Sparkles, Camera, Loader2, X } from '@/components/sgf/icons';
import { extractVehicleWithPhotos, type ExtractWithPhotosResult, type VehiclePhotoSlot } from '@/lib/vehicleAI';
import { isImageFile } from '@/lib/imageUtils';

const SLOTS: { type: VehiclePhotoSlot; label: string; hint: string }[] = [
    { type: 'foto', label: 'Foto do veículo', hint: 'Visão geral' },
    { type: 'placa', label: 'Placa', hint: 'Foco na placa' },
    { type: 'documento', label: 'Documento (CRLV)', hint: 'Renavam/chassi' },
    { type: 'hodometro', label: 'Hodômetro', hint: 'Painel/odômetro' },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    vehicleId: string;
    onResult: (result: ExtractWithPhotosResult) => Promise<void> | void;
}

export function VehicleAIModal({ isOpen, onClose, vehicleId, onResult }: Props) {
    const [files, setFiles] = useState<Partial<Record<VehiclePhotoSlot, File>>>({});
    const [previews, setPreviews] = useState<Partial<Record<VehiclePhotoSlot, string>>>({});
    const [busy, setBusy] = useState(false);
    const refs = useRef<Record<string, HTMLInputElement | null>>({});

    const pick = (type: VehiclePhotoSlot, file?: File) => {
        if (!file) return;
        if (!isImageFile(file)) { toast.error('Selecione uma imagem válida.'); return; }
        setFiles((f) => ({ ...f, [type]: file }));
        setPreviews((p) => ({ ...p, [type]: URL.createObjectURL(file) }));
    };
    const clear = (type: VehiclePhotoSlot) => {
        setFiles((f) => { const n = { ...f }; delete n[type]; return n; });
        setPreviews((p) => { const n = { ...p }; delete n[type]; return n; });
    };

    const count = Object.keys(files).length;

    const analyze = async () => {
        const slots = (Object.keys(files) as VehiclePhotoSlot[]).map((type) => ({ type, file: files[type]! }));
        if (slots.length === 0) { toast.error('Adicione ao menos uma foto.'); return; }
        setBusy(true);
        try {
            const result = await extractVehicleWithPhotos(slots, vehicleId);
            await onResult(result);
            toast.success('Dados extraídos e aplicados.');
            setFiles({}); setPreviews({});
            onClose();
        } catch (e) {
            toast.error((e as { message?: string })?.message ?? 'Falha na análise por IA.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Preencher com IA"
            description="Envie as fotos do veículo, placa, documento e hodômetro. A IA extrai os dados e o odômetro."
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose} disabled={busy}>Cancelar</SGFButton>
                    <SGFButton icon={busy ? Loader2 : Sparkles} onClick={analyze} disabled={busy || count === 0}>
                        {busy ? 'Analisando...' : `Analisar ${count} foto${count === 1 ? '' : 's'}`}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {SLOTS.map((slot) => {
                    const preview = previews[slot.type];
                    return (
                        <div key={slot.type} className="flex flex-col gap-2">
                            <div
                                className="relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-emerald-300"
                                onClick={() => refs.current[slot.type]?.click()}
                            >
                                {preview ? (
                                    <>
                                        <img src={preview} alt={slot.label} className="h-full w-full object-cover" />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); clear(slot.type); }}
                                            className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-1 text-slate-400">
                                        <Camera className="h-6 w-6" />
                                        <span className="text-[10px] font-semibold">{slot.hint}</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-center text-[11px] font-semibold text-slate-600">{slot.label}</p>
                            <input
                                ref={(el) => { refs.current[slot.type] = el; }}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => pick(slot.type, e.target.files?.[0])}
                            />
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}

export default VehicleAIModal;
