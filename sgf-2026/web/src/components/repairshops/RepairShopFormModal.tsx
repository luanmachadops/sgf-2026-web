import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Camera, Loader2, FileText, X, Download, Search } from '@/components/sgf/icons';
import { useCreateRepairShop, useUpdateRepairShop, useRepairShops } from '@/hooks/useRepairShops';
import { useAuth } from '@/contexts/AuthContext';
import { ProcurementContractFields } from '@/components/procurement/ProcurementContractFields';
import { assertContractDatesPersisted, validateProcurementContract } from '@/lib/procurement-contract';
import { uploadFoto } from '@/lib/fotoStorage';
import { resolveDocUrl, uploadPrivateDoc } from '@/lib/docStorage';
import {
    resizeAndConvertToWebP, isImageFile,
    formatFileSize, DOCUMENT_ACCEPT,
    uploadFileId,
} from '@/lib/imageUtils';
import { maskCNPJ, maskPhone } from '@/lib/utils';
import type { Tables } from '@/types/database.types';

/** Especialidades usadas para direcionar a OS à oficina certa. */
const SPECIALTY_OPTIONS = [
    'Mecânica geral', 'Elétrica', 'Funilaria e pintura', 'Pneus e alinhamento',
    'Ar-condicionado', 'Suspensão', 'Injeção eletrônica', 'Tacógrafo',
];

type ShopDoc = { name: string; url: string; size?: number; uploadedAt?: string };

