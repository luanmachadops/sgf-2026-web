import type { ReactNode } from 'react';
import { INICIO_LAYERS, INICIO_VIEWBOX } from '@/components/pwa/inicioLogo';
import { AlertCircle } from '@/components/sgf/icons';

/**
 * Moldura das telas de acesso no mesmo padrão do painel do gestor
 * (web/src/pages/Login.tsx): fundo #0F2B2F, logo animado da tela de início,
 * campos em pílula de vidro e rodapé com o copyright.
 */
export function AuthShell({ subtitle, children }: { subtitle?: string; children: ReactNode }) {
  return (
    <div className="sgf-auth-background flex min-h-screen w-full flex-col items-center">
      <div className="flex w-full max-w-[412px] flex-1 flex-col items-center px-[37px]">
        <div className="mt-[72px] flex flex-col items-center">
          <svg
            className="pwa-launch-logo !w-[180px]"
            viewBox={`0 0 ${INICIO_VIEWBOX.width} ${INICIO_VIEWBOX.height}`}
            role="img"
            aria-label="Exattus Rotta — Gestão de frota Municipal"
          >
            {INICIO_LAYERS.map((layer) => (
              <path key={layer.id} className={`pwa-layer-${layer.id}`} d={layer.d} fill={layer.fill} />
            ))}
          </svg>
          {subtitle && <p className="mt-3 text-sm font-medium text-white/70">{subtitle}</p>}
        </div>

        <div className="mt-[72px] w-full">{children}</div>

        <p className="mb-[36px] mt-auto pt-10 text-center text-[11.667px] font-medium text-white/80">
          © Exattus Rotta {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

export function AuthAlert({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const cls = tone === 'error'
    ? 'border-red-400/40 bg-red-500/15 text-red-300'
    : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm ${cls}`}>
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Botão principal das telas de acesso (pílula verde de 55px). */
export const AUTH_SUBMIT_CLS = 'flex h-[55px] w-full items-center justify-center gap-[10px] rounded-[27.5px] bg-[var(--sgf-primary)] text-[16px] font-bold text-white transition-opacity active:scale-[.98] disabled:opacity-70';
