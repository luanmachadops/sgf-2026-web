import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Loader2, Save, Sparkles } from '@/components/sgf/icons';
import { departmentsApi } from '@/lib/supabase-api';
import { useAuth } from '@/contexts/AuthContext';
import { usePreRegisterDriver, usePreRegisterDriversBulk } from '@/hooks/useDrivers';
import { maskCPF } from '@/lib/utils';
import type { PreRegisterDriverRequest } from '@/lib/backend-api';

interface PreRegisterDriverModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Mode = 'single' | 'import';

/** Parser simples de CSV (vírgula ou ponto-e-vírgula). Aceita cabeçalho nome/cpf/matricula. */
function parseSpreadsheet(text: string): PreRegisterDriverRequest[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const splitCols = (line: string) => line.split(/[;,\t]/).map((c) => c.trim());
    const first = splitCols(lines[0]).map((c) => c.toLowerCase());
    const hasHeader = first.some((c) => ['nome', 'name', 'cpf', 'matricula', 'matrícula'].includes(c));

    let idxName = 0, idxCpf = 1, idxReg = 2;
    if (hasHeader) {
        idxName = first.findIndex((c) => c === 'nome' || c === 'name');
        idxCpf = first.findIndex((c) => c === 'cpf');
        idxReg = first.findIndex((c) => c === 'matricula' || c === 'matrícula');
    }

    return lines.slice(hasHeader ? 1 : 0).map((line) => {
        const cols = splitCols(line);
        return {
            name: (idxName >= 0 ? cols[idxName] : '') ?? '',
            cpf: (idxCpf >= 0 ? cols[idxCpf] : '') ?? '',
            registrationNumber: (idxReg >= 0 ? cols[idxReg] : '') || undefined,
        };
    }).filter((r) => r.name || r.cpf);
}

