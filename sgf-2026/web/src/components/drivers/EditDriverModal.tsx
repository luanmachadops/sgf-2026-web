import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Camera, Loader2, Sparkles } from '@/components/sgf/icons';
import { departmentsApi, driversApi } from '@/lib/supabase-api';
import { extractDriverFromCNH } from '@/lib/driverAI';
import { supabase } from '@/lib/supabase';
import { resizeAndConvertToWebP, isImageFile } from '@/lib/imageUtils';
import { maskCPF, maskPhone } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables, TablesUpdate } from '@/types/database.types';

type Profile = Tables<'profiles'>;

export interface EditDriverModalProps {
    isOpen: boolean;
    onClose: () => void;
    driver: Profile;
}

const CNH_CATEGORIES = ['A', 'B', 'AB', 'C', 'D', 'E'];

function getInitials(name: string) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function EditDriverModal({ isOpen, onClose, driver }: EditDriverModalProps) {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    const [fullName, setFullName] = useState('');
    const [cpf, setCpf] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [registrationNumber, setRegistrationNumber] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [cnhNumber, setCnhNumber] = useState('');
    const [cnhCategory, setCnhCategory] = useState('');
    const [cnhExpiry, setCnhExpiry] = useState('');
    const [cnhEar, setCnhEar] = useState(false);
    const [departmentId, setDepartmentId] = useState('');
    const [driverStatus, setDriverStatus] = useState<'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>('ACTIVE');
    const [shiftStart, setShiftStart] = useState('');
    const [shiftEnd, setShiftEnd] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cnhInputRef = useRef<HTMLInputElement>(null);

    const handleCnhExtract = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (cnhInputRef.current) cnhInputRef.current.value = '';
        if (!file) return;
        if (!isImageFile(file)) {
            toast.error('Selecione uma imagem válida da CNH.');
            return;
        }
        if (!user?.tenantId) {
            toast.error('Sem prefeitura definida para a leitura da CNH.');
            return;
        }
        try {
            setAiLoading(true);
            toast.info('Lendo a CNH com IA...');
            const d = await extractDriverFromCNH([file], user.tenantId);
            if (d.name) setFullName(String(d.name));
            if (d.cpf) setCpf(maskCPF(String(d.cpf)));
            if (d.birthDate) setBirthDate(String(d.birthDate));
            if (d.cnhNumber) setCnhNumber(String(d.cnhNumber));
            if (d.cnhCategory) setCnhCategory(String(d.cnhCategory).toUpperCase());
            if (d.cnhExpiry) setCnhExpiry(String(d.cnhExpiry));
            toast.success('Dados da CNH preenchidos. Revise antes de salvar.');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Não foi possível ler a CNH.');
        } finally {
            setAiLoading(false);
        }
    };

    const { data: departments = [] } = useQuery({
        queryKey: ['departments', 'list-all'],
        queryFn: () => departmentsApi.getAll(),
    });

    const departmentOptions = useMemo(
        () => departments.map((d) => ({ value: d.id, label: d.name })),
        [departments],
    );

    // Carrega valores do motorista ao abrir
    useEffect(() => {
        if (!isOpen) return;
        setFullName(driver.full_name ?? '');
        setCpf(maskCPF(driver.cpf ?? ''));
        setEmail(driver.email ?? '');
        setPhone(maskPhone(driver.phone ?? ''));
        setRegistrationNumber(driver.registration_number ?? '');
        setBirthDate(driver.birth_date ?? '');
        setCnhNumber(driver.cnh_number ?? '');
        setCnhCategory(driver.cnh_category ?? '');
        setCnhExpiry(driver.cnh_expiry ?? '');
        setCnhEar(driver.cnh_ear ?? false);
        setDepartmentId(driver.department_id ?? '');
        // `driver_status` no banco é pt-BR. O DriverRecord decorado traz UPPERCASE EN.
        const s = String(driver.driver_status ?? '').toLowerCase();
        setDriverStatus(
            s === 'ativo' ? 'ACTIVE'
            : s === 'inativo' ? 'INACTIVE'
            : s === 'suspenso' ? 'SUSPENDED'
            : (driver.driver_status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') ?? 'ACTIVE'
        );
        setShiftStart(driver.shift_start ? driver.shift_start.slice(0, 5) : '');
        setShiftEnd(driver.shift_end ? driver.shift_end.slice(0, 5) : '');
        setPhotoUrl((driver as { photo_url?: string | null }).photo_url ?? '');
        setError(null);
    }, [isOpen, driver]);

    const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!isImageFile(file)) {
            toast.error('Selecione um arquivo de imagem válido.');
            return;
        }
        try {
            setIsUploading(true);
            const optimizedBlob = await resizeAndConvertToWebP(file, 512);
            const fileName = `drivers/${driver.id}-${Date.now()}.webp`;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Sessão expirada. Faça login novamente.');
            const { error: uploadError } = await supabase.storage
                .from('fotos')
                .upload(fileName, optimizedBlob, { contentType: 'image/webp', upsert: true });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
            setPhotoUrl(publicUrl);
            toast.success('Foto carregada. Salve para confirmar.');
        } catch (err) {
            const message = (err as { message?: string })?.message ?? 'Erro ao enviar a foto.';
            toast.error(message);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const updateMutation = useMutation({
        mutationFn: (payload: TablesUpdate<'profiles'>) => driversApi.update(driver.id, payload),
    });

    const isSaving = updateMutation.isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!fullName.trim()) return setError('Informe o nome completo.');

        // Mapeia o status do web (UPPERCASE EN) para o enum do banco (pt-BR)
        const statusDb = driverStatus === 'ACTIVE' ? 'ativo'
            : driverStatus === 'INACTIVE' ? 'inativo'
            : 'suspenso';

        const payload: TablesUpdate<'profiles'> = {
            full_name: fullName.trim(),
            cpf: cpf.replace(/\D/g, '') || null,
            email: email.trim().toLowerCase() || null,
            phone: phone.replace(/\D/g, '') || null,
            registration_number: registrationNumber.trim() || null,
            birth_date: birthDate || null,
            cnh_number: cnhNumber.trim() || null,
            cnh_category: cnhCategory || null,
            cnh_expiry: cnhExpiry || null,
            cnh_ear: cnhEar,
            department_id: departmentId || null,
            driver_status: statusDb as TablesUpdate<'profiles'>['driver_status'],
            shift_start: shiftStart || null,
            shift_end: shiftEnd || null,
            photo_url: photoUrl || null,
        };

        try {
            await updateMutation.mutateAsync(payload);
            await queryClient.invalidateQueries({ queryKey: ['driver', driver.id] });
            await queryClient.invalidateQueries({ queryKey: ['drivers'] });
            await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            toast.success('Motorista atualizado com sucesso!');
            onClose();
        } catch (err) {
            const message = (err as { message?: string })?.message ?? 'Erro ao atualizar o motorista.';
            setError(message);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Editar motorista"
            description="Atualize os dados pessoais, CNH e vínculo do motorista."
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</SGFButton>
                    <SGFButton onClick={handleSubmit as unknown as () => void} disabled={isSaving}>
                        {isSaving ? 'Salvando...' : 'Salvar alterações'}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Foto do motorista */}
                <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white shadow-inner">
                        {photoUrl ? (
                            <img src={photoUrl} alt={fullName} className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-emerald-50 text-xl font-bold text-emerald-500">
                                {getInitials(fullName)}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">Foto do motorista</p>
                        <p className="mb-2 text-xs text-slate-400">JPG ou PNG. Será otimizada automaticamente.</p>
                        <div className="flex items-center gap-2">
                            <SGFButton
                                type="button"
                                variant="secondary"
                                size="sm"
                                icon={isUploading ? Loader2 : Camera}
                                disabled={isUploading}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {isUploading ? 'Enviando...' : (photoUrl ? 'Alterar foto' : 'Adicionar foto')}
                            </SGFButton>
                            {photoUrl && (
                                <SGFButton type="button" variant="ghost" size="sm" onClick={() => setPhotoUrl('')}>
                                    Remover
                                </SGFButton>
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoSelect}
                            className="hidden"
                        />
                    </div>
                </div>

                {/* Preencher/corrigir a partir da foto da CNH */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                    <p className="text-xs font-medium text-slate-600">
                        Envie a foto da CNH para preencher ou corrigir os dados automaticamente.
                    </p>
                    <SGFButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={aiLoading ? Loader2 : Sparkles}
                        disabled={aiLoading}
                        onClick={() => cnhInputRef.current?.click()}
                    >
                        {aiLoading ? 'Lendo CNH...' : 'Ler CNH com IA'}
                    </SGFButton>
                    <input
                        ref={cnhInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleCnhExtract}
                        className="hidden"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="Nome completo"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        fullWidth
                    />
                    <SGFInput
                        label="Matrícula"
                        value={registrationNumber}
                        onChange={(e) => setRegistrationNumber(e.target.value)}
                        fullWidth
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="CPF"
                        value={cpf}
                        onChange={(e) => setCpf(maskCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        fullWidth
                    />
                    <SGFInput
                        label="Telefone"
                        value={phone}
                        onChange={(e) => setPhone(maskPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        fullWidth
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="Data de nascimento"
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        fullWidth
                    />
                    <SGFInput
                        label="E-mail"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        fullWidth
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SGFInput
                        label="Nº CNH"
                        value={cnhNumber}
                        onChange={(e) => setCnhNumber(e.target.value)}
                        fullWidth
                    />
                    <SGFSelect
                        label="Categoria"
                        options={CNH_CATEGORIES.map((c) => ({ value: c, label: c }))}
                        value={cnhCategory}
                        onChange={(val) => setCnhCategory(val)}
                        placeholder="—"
                        fullWidth
                    />
                    <SGFInput
                        label="Validade"
                        type="date"
                        value={cnhExpiry}
                        onChange={(e) => setCnhExpiry(e.target.value)}
                        fullWidth
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <input
                            type="checkbox"
                            checked={cnhEar}
                            onChange={(e) => setCnhEar(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm font-medium text-slate-700">
                            CNH com EAR (exerce atividade remunerada)
                        </span>
                    </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFSelect
                        label="Secretaria"
                        options={departmentOptions}
                        value={departmentId}
                        onChange={(val) => setDepartmentId(val)}
                        placeholder="Selecione a secretaria"
                        fullWidth
                    />
                    <SGFSelect
                        label="Status"
                        options={[
                            { value: 'ACTIVE', label: 'Ativo' },
                            { value: 'INACTIVE', label: 'Inativo' },
                            { value: 'SUSPENDED', label: 'Suspenso' },
                        ]}
                        value={driverStatus}
                        onChange={(val) => setDriverStatus(val as typeof driverStatus)}
                        fullWidth
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="Início do turno"
                        type="time"
                        value={shiftStart}
                        onChange={(e) => setShiftStart(e.target.value)}
                        fullWidth
                    />
                    <SGFInput
                        label="Fim do turno"
                        type="time"
                        value={shiftEnd}
                        onChange={(e) => setShiftEnd(e.target.value)}
                        fullWidth
                    />
                </div>

                {error && (
                    <div className="rounded-[var(--sgf-radius-base)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                        {error}
                    </div>
                )}
            </form>
        </Modal>
    );
}

export default EditDriverModal;
