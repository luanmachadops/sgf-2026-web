import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Camera, Loader2, FileText, X, Download } from '@/components/sgf/icons';
import { useCreateRepairShop, useUpdateRepairShop } from '@/hooks/useRepairShops';
import { uploadFoto } from '@/lib/fotoStorage';
import {
    resizeAndConvertToWebP, isImageFile, prepareDocumentUpload,
    formatFileSize, DOCUMENT_ACCEPT,
} from '@/lib/imageUtils';
import { maskCNPJ, maskPhone } from '@/lib/utils';
import type { Tables } from '@/types/database.types';

/** Especialidades usadas para direcionar a OS à oficina certa. */
const SPECIALTY_OPTIONS = [
    'Mecânica geral', 'Elétrica', 'Funilaria e pintura', 'Pneus e alinhamento',
    'Ar-condicionado', 'Suspensão', 'Injeção eletrônica', 'Tacógrafo',
];

type ShopDoc = { name: string; url: string; size?: number; uploadedAt?: string };

interface Props {
    isOpen: boolean;
    onClose: () => void;
    shop?: Tables<'repair_shops'> | null;
}

export function RepairShopFormModal({ isOpen, onClose, shop }: Props) {
    const isEditing = Boolean(shop);
    const qc = useQueryClient();

    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [cnpj, setCnpj] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [phone, setPhone] = useState('');
    const [contractNumber, setContractNumber] = useState('');
    const [contractStart, setContractStart] = useState('');
    const [contractEnd, setContractEnd] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [specialties, setSpecialties] = useState<string[]>([]);
    const [notes, setNotes] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [documents, setDocuments] = useState<ShopDoc[]>([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        setName(shop?.name ?? '');
        setCode(shop?.code ?? '');
        setCnpj(maskCNPJ(shop?.cnpj ?? ''));
        setAddress(shop?.address ?? '');
        setCity(shop?.city ?? '');
        setPhone(maskPhone(shop?.phone ?? ''));
        setContractNumber(shop?.contract_number ?? '');
        setContractStart(shop?.contract_start ?? '');
        setContractEnd(shop?.contract_end ?? '');
        setIsActive(shop?.is_active ?? true);
        setSpecialties(shop?.specialties ?? []);
        setNotes(shop?.notes ?? '');
        setPhotoUrl(shop?.photo_url ?? '');
        setDocuments(((shop?.documents ?? []) as unknown as ShopDoc[]) ?? []);
        setError(null);
    }, [isOpen, shop]);

    const createMut = useCreateRepairShop();
    const updateMut = useUpdateRepairShop(shop?.id ?? '');
    const isSaving = createMut.isPending || updateMut.isPending;

    const toggleSpecialty = (s: string) =>
        setSpecialties((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

    const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!isImageFile(file)) { toast.error('Selecione uma imagem válida.'); return; }
        try {
            setUploadingPhoto(true);
            const blob = await resizeAndConvertToWebP(file, 1000);
            const { publicUrl } = await uploadFoto(`repair-shops/${Date.now()}.webp`, blob, 'image/webp');
            setPhotoUrl(publicUrl);
            toast.success('Foto carregada. Salve para confirmar.');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao enviar a foto.');
        } finally {
            setUploadingPhoto(false);
            if (photoInputRef.current) photoInputRef.current.value = '';
        }
    };

    const handleDocs = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length === 0) return;
        const anexados: ShopDoc[] = [];
        const falhas: string[] = [];
        try {
            setUploadingDoc(true);
            for (const file of files) {
                try {
                    const prepared = await prepareDocumentUpload(file, { maxSize: 1400, quality: 0.8 });
                    const safe = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.\-]+/g, '_');
                    const fileName = `repair-shop-docs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}.${prepared.ext}`;
                    const { publicUrl } = await uploadFoto(fileName, prepared.blob, prepared.contentType);
                    anexados.push({ name: file.name, url: publicUrl, size: file.size, uploadedAt: new Date().toISOString() });
                } catch (err) {
                    falhas.push((err as { message?: string })?.message ?? `Falha em "${file.name}".`);
                }
            }
            if (anexados.length) setDocuments((prev) => [...prev, ...anexados]);
            if (falhas.length) toast.error(falhas[0]);
            else if (anexados.length) toast.success(`${anexados.length} arquivo(s) anexado(s). Salve para confirmar.`);
        } finally {
            setUploadingDoc(false);
            if (docInputRef.current) docInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!name.trim()) return setError('Informe o nome da oficina.');

        const payload = {
            name: name.trim(),
            code: code.trim().toUpperCase() || null,
            cnpj: cnpj.replace(/\D/g, '') || null,
            address: address.trim() || null,
            city: city.trim() || null,
            phone: phone.replace(/\D/g, '') || null,
            contract_number: contractNumber.trim() || null,
            contract_start: contractStart || null,
            contract_end: contractEnd || null,
            is_active: isActive,
            specialties,
            notes: notes.trim() || null,
            photo_url: photoUrl || null,
            documents: documents as unknown as Tables<'repair_shops'>['documents'],
        };

        try {
            if (isEditing && shop) await updateMut.mutateAsync(payload);
            else await createMut.mutateAsync(payload);
            await qc.invalidateQueries({ queryKey: ['repairShops'] });
            toast.success(isEditing ? 'Oficina atualizada!' : 'Oficina cadastrada!');
            onClose();
        } catch (err) {
            const message = (err as { message?: string })?.message ?? 'Erro ao salvar a oficina.';
            setError(message.includes('23505') || message.toLowerCase().includes('duplicate')
                ? 'Já existe uma oficina com esse código.'
                : message);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Editar oficina' : 'Nova oficina'}
            description={isEditing ? 'Atualize os dados da oficina.' : 'Cadastre uma oficina credenciada.'}
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</SGFButton>
                    <SGFButton onClick={handleSubmit as unknown as () => void} disabled={isSaving}>
                        {isSaving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar oficina'}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        {photoUrl
                            ? <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full items-center justify-center text-slate-300"><Camera className="h-7 w-7" /></div>}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">Foto da oficina</p>
                        <p className="mb-2 text-xs text-slate-400">JPG ou PNG. Otimizada automaticamente.</p>
                        <div className="flex items-center gap-2">
                            <SGFButton type="button" variant="secondary" size="sm" icon={uploadingPhoto ? Loader2 : Camera}
                                disabled={uploadingPhoto} onClick={() => photoInputRef.current?.click()}>
                                {uploadingPhoto ? 'Enviando...' : (photoUrl ? 'Alterar foto' : 'Adicionar foto')}
                            </SGFButton>
                            {photoUrl && <SGFButton type="button" variant="ghost" size="sm" onClick={() => setPhotoUrl('')}>Remover</SGFButton>}
                        </div>
                        <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SGFInput label="Nome da oficina *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Auto Center Municipal" fullWidth />
                    <SGFInput label="Código" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: OF-001" fullWidth />
                    <SGFInput label="CNPJ" value={cnpj} onChange={(e) => setCnpj(maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00" fullWidth />
                    <SGFInput label="Telefone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" fullWidth />
                    <SGFInput label="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} fullWidth />
                    <SGFInput label="Cidade" value={city} onChange={(e) => setCity(e.target.value)} fullWidth />
                    <SGFInput label="Nº do contrato" value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} fullWidth />
                    <div className="grid grid-cols-2 gap-3">
                        <SGFInput label="Início" type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} fullWidth />
                        <SGFInput label="Vencimento" type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} fullWidth />
                    </div>
                </div>

                <div>
                    <p className="mb-2 text-sm font-semibold text-slate-700">Especialidades</p>
                    <div className="flex flex-wrap gap-2">
                        {SPECIALTY_OPTIONS.map((s) => {
                            const on = specialties.includes(s);
                            return (
                                <button key={s} type="button" onClick={() => toggleSpecialty(s)}
                                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                        on
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                                    }`}>
                                    {s}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-700">Documentos</p>
                            <p className="text-xs text-slate-400">Contrato, licitação e certidões.</p>
                        </div>
                        <SGFButton type="button" variant="secondary" size="sm" icon={uploadingDoc ? Loader2 : FileText}
                            disabled={uploadingDoc} onClick={() => docInputRef.current?.click()}>
                            {uploadingDoc ? 'Enviando...' : 'Anexar'}
                        </SGFButton>
                        <input ref={docInputRef} type="file" multiple accept={DOCUMENT_ACCEPT} onChange={handleDocs} className="hidden" />
                    </div>
                    {documents.length > 0 && (
                        <ul className="mt-3 space-y-2">
                            {documents.map((doc, i) => (
                                <li key={`${doc.url}-${i}`} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{doc.name}</span>
                                    {doc.size ? <span className="text-[11px] text-slate-400">{formatFileSize(doc.size)}</span> : null}
                                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-emerald-600"><Download className="h-4 w-4" /></a>
                                    <button type="button" onClick={() => setDocuments((p) => p.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-500">
                                        <X className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <SGFInput label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth />

                <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    Oficina ativa (aparece na seleção de manutenção)
                </label>

                {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            </form>
        </Modal>
    );
}
