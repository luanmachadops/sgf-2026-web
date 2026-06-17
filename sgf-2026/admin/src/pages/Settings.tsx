import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Card, Button, Input } from '@/lib/ui';

export default function Settings() {
  const { email } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (password.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.');
    if (password !== confirm) return toast.error('As senhas não conferem.');
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Senha alterada com sucesso.');
      setPassword(''); setConfirm('');
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500">Conta do superusuário.</p>
      </div>
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Segurança</h2>
        <p className="mb-4 text-sm text-slate-500">Conta: <span className="font-medium text-slate-700">{email}</span></p>
        <div className="space-y-3">
          <Input label="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          <Input label="Confirmar nova senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <Button onClick={save} disabled={saving || !password}>{saving ? 'Salvando…' : 'Alterar senha'}</Button>
        </div>
      </Card>
    </div>
  );
}
