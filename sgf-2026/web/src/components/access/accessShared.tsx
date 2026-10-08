import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { AlertTriangle, Check, Copy, Loader2 } from '@/components/sgf/icons';
import { ACCESS_MODULES, ALL_ACCESS_MODULES } from '@/lib/accessModules';
import { accessManagementApi, type ManagedAccess } from '@/lib/backend-api';

export function ModuleChecks({ value, onChange }: { value: string[]; onChange: (modules: string[]) => void }) {
    const allSelected = value.length === ALL_ACCESS_MODULES.length;
    return (
        <div>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-slate-800">Abas permitidas</p>
                    <p className="text-xs text-slate-500">O menu e as rotas respeitam esta seleção.</p>
                </div>
                <button
                    type="button"
                    onClick={() => onChange(allSelected ? [] : [...ALL_ACCESS_MODULES])}
                    className="text-xs font-bold text-[var(--sgf-primary)] hover:underline"
                >
                    {allSelected ? 'Desmarcar todas' : 'Marcar todas'}
                </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {ACCESS_MODULES.map((module) => {
                    const checked = value.includes(module.id);
                    return (
                        <label
                            key={module.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                                checked ? 'border-[var(--sgf-primary)] bg-[var(--sgf-primary-soft)] text-slate-900' : 'border-slate-200 bg-white text-slate-600'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onChange(checked ? value.filter((item) => item !== module.id) : [...value, module.id])}
                                className="sr-only"
                            />
                            <span className={`grid h-5 w-5 place-items-center rounded-md ${checked ? 'bg-[var(--sgf-primary)] text-[var(--sgf-primary-contrast)]' : 'border border-slate-300'}`}>
                                {checked && <Check className="h-3.5 w-3.5" />}
                            </span>
                            {module.label}
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

/** Senha provisória: aparece uma única vez, com o login para entregar junto. */
export function TempPasswordDialog({ credential, onClose }: {
    credential: { name: string; login: string; password: string } | null;
    onClose: () => void;
}) {
    return (
        <Modal
            isOpen={Boolean(credential)}
            onClose={onClose}
            title="Senha provisória"
            description="Copie agora: ela não é exibida de novo. A pessoa troca a senha no primeiro acesso."
            size="sm"
        >
            {credential && (
                <div className="space-y-3 rounded-2xl bg-[var(--sgf-dark)] p-5 text-[var(--sgf-dark-contrast)]">
                    <p className="font-bold">{credential.name}</p>
                    <p className="text-sm opacity-75">Login: {credential.login}</p>
                    <p className="select-all font-mono text-xl font-bold tracking-wider text-[var(--sgf-accent)]">{credential.password}</p>
                    <SGFButton
                        fullWidth
                        icon={Copy}
                        onClick={() => {
                            void navigator.clipboard.writeText(`Login: ${credential.login}\nSenha provisória: ${credential.password}`);
                            toast.success('Login e senha copiados.');
                        }}
                    >
                        Copiar login e senha
                    </SGFButton>
                </div>
            )}
        </Modal>
    );
}

/**
 * Confirmação de remoção. Antes de confirmar, mostra o que vai acontecer:
 * excluir de vez (sem histórico) ou arquivar (com histórico, que é preservado).
 * Pede o nome digitado para não remover por engano.
 */
export function RemoveAccessDialog({ access, onClose, onRemoved }: {
    access: ManagedAccess | null;
    onClose: () => void;
    onRemoved: (result: 'deleted' | 'archived') => void;
}) {
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const impact = useQuery({
        queryKey: ['access-removal-impact', access?.id],
        queryFn: () => accessManagementApi.removalImpact(access!.id),
        enabled: Boolean(access),
        staleTime: 0,
    });
    const expected = (access?.full_name ?? '').trim();
    const matches = typed.trim().toLocaleLowerCase('pt-BR') === expected.toLocaleLowerCase('pt-BR');
    const archive = impact.data?.action === 'archive';

    const close = () => { setTyped(''); onClose(); };
    const confirm = async () => {
        if (!access) return;
        setBusy(true);
        try {
            const { result } = await accessManagementApi.remove(access.id);
            toast.success(result === 'archived' ? 'Acesso removido. O histórico foi preservado.' : 'Acesso excluído.');
            setTyped('');
            onRemoved(result);
        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            isOpen={Boolean(access)}
            onClose={close}
            title="Remover acesso"
            size="sm"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={close}>Cancelar</SGFButton>
                    <SGFButton variant="danger" loading={busy} disabled={!matches || impact.isLoading || impact.isError} onClick={() => void confirm()}>
                        Remover acesso
                    </SGFButton>
                </ModalFooter>
            )}
        >
            {access && (
                <div className="space-y-4">
                    {impact.isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Verificando o histórico…</div>
                    ) : impact.isError ? (
                        <p className="text-sm text-red-700">{(impact.error as Error).message}</p>
                    ) : archive ? (
                        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                            <p>
                                <strong>{access.full_name}</strong> tem {impact.data!.history.toLocaleString('pt-BR')} registro(s) no sistema
                                (viagens, abastecimentos, aprovações…). O login será desligado e o acesso sairá das listas,
                                mas o nome continua em todo o histórico. O e-mail fica livre para um novo cadastro.
                            </p>
                        </div>
                    ) : (
                        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                            <strong>{access.full_name}</strong> não tem registros no sistema. O acesso será excluído de vez.
                        </p>
                    )}
                    <SGFInput
                        label={`Para confirmar, digite o nome: ${expected}`}
                        value={typed}
                        onChange={(event) => setTyped(event.target.value)}
                        fullWidth
                    />
                </div>
            )}
        </Modal>
    );
}
