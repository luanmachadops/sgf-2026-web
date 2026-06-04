import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Camera, Loader2, FileText, Plus, X, Download } from '@/components/sgf/icons';
import { useCreateStation, useUpdateStation } from '@/hooks/useStations';
import { supabase } from '@/lib/supabase';
import { resizeAndConvertToWebP, isImageFile } from '@/lib/imageUtils';
import { maskCNPJ, maskPhone } from '@/lib/utils';
import type { Tables } from '@/types/database.types';

const FUEL_OPTIONS = ['Gasolina', 'Etanol', 'Diesel', 'GNV', 'Diesel S10'];

type StationDoc = { name: string; url: string };

interface Props {
    isOpen: boolean;
    onClose: () => void;
    station?: Tables<'fuel_stations'> | null;
}

export function StationFormModal({ isOpen, onClose, station }: Props) {
    const isEditing = Boolean(station);
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
    const [fuelTypes, setFuelTypes] = useState<string[]>([]);
    const [fuelPrices, setFuelPrices] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState('');
    const [cnpjLoading, setCnpjLoading] = useState(false);
    const [photoUrl, setPhotoUrl] = useState('');
    const [documents, setDocuments] = useState<StationDoc[]>([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        setName(station?.name ?? '');
        setCode(station?.code ?? '');
        setCnpj(maskCNPJ(station?.cnpj ?? ''));
        setAddress(station?.address ?? '');
        setCity(station?.city ?? '');
        setPhone(maskPhone(station?.phone ?? ''));
        setContractNumber(station?.contract_number ?? '');
        setContractStart(station?.contract_start ?? '');
        setContractEnd(station?.contract_end ?? '');
        setIsActive(station?.is_active ?? true);
        setFuelTypes(station?.fuel_types ?? []);
        const fp = (station as { fuel_prices?: Record<string, number> } | null)?.fuel_prices ?? {};
        setFuelPrices(Object.fromEntries(Object.entries(fp).map(([k, v]) => [k, String(v)])));
        setNotes(station?.notes ?? '');
        setPhotoUrl((station as { photo_url?: string | null } | null)?.photo_url ?? '');
        setDocuments(((station as unknown as { documents?: StationDoc[] } | null)?.documents ?? []) as StationDoc[]);
        setError(null);
    }, [isOpen, station]);

    // Busca dados do CNPJ na BrasilAPI (gratuita) e preenche os campos.
    const lookupCnpj = async (digits: string) => {
        try {
            setCnpjLoading(true);
            const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
            if (!res.ok) {
                toast.warning(res.status === 404 ? 'CNPJ não encontrado.' : 'Não foi possível consultar o CNPJ.');
                return;
            }
            const d = await res.json();
            const fantasia = (d.nome_fantasia || '').trim();
            const razao = (d.razao_social || '').trim();
            if (!name.trim()) setName(fantasia || razao);
            const addr = [d.logradouro, d.numero].filter(Boolean).join(', ');
            const full = [addr, d.bairro].filter(Boolean).join(' - ');
            if (full) setAddress(full);
            if (d.municipio) setCity([d.municipio, d.uf].filter(Boolean).join('/'));
            if (d.ddd_telefone_1) {
                let tel = String(d.ddd_telefone_1).replace(/\D/g, '');
                if (tel.length > 11 && tel.startsWith('55')) tel = tel.slice(2); // remove DDI 55
                tel = tel.replace(/^0+/, ''); // remove 0 de operadora/prefixo
                tel = tel.slice(-11); // mantém no máximo DDD + 9 dígitos
                if (tel.length >= 10) setPhone(maskPhone(tel));
            }
            toast.success('Dados do CNPJ preenchidos.');
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
        if (digits.length === 14) void lookupCnpj(digits);
    };

    const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!isImageFile(file)) { toast.error('Selecione uma imagem válida.'); return; }
        try {
            setUploadingPhoto(true);
            const blob = await resizeAndConvertToWebP(file, 1000);
            const fileName = `stations/${Date.now()}.webp`;
            const { error: upErr } = await supabase.storage.from('fotos').upload(fileName, blob, { contentType: 'image/webp', upsert: true });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
            setPhotoUrl(publicUrl);
            toast.success('Foto carregada. Salve para confirmar.');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao enviar a foto.');
        } finally {
            setUploadingPhoto(false);
            if (photoInputRef.current) photoInputRef.current.value = '';
        }
    };

    const uploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingDoc(true);
            const safe = file.name.replace(/[^\w.\-]+/g, '_');
            const fileName = `station-docs/${Date.now()}-${safe}`;
            const { error: upErr } = await supabase.storage.from('fotos').upload(fileName, file, { contentType: file.type || 'application/octet-stream', upsert: true });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
            setDocuments((prev) => [...prev, { name: file.name, url: publicUrl }]);
            toast.success('Documento anexado. Salve para confirmar.');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao enviar o documento.');
        } finally {
            setUploadingDoc(false);
            if (docInputRef.current) docInputRef.current.value = '';
        }
    };

    const createMut = useCreateStation();
    const updateMut = useUpdateStation(station?.id ?? '');
    const isSaving = createMut.isPending || updateMut.isPending;

    const toggleFuel = (f: string) => {
        setFuelTypes((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!name.trim()) return setError('Informe o nome do posto.');

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
            fuel_types: fuelTypes,
            fuel_prices: Object.fromEntries(
                fuelTypes
                    .map((f) => [f, Number(fuelPrices[f] ?? 0)] as const)
                    .filter(([, v]) => v > 0),
            ) as unknown as Tables<'fuel_stations'>['fuel_prices'],
            notes: notes.trim() || null,
            photo_url: photoUrl || null,
            documents: documents as unknown as Tables<'fuel_stations'>['documents'],
        };

        try {
            if (isEditing && station) {
                await updateMut.mutateAsync(payload);
            } else {
                await createMut.mutateAsync(payload);
            }
            await qc.invalidateQueries({ queryKey: ['stations'] });
            toast.success(isEditing ? 'Posto atualizado!' : 'Posto cadastrado!');
            onClose();
        } catch (err) {
            const message = (err as { message?: string })?.message ?? 'Erro ao salvar o posto.';
            if (message.includes('23505') || message.toLowerCase().includes('duplicate')) {
                setError('Já existe um posto com esse código.');
            } else {
                setError(message);
            }
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Editar posto' : 'Novo posto'}
            description={isEditing ? 'Atualize os dados do posto.' : 'Cadastre um posto fornecedor de combustível.'}
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</SGFButton>
                    <SGFButton onClick={handleSubmit as unknown as () => void} disabled={isSaving}>
                        {isSaving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar posto'}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Foto do posto */}
                <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        {photoUrl ? (
                            <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-300">
                                <Camera className="h-7 w-7" />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">Foto do posto</p>
                        <p className="mb-2 text-xs text-slate-400">JPG ou PNG. Otimizada automaticamente.</p>
                        <div className="flex items-center gap-2">
                            <SGFButton type="button" variant="secondary" size="sm" icon={uploadingPhoto ? Loader2 : Camera} disabled={uploadingPhoto} onClick={() => photoInputRef.current?.click()}>
                                {uploadingPhoto ? 'Enviando...' : (photoUrl ? 'Alterar foto' : 'Adicionar foto')}
                            </SGFButton>
                            {photoUrl && (
                                <SGFButton type="button" variant="ghost" size="sm" onClick={() => setPhotoUrl('')}>Remover</SGFButton>
                            )}
                        </div>
                        <input ref={photoInputRef} type="file" accept="image/*" onChange={uploadPhoto} className="hidden" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="CNPJ"
                        value={cnpj}
                        onChange={(e) => handleCnpjChange(e.target.value)}
                        placeholder="00.000.000/0000-00"
                        hint={cnpjLoading ? 'Buscando dados do CNPJ...' : 'Digite os 14 dígitos para preencher os dados automaticamente.'}
                        fullWidth
                        autoFocus
                    />
                    <SGFInput label="Nome" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput label="Código" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} hint="Curto, único." fullWidth />
                    <SGFInput label="Telefone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" fullWidth />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput label="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} fullWidth />
                    <SGFInput label="Cidade" value={city} onChange={(e) => setCity(e.target.value)} fullWidth />
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                    <h4 className="text-sm font-bold text-slate-700">Contrato / Licitação</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <SGFInput label="Nº do contrato" value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} fullWidth />
                        <SGFInput label="Início" type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} fullWidth />
                        <SGFInput label="Fim (vencimento)" type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} fullWidth />
                    </div>
                </div>

                {/* Documentos (licitação, contrato, etc.) */}
                <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h4 className="text-sm font-bold text-slate-700">Documentos</h4>
                            <p className="text-xs text-slate-400">Licitação, contrato e outros (PDF, imagem, etc.).</p>
                        </div>
                        <SGFButton type="button" variant="secondary" size="sm" icon={uploadingDoc ? Loader2 : Plus} disabled={uploadingDoc} onClick={() => docInputRef.current?.click()}>
                            {uploadingDoc ? 'Enviando...' : 'Anexar'}
                        </SGFButton>
                        <input ref={docInputRef} type="file" onChange={uploadDoc} className="hidden" />
                    </div>
                    {documents.length === 0 ? (
                        <p className="text-sm text-slate-400">Nenhum documento anexado.</p>
                    ) : (
                        <ul className="space-y-2">
                            {documents.map((doc, i) => (
                                <li key={`${doc.url}-${i}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{doc.name}</span>
                                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-emerald-600" title="Baixar">
                                        <Download className="h-4 w-4" />
                                    </a>
                                    <button type="button" onClick={() => setDocuments((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600" title="Remover">
                                        <X className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                    <h4 className="text-sm font-bold text-slate-700">Combustíveis fornecidos</h4>
                    <div className="flex flex-wrap gap-2">
                        {FUEL_OPTIONS.map((f) => (
                            <button
                                type="button"
                                key={f}
                                onClick={() => toggleFuel(f)}
                                className={
                                    'px-3 py-1.5 rounded-full text-xs font-bold border transition ' +
                                    (fuelTypes.includes(f)
                                        ? 'bg-emerald-500 text-white border-emerald-500'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-emerald-300')
                                }
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {fuelTypes.length > 0 && (
                        <div className="space-y-2 border-t border-slate-100 pt-3">
                            <p className="text-xs font-semibold text-slate-500">Preço da licitação (R$/L) — usado quando o sistema está no modo "preço da licitação".</p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {fuelTypes.map((f) => (
                                    <SGFInput
                                        key={f}
                                        label={f}
                                        type="number"
                                        step="0.001"
                                        placeholder="0,000"
                                        value={fuelPrices[f] ?? ''}
                                        onChange={(e) => setFuelPrices((prev) => ({ ...prev, [f]: e.target.value }))}
                                        fullWidth
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Posto ativo (pode receber abastecimentos)</span>
                </label>

                <div>
                    <label className="block text-xs font-semibold uppercase mb-2 text-slate-500">Observações</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500"
                        placeholder="Notas internas sobre o posto, condições, etc."
                    />
                </div>

                {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                        {error}
                    </div>
                )}
            </form>
        </Modal>
    );
}

export default StationFormModal;
