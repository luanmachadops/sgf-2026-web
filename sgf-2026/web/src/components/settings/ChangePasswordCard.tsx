import { useState } from 'react';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Lock, Loader2 } from '@/components/sgf/icons';
import { supabase } from '@/lib/supabase';
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE, PASSWORD_PLACEHOLDER } from '@/lib/passwordPolicy';

export function ChangePasswordCard() {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (password.length < PASSWORD_MIN_LENGTH) return toast.error(PASSWORD_MIN_LENGTH_MESSAGE);
        if (password !== confirm) return toast.error('As senhas não conferem.');
        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            toast.success('Senha alterada com sucesso.');
            setPassword('');
            setConfirm('');
        } catch (e) {
            toast.error((e as { message?: string })?.message ?? 'Erro ao alterar a senha.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SGFCard padding="lg" className="border border-slate-200/80 shadow-sm transition-all hover:shadow-md">
            <div className="mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5 text-slate-400" />
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Segurança da Conta</h3>
                    <p className="text-xs text-slate-500">Altere a senha da sua conta de acesso ao painel.</p>
                </div>
            </div>
            <div className="space-y-4">
                <SGFInput
                    label="Nova senha"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={PASSWORD_PLACEHOLDER}
                    fullWidth
                />
                <SGFInput
                    label="Confirmar nova senha"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repita a nova senha"
                    fullWidth
                />
                <div className="pt-1">
                    <SGFButton
                        onClick={handleSave}
                        disabled={saving || !password}
                        icon={saving ? Loader2 : undefined}
                        className="w-full sm:w-auto"
                    >
                        {saving ? 'Salvando...' : 'Alterar senha'}
                    </SGFButton>
                </div>
            </div>
        </SGFCard>
    );
}

export default ChangePasswordCard;
