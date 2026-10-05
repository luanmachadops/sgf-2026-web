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

export function Input({ label, hint, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return <SGFInput label={label} hint={hint} fullWidth className={className} {...rest} />;
}

export function Badge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    active: 'bg-[var(--rt-brand-100)] text-[#0B7A50]', paid: 'bg-[var(--rt-brand-100)] text-[#0B7A50]',
    trial: 'bg-[var(--rt-blue100)] text-[var(--rt-blue600)]', pending: 'bg-[var(--rt-amber100)] text-[var(--rt-amber600)]',
    suspended: 'bg-[var(--rt-red100)] text-[var(--rt-red600)]', overdue: 'bg-[var(--rt-red100)] text-[var(--rt-red600)]',
    expired: 'bg-[var(--rt-paper2)] text-[var(--rt-ink500)]', canceled: 'bg-[var(--rt-paper2)] text-[var(--rt-ink500)]',
  };
  const dot: Record<string, string> = {
    active: 'bg-[var(--rt-brand)]', paid: 'bg-[var(--rt-brand)]', trial: 'bg-[var(--rt-blue600)]', pending: 'bg-[#F59E0B]',
    suspended: 'bg-[var(--rt-red600)]', overdue: 'bg-[var(--rt-red600)]', expired: 'bg-[var(--rt-ink400)]', canceled: 'bg-[var(--rt-ink400)]',
  };
  const label: Record<string, string> = {
    active: 'Ativa', trial: 'Trial', suspended: 'Suspensa', paid: 'Paga', pending: 'Pendente',
    overdue: 'Atrasada', canceled: 'Cancelada', expired: 'Vencido',
  };
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold ${tone[status] ?? 'bg-[var(--rt-paper2)] text-[var(--rt-ink500)]'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] ?? 'bg-[var(--rt-ink400)]'}`} />
      {label[status] ?? status}
    </span>
  );
}

export const fmtUsd = (n: number) => n.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 6,
  maximumFractionDigits: 8,
});
export const fmtBrl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Dólar legível: centavos normais; abaixo de 1 centavo, até 4 casas significativas (custo de IA). */
export const fmtUsdSmart = (n: number) => {
  if (n === 0) return 'US$ 0';
  if (Math.abs(n) >= 0.01) return n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
  return `US$ ${n.toLocaleString('pt-BR', { maximumSignificantDigits: 2 })}`;
};
/** Valor curto para eixo de gráfico (R$ 12 mil). */
export const fmtBrlCompact = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
