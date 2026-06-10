import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  const noPad = className.includes('p-0');
  return (
    <SGFCard variant="bordered" padding={noPad ? 'none' : 'lg'} className={`overflow-hidden ${className}`}>
      {children}
    </SGFCard>
  );
}

export function Button({ children, variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'secondary' | 'outline' }) {
  return (
    <SGFButton variant={variant} className={className} {...(rest as Record<string, unknown>)}>
      {children}
    </SGFButton>
  );
}

export function Input({ label, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return <SGFInput label={label} fullWidth className={className} {...rest} />;
}

export function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700', paid: 'bg-emerald-100 text-emerald-700',
    trial: 'bg-blue-100 text-blue-700', pending: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700', overdue: 'bg-red-100 text-red-700',
    expired: 'bg-slate-100 text-slate-600', canceled: 'bg-slate-100 text-slate-600',
  };
  const label: Record<string, string> = {
    active: 'Ativa', trial: 'Trial', suspended: 'Suspensa', paid: 'Paga', pending: 'Pendente',
    overdue: 'Atrasada', canceled: 'Cancelada', expired: 'Vencido',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>{label[status] ?? status}</span>;
}

export const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
export const fmtBrl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