function generateNextShopCode(shops: Array<{ code?: string | null }>): string {
    let maxNum = 0;
    for (const s of shops) {
        if (!s.code) continue;
        const match = s.code.match(/(?:OF|OFC)-?(\d+)/i) || s.code.match(/(\d+)/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
    }
    const nextNum = maxNum + 1;
    return `OF-${String(nextNum).padStart(3, '0')}`;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    shop?: Tables<'repair_shops'> | null;
}

export function RepairShopFormModal({ isOpen, onClose, shop }: Props) {
    const isEditing = Boolean(shop);
    const qc = useQueryClient();
    const { user } = useAuth();

    const { data: existingShops = [], isLoading: shopsLoading } = useRepairShops();

    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [cnpj, setCnpj] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [phone, setPhone] = useState('');
    const [contractNumber, setContractNumber] = useState('');
    const [contractStart, setContractStart] = useState('');
    const [contractEnd, setContractEnd] = useState('');
    const [contractValue, setContractValue] = useState('');
    const [contractAlertPercent, setContractAlertPercent] = useState('20');
    const [contractAlertDays, setContractAlertDays] = useState('30');
    const [isActive, setIsActive] = useState(true);
    const [specialties, setSpecialties] = useState<string[]>([]);
    const [notes, setNotes] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [documents, setDocuments] = useState<ShopDoc[]>([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [cnpjLoading, setCnpjLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);
    const initializedForRef = useRef<string | null>(null);
    const draftUploadIdRef = useRef(
        globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
    );

    useEffect(() => {
        if (!isOpen) {
            initializedForRef.current = null;
            return;
        }
        const formKey = shop?.id ?? 'new';
        if (initializedForRef.current === formKey) return;
        if (!shop && shopsLoading) return;
        initializedForRef.current = formKey;
        setName(shop?.name ?? '');
        setCode(shop?.code ?? generateNextShopCode(existingShops));
        setCnpj(maskCNPJ(shop?.cnpj ?? ''));
        setAddress(shop?.address ?? '');
        setCity(shop?.city ?? '');
        setPhone(maskPhone(shop?.phone ?? ''));
        setContractNumber(shop?.contract_number ?? '');
        setContractStart(shop?.contract_start ?? '');
        setContractEnd(shop?.contract_end ?? '');
        setContractValue(shop?.contract_value == null ? '' : String(shop.contract_value));
        setContractAlertPercent(String(shop?.contract_alert_percent ?? 20));
        setContractAlertDays(String(shop?.contract_alert_days ?? 30));
        setIsActive(shop?.is_active ?? true);
        setSpecialties(shop?.specialties ?? []);
        setNotes(shop?.notes ?? '');
        setPhotoUrl(shop?.photo_url ?? '');
        setDocuments(((shop?.documents ?? []) as unknown as ShopDoc[]) ?? []);
        setCnpjLoading(false);
        setError(null);
    }, [existingShops, isOpen, shop, shopsLoading]);

    // Busca dados do CNPJ na BrasilAPI (com fallback para MinhaReceita) e preenche os campos automaticamente.
    const lookupCnpj = async (digitsToLookup?: string) => {
        const digits = (digitsToLookup ?? cnpj).replace(/\D/g, '');
        if (digits.length !== 14) {
            toast.error('Informe um CNPJ válido com 14 dígitos.');
            return;
        }

        try {
            setCnpjLoading(true);
            let d: {
                nome_fantasia?: string;
                razao_social?: string;
                logradouro?: string;
                numero?: string;
                complemento?: string;
                bairro?: string;
                municipio?: string;
                uf?: string;
                ddd_telefone_1?: string | number;
                telefone?: string | number;
                ddd_telefone_2?: string | number;
            } | null = null;

            // 1ª tentativa: BrasilAPI
            try {
                const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
                if (res.ok) {
                    d = await res.json();
                }
            } catch {
                // Fallback
            }

            // 2ª tentativa: Minha Receita
            if (!d) {
                try {
                    const res = await fetch(`https://minhareceita.org/${digits}`);
                    if (res.ok) {
                        d = await res.json();
                    }
                } catch {
                    // Fallback
                }
            }

            if (!d) {
                toast.warning('CNPJ não encontrado ou serviço indisponível.');
                return;
            }

            const fantasia = (d.nome_fantasia || '').trim();
            const razao = (d.razao_social || '').trim();
            const shopName = fantasia || razao;
            if (shopName) setName((current) => current.trim() ? current : shopName);

            const addrParts = [d.logradouro, d.numero, d.complemento].filter(Boolean).join(', ');
            const fullAddr = [addrParts, d.bairro].filter(Boolean).join(' - ');
            if (fullAddr) setAddress((current) => current.trim() ? current : fullAddr);

            const cidadeUf = [d.municipio, d.uf].filter(Boolean).join('/');
            if (cidadeUf) setCity((current) => current.trim() ? current : cidadeUf);

            const rawTel = d.ddd_telefone_1 || d.telefone || d.ddd_telefone_2 || '';
            if (rawTel) {
                let tel = String(rawTel).replace(/\D/g, '');
                if (tel.length > 11 && tel.startsWith('55')) tel = tel.slice(2);
                tel = tel.replace(/^0+/, '');
                tel = tel.slice(-11);
                if (tel.length >= 10) setPhone((current) => current.trim() ? current : maskPhone(tel));
            }

            toast.success('Dados da oficina preenchidos a partir do CNPJ.');
        } catch {
            toast.warning('Falha ao consultar o CNPJ.');
        } finally {
            setCnpjLoading(false);
        }
    };

    const handleCnpjChange = (raw: string) => {
        const masked = maskCNPJ(raw);
        setCnpj(masked);
        const digits = masked.replace(/\D/g, '');
        if (digits.length === 14) {
            void lookupCnpj(digits);
        }
    };

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
            const { publicUrl } = await uploadFoto(`repair-shops/${uploadFileId()}.webp`, blob, 'image/webp');
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
        if (!user?.tenantId) {
            toast.error('Não foi possível identificar a prefeitura para o upload.');
            return;
        }
        const anexados: ShopDoc[] = [];
        const falhas: string[] = [];
        try {
            setUploadingDoc(true);
            for (const file of files) {
                try {
                    const safe = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
                    const shopFolder = shop?.id ?? `drafts/${draftUploadIdRef.current}`;
                    const path = await uploadPrivateDoc(
                        file,
                        'repair_shops',
                        user.tenantId,
                        `${shopFolder}/registration/${safe}-${Math.random().toString(36).slice(2, 8)}`,
                    );
                    anexados.push({
                        name: file.name,
                        url: path,
                        size: file.size,
                        uploadedAt: new Date().toISOString(),
                    });
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

    const openDocument = async (storedPath: string) => {
        try {
            const url = await resolveDocUrl(storedPath);
            if (!url) throw new Error('Documento indisponível.');
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            toast.error((err as { message?: string }).message ?? 'Não foi possível abrir o documento.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!name.trim()) return setError('Informe o nome da oficina.');
        const contractError = validateProcurementContract({
            contractNumber,
            contractStart,
            contractEnd,
            contractValue,
            contractAlertPercent,
            contractAlertDays,
        });
        if (contractError) return setError(contractError);

        const finalCode = (code.trim() || generateNextShopCode(existingShops)).toUpperCase();

        const payload = {
            name: name.trim(),
            code: finalCode || null,
            cnpj: cnpj.replace(/\D/g, '') || null,
            address: address.trim() || null,
            city: city.trim() || null,
            phone: phone.replace(/\D/g, '') || null,
            contract_number: contractNumber.trim() || null,
            contract_start: contractStart || null,
            contract_end: contractEnd || null,
            contract_value: contractValue ? Number(contractValue) : null,
            contract_alert_percent: Number(contractAlertPercent || 20),
            contract_alert_days: Number(contractAlertDays || 30),
            is_active: isActive,
            specialties,
            notes: notes.trim() || null,
            photo_url: photoUrl || null,
            documents: documents as unknown as Tables<'repair_shops'>['documents'],
        };

        try {
            const saved = isEditing && shop
                ? await updateMut.mutateAsync(payload)
                : await createMut.mutateAsync(payload);
            assertContractDatesPersisted(saved, {
                contract_start: payload.contract_start,
                contract_end: payload.contract_end,
            });
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

                <ProcurementContractFields
                    idPrefix="repair-shop"
                    contractNumber={contractNumber}
                    contractStart={contractStart}
                    contractEnd={contractEnd}
                    contractValue={contractValue}
                    contractAlertPercent={contractAlertPercent}
                    contractAlertDays={contractAlertDays}
                    onContractNumberChange={setContractNumber}
                    onContractStartChange={setContractStart}
                    onContractEndChange={setContractEnd}
                    onContractValueChange={setContractValue}
                    onContractAlertPercentChange={setContractAlertPercent}
                    onContractAlertDaysChange={setContractAlertDays}
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <SGFInput
                                    label="CNPJ"
                                    value={cnpj}
                                    onChange={(e) => handleCnpjChange(e.target.value)}
                                    placeholder="00.000.000/0000-00"
                                    hint={cnpjLoading ? 'Buscando dados do CNPJ...' : undefined}
                                    fullWidth
                                />
                            </div>
                            <SGFButton
                                type="button"
                                variant="secondary"
                                onClick={() => void lookupCnpj()}
                                disabled={cnpjLoading || cnpj.replace(/\D/g, '').length !== 14}
                                className="!h-[42px] shrink-0"
                                title="Buscar dados do CNPJ"
                            >
                                {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <Search className="h-4 w-4 text-slate-600" />}
                                <span className="ml-1 hidden sm:inline">Buscar CNPJ</span>
                            </SGFButton>
                        </div>
                    </div>

                    <SGFInput label="Nome da oficina *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Auto Center Municipal" fullWidth />
                    <SGFInput
                        label="Código"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="Ex.: OF-001"
                        fullWidth
                    />
                    <SGFInput label="Telefone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" fullWidth />
                    <SGFInput label="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} fullWidth />
                    <SGFInput label="Cidade" value={city} onChange={(e) => setCity(e.target.value)} fullWidth />
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
                                    <button
                                        type="button"
                                        onClick={() => void openDocument(doc.url)}
                                        className="text-emerald-600"
                                        title="Abrir documento"
                                    >
                                        <Download className="h-4 w-4" />
                                    </button>
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
