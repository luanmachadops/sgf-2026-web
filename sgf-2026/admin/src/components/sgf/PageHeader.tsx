import type { ReactNode } from 'react';

/** Cabeçalho de página no padrão do app: título grande, apoio curto e ações à direita. */
export function PageHeader({ title, subtitle, actions, eyebrow }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode;
}) {
  return (
    <div className="rt-rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-[13px] font-medium text-[var(--rt-ink500)]">{eyebrow}</div>}
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[var(--rt-ink900)] sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-[var(--rt-ink500)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Título de seção dentro da página (como o SectionTitle do app). */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 px-1">
      <h2 className="text-lg font-bold tracking-[-0.01em] text-[var(--rt-ink900)]">{children}</h2>
      {action}
    </div>
  );
}