export function PreRegisterDriverModal({ isOpen, onClose }: PreRegisterDriverModalProps) {
    const { user } = useAuth();
    const [mode, setMode] = useState<Mode>('single');

    // Individual
    const [cpf, setCpf] = useState('');
    const [name, setName] = useState('');
    const [registrationNumber, setRegistrationNumber] = useState('');
    const [departmentId, setDepartmentId] = useState(user?.departmentId ?? '');

    // Import
    const [csv, setCsv] = useState('');

    // Credenciais provisórias geradas (exibidas UMA única vez, após o cadastro)
    const [issued, setIssued] = useState<{ cpf: string; name: string; tempPassword: string }[] | null>(null);

    const { data: departments = [] } = useQuery({
        queryKey: ['departments', 'list-all'],
        queryFn: () => departmentsApi.getAll(),
    });
    const departmentOptions = useMemo(
        () => departments.map((d) => ({ value: d.id, label: d.name })),
        [departments],
    );

    const preRegister = usePreRegisterDriver();
    const preRegisterBulk = usePreRegisterDriversBulk();

    const parsed = useMemo(() => (mode === 'import' ? parseSpreadsheet(csv) : []), [mode, csv]);

    const resetAndClose = () => {
        setCpf(''); setName(''); setRegistrationNumber(''); setCsv(''); setMode('single'); setIssued(null);
        onClose();
    };

    const copyCredentials = (rows: { cpf: string; name: string; tempPassword: string }[]) => {
        const text = rows.map((r) => `${r.name} — CPF ${maskCPF(r.cpf)} — senha: ${r.tempPassword}`).join('\n');
        navigator.clipboard.writeText(text).then(
            () => toast.success('Credenciais copiadas.'),
            () => toast.error('Não foi possível copiar.'),
        );
    };

    const downloadCredentialsCsv = (rows: { cpf: string; name: string; tempPassword: string }[]) => {
        const body = ['nome;cpf;senha_provisoria', ...rows.map((r) => `${r.name};${r.cpf};${r.tempPassword}`)].join('\n');
        const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'senhas-provisorias-motoristas.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSingle = async () => {
        if (!name.trim()) return toast.error('Informe o nome.');
        if (cpf.replace(/\D/g, '').length !== 11) return toast.error('CPF inválido.');
        try {
            const driver = await preRegister.mutateAsync({
                name: name.trim(),
                cpf: cpf.replace(/\D/g, ''),
                registrationNumber: registrationNumber.trim() || undefined,
                departmentId: departmentId || undefined,
            });
            toast.success('Motorista pré-cadastrado! Anote a senha provisória.');
            setIssued([{ cpf: cpf.replace(/\D/g, ''), name: name.trim(), tempPassword: driver.tempPassword }]);
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro no pré-cadastro.');
        }
    };

    const handleImport = async () => {
        if (parsed.length === 0) return toast.error('Cole os dados ou ajuste o formato (nome, cpf, matrícula).');
        try {
            const rows = parsed.map((r) => ({ ...r, departmentId: departmentId || undefined }));
            const result = await preRegisterBulk.mutateAsync(rows);
            if (result.errors.length > 0) {
                toast.warning(`${result.created} criados, ${result.errors.length} com erro. Ex.: ${result.errors[0].cpf} — ${result.errors[0].error}`);
            } else {
                toast.success(`${result.created} motoristas pré-cadastrados!`);
            }
            if (result.created > 0) setIssued(result.credentials);
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro na importação.');
        }
    };

    const isBusy = preRegister.isPending || preRegisterBulk.isPending;

    return (
        <Modal
            isOpen={isOpen}
            onClose={resetAndClose}
            title="Pré-cadastro de motoristas"
            description="Crie o acesso por CPF. O motorista entra com CPF e a senha provisória, e completa os dados no primeiro acesso."
            size="lg"
            footer={(
                <ModalFooter>
                    {issued ? (
                        <>
                            <SGFButton variant="ghost" onClick={() => copyCredentials(issued)}>Copiar</SGFButton>
                            <SGFButton variant="ghost" onClick={() => downloadCredentialsCsv(issued)}>Baixar CSV</SGFButton>
                            <SGFButton onClick={resetAndClose}>Concluir</SGFButton>
                        </>
                    ) : (
                        <>
                            <SGFButton variant="ghost" onClick={resetAndClose} disabled={isBusy}>Cancelar</SGFButton>
                            {mode === 'single' ? (
                                <SGFButton icon={isBusy ? Loader2 : Save} onClick={handleSingle} disabled={isBusy}>
                                    {isBusy ? 'Salvando...' : 'Pré-cadastrar'}
                                </SGFButton>
                            ) : (
                                <SGFButton icon={isBusy ? Loader2 : Save} onClick={handleImport} disabled={isBusy || parsed.length === 0}>
                                    {isBusy ? 'Importando...' : `Importar ${parsed.length || ''}`.trim()}
                                </SGFButton>
                            )}
                        </>
                    )}
                </ModalFooter>
            )}
        >
            {issued ? (
                <div className="space-y-4">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
                        ⚠️ As senhas provisórias abaixo são exibidas <strong>apenas agora</strong>. Copie ou baixe antes de concluir e entregue a cada motorista. No primeiro acesso o app exige a troca da senha.
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                                <tr>
                                    <th className="px-4 py-2">Motorista</th>
                                    <th className="px-4 py-2">CPF</th>
                                    <th className="px-4 py-2">Senha provisória</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {issued.map((c) => (
                                    <tr key={c.cpf}>
                                        <td className="px-4 py-2 text-slate-700">{c.name}</td>
                                        <td className="px-4 py-2 text-slate-500">{maskCPF(c.cpf)}</td>
                                        <td className="px-4 py-2 font-mono font-semibold text-emerald-700">{c.tempPassword}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
            <div className="space-y-5">
                {/* Toggle de modo */}
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                    {(['single', 'import'] as Mode[]).map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMode(m)}
                            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                                mode === m ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {m === 'single' ? 'Individual' : 'Importar planilha'}
                        </button>
                    ))}
                </div>

                {mode === 'single' ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <SGFInput label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} placeholder="João da Silva" fullWidth />
                            <SGFInput label="CPF" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" fullWidth />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <SGFInput label="Matrícula" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="MT001" fullWidth />
                            <SGFSelect label="Secretaria" options={departmentOptions} value={departmentId} onChange={setDepartmentId} placeholder="Selecione a secretaria" disabled={Boolean(user?.departmentScopeId)} fullWidth />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <SGFSelect label="Secretaria (aplicada a todos)" options={departmentOptions} value={departmentId} onChange={setDepartmentId} placeholder="Selecione a secretaria" disabled={Boolean(user?.departmentScopeId)} fullWidth />
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">Dados (CSV)</label>
                            <textarea
                                value={csv}
                                onChange={(e) => setCsv(e.target.value)}
                                rows={8}
                                placeholder={'nome,cpf,matricula\nJoão da Silva,12345678901,MT001\nMaria Souza,98765432100,MT002'}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                            />
                            <p className="mt-1.5 text-xs text-slate-400">
                                Colunas: <strong>nome, cpf, matrícula</strong> (com ou sem cabeçalho). Aceita vírgula, ponto-e-vírgula ou tabulação.
                            </p>
                        </div>
                        {parsed.length > 0 && (
                            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm font-medium text-emerald-700">
                                <Sparkles className="h-4 w-4" />
                                {parsed.length} linha{parsed.length > 1 ? 's' : ''} reconhecida{parsed.length > 1 ? 's' : ''}.
                            </div>
                        )}
                    </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
                    🔑 O login é o <strong>CPF</strong> e a senha provisória é <strong>gerada automaticamente</strong> (exibida ao concluir). No primeiro acesso ao app, o motorista troca a senha e completa nome, e-mail e telefone.
                </div>
            </div>
            )}
        </Modal>
    );
}

export default PreRegisterDriverModal;
