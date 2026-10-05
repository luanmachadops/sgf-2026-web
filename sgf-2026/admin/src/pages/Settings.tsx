import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button, Input } from '@/lib/ui';
import { PageHeader, SGFCard } from '@/components/sgf';
import { ShieldCheck, User } from '@/components/sgf/icons';
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE, PASSWORD_PLACEHOLDER } from '@/lib/passwordPolicy';

export default function Settings() {
  const { email } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (password.length < PASSWORD_MIN_LENGTH) return toast.error(PASSWORD_MIN_LENGTH_MESSAGE);
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
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Configurações" subtitle="Conta do superusuário." />
      <SGFCard padding="lg" title="Segurança" icon={ShieldCheck}>
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-[var(--rt-paper)] p-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--rt-brand)] text-white"><User width={20} height={20} /></span>
          <div className="min-w-0">
            <p className="text-xs text-[var(--rt-ink500)]">Conectado como</p>
            <p className="truncate text-sm font-semibold text-[var(--rt-ink900)]">{email}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={PASSWORD_PLACEHOLDER} />
          <Input label="Confirmar nova senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={saving || !password}>{saving ? 'Salvando…' : 'Alterar senha'}</Button>
        </div>
      </SGFCard>
    </div>
  );
}
