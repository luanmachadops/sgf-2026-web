import { useState } from 'react';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Lock, Loader2 } from '@/components/sgf/icons';
import { supabase } from '@/lib/supabase';

export function ChangePasswordCard() {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (password.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.');
        if (password !== confirm) return toast.error('As senhas não conferem.');
        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            toast.success('Senha alterada com sucesso.');
            setPassword(''); setConfirm('');
        } catch (e) {
            toast.error((e as { message?: string })?.message ?? 'Erro ao alterar a senha.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SGFCard padding="lg" className="border border-slate-200/80">
            <div className="mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5 text-slate-400" />
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Segurança</h3>
                    <p className="text-sm text-slate-500">Altere a senha da sua conta de acesso ao painel.</p>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:max-w-md">
                <SGFInput label="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" fullWidth />
                <SGFInput label="Confirmar nova senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} fullWidth />
                <div>
                    <SGFButton onClick={handleSave} disabled={saving || !password} icon={saving ? Loader2 : undefined}>
                        {saving ? 'Salvando...' : 'Alterar senha'}
                    </SGFButton>
                </div>
            </div>
        </SGFCard>
    );
}

export default ChangePasswordCard;
