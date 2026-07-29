import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Building2, Car, Eye, LayoutDashboard, Settings2, Users, X } from '@/components/sgf/icons';

export interface TenantBrandingPreview {
    name: string;
    slug?: string;
    appName?: string;
    loginEyebrow?: string;
    logoUrl?: string;
    sealUrl?: string;
    photoUrl?: string;
    primaryColor?: string;
    darkColor?: string;
    accentColor?: string;
    city?: string;
    state?: string;
}

interface TenantBrandingPreviewModalProps {
    open: boolean;
    onClose: () => void;
    branding: TenantBrandingPreview;
}

type PreviewScreen = 'dashboard' | 'login';

const VIEWPORTS = [
    { label: 'Celular', width: 360 },
    { label: 'Tablet', width: 720 },
    { label: 'Desktop', width: 1040 },
] as const;

function BrandImage({ branding, size = 'md' }: { branding: TenantBrandingPreview; size?: 'sm' | 'md' | 'lg' }) {
    const source = branding.sealUrl || branding.logoUrl;
    const dimension = size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
    return (
        <div className={`flex ${dimension} shrink-0 items-center justify-center`}>
            {source
                ? <img src={source} alt={branding.name || 'Logo da prefeitura'} className="h-full w-full object-contain" />
                : <Building2 className="h-1/2 w-1/2 text-current" />}
        </div>
    );
}

function DashboardPreview({ branding }: { branding: TenantBrandingPreview }) {
    const primary = branding.primaryColor || '#00A86B';
    const dark = branding.darkColor || '#0F2B2F';
    const accent = branding.accentColor || '#70C4A8';
    const location = [branding.city, branding.state].filter(Boolean).join('/');
    const cards = [
        { label: 'Veículos', value: '94', icon: Car },
        { label: 'Motoristas', value: '38', icon: Users },
        { label: 'Alertas', value: '3', icon: Bell },
    ];

    return (
        <div className="flex min-h-[430px] overflow-hidden rounded-2xl bg-slate-100 text-slate-900 shadow-inner">
            <aside className="hidden w-[27%] min-w-[150px] flex-col p-4 sm:flex" style={{ backgroundColor: dark, color: '#fff' }}>
                <div className="flex items-center gap-2">
                    <BrandImage branding={branding} size="sm" />
                    <div className="min-w-0">
                        <p className="truncate text-xs font-bold">{branding.name || 'Prefeitura'}</p>
                        <p className="truncate text-[9px] opacity-65">{location || 'Gestão Pública'}</p>
                    </div>
                </div>
                <div className="mt-6 space-y-2 text-[11px]">
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold" style={{ backgroundColor: primary }}>
                        <LayoutDashboard className="h-4 w-4" /> Dashboard
                    </div>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2 opacity-65"><Car className="h-4 w-4" /> Gestão de Frotas</div>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2 opacity-65"><Users className="h-4 w-4" /> Motoristas</div>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2 opacity-65"><Settings2 className="h-4 w-4" /> Configurações</div>
                </div>
                <div className="mt-auto rounded-xl p-3 text-[10px]" style={{ backgroundColor: `${accent}26` }}>
                    <p className="font-bold" style={{ color: accent }}>Identidade própria</p>
                    <p className="mt-1 opacity-60">{branding.slug ? `${branding.slug}.exattusrotta.com.br` : 'Painel da prefeitura'}</p>
                </div>
            </aside>
            <main className="min-w-0 flex-1 p-4 sm:p-6">
                <header className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-base font-bold">{branding.appName || branding.name || 'Exattus Rotta'}</p>
                        <p className="truncate text-[10px] text-slate-500">{branding.name || 'Prefeitura'} {location ? `• ${location}` : ''}</p>
                    </div>
                    <button type="button" className="rounded-full px-4 py-2 text-[10px] font-bold text-white" style={{ backgroundColor: primary }}>
                        Nova ação
                    </button>
                </header>
                <div className="mt-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
                    {cards.map(({ label, value, icon: Icon }) => (
                        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${primary}18`, color: primary }}>
                                <Icon className="h-4 w-4" />
                            </div>
                            <p className="text-xl font-black">{value}</p>
                            <p className="text-[10px] text-slate-500">{label}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-4 grid gap-4 min-[620px]:grid-cols-[1.5fr_1fr]">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold">Atividade da frota</p>
                            <span className="rounded-full px-2 py-1 text-[9px] font-bold" style={{ backgroundColor: `${accent}2e`, color: dark }}>Este mês</span>
                        </div>
                        <div className="mt-8 flex h-24 items-end gap-2">
                            {[42, 68, 54, 84, 62, 94, 74].map((height, index) => (
                                <div key={index} className="min-w-0 flex-1 rounded-t-md" style={{ height: `${height}%`, backgroundColor: index === 5 ? primary : `${accent}88` }} />
                            ))}
                        </div>
                    </div>
                    <div className="rounded-xl p-4 text-white" style={{ backgroundColor: dark }}>
                        <p className="text-xs font-bold">Destaques</p>
                        <p className="mt-2 text-[10px] opacity-65">Botões, abas, gráficos e focos seguem as cores configuradas.</p>
                        <button type="button" className="mt-5 w-full rounded-full px-3 py-2 text-[10px] font-bold" style={{ backgroundColor: accent, color: dark }}>
                            Ver relatório
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}

function LoginPreview({ branding }: { branding: TenantBrandingPreview }) {
    const primary = branding.primaryColor || '#00A86B';
    const dark = branding.darkColor || '#0F2B2F';
    const location = [branding.city, branding.state].filter(Boolean).join(' - ');

    return (
        <div className="flex min-h-[430px] items-center justify-center rounded-2xl p-5" style={{ background: `linear-gradient(135deg, ${dark}, ${primary})` }}>
            <div className="w-full max-w-[330px] rounded-[28px] bg-white p-7 text-center shadow-2xl">
                <div className="mx-auto text-slate-300"><BrandImage branding={branding} size="lg" /></div>
                <h3 className="mt-4 truncate text-xl font-black text-slate-900">{branding.appName || branding.name || 'Exattus Rotta'}</h3>
                <p className="mt-2 truncate text-[10px] text-slate-500">{branding.name}{location ? ` • ${location}` : ''}</p>
                <div className="mt-6 space-y-3 text-left">
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-400">E-mail institucional</div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-400">Senha</div>
                    <button type="button" className="w-full rounded-full py-3 text-xs font-bold text-white shadow-lg" style={{ backgroundColor: primary }}>Entrar</button>
                </div>
            </div>
        </div>
    );
}

export function TenantBrandingPreviewModal({ open, onClose, branding }: TenantBrandingPreviewModalProps) {
    const [width, setWidth] = useState<number>(1040);
    const [screen, setScreen] = useState<PreviewScreen>('dashboard');

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    const previewStyle: CSSProperties = {
        width,
        maxWidth: '100%',
        minWidth: 300,
        resize: 'horizontal',
        overflow: 'auto',
    };

    return createPortal(
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
        }}>
            <section role="dialog" aria-modal="true" aria-label="Prévia da identidade visual" className="flex max-h-[94vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: branding.primaryColor || '#00A86B' }}>
                            <Eye className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-bold text-slate-900">Prévia da identidade visual</h2>
                            <p className="text-xs text-slate-500">As alterações do formulário aparecem aqui antes de salvar.</p>
                        </div>
                    </div>
                    <button type="button" aria-label="Fechar prévia" onClick={onClose} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
                        <X className="h-5 w-5" />
                    </button>
                </header>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-6">
                    <div className="flex rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
                        {([['dashboard', 'Painel do gestor'], ['login', 'Tela de login']] as const).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setScreen(value)} className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${screen === value ? 'text-white' : 'text-slate-500 hover:text-slate-900'}`} style={screen === value ? { backgroundColor: branding.primaryColor || '#00A86B' } : undefined}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {VIEWPORTS.map((viewport) => (
                            <button key={viewport.width} type="button" onClick={() => setWidth(viewport.width)} className={`rounded-full border px-3 py-2 text-[11px] font-bold transition-colors ${width === viewport.width ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`} style={width === viewport.width ? { backgroundColor: branding.darkColor || '#0F2B2F' } : undefined}>
                                {viewport.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-slate-200/70 p-3 sm:p-6">
                    <div className="mx-auto transition-[width] duration-300" style={previewStyle}>
                        {screen === 'dashboard' ? <DashboardPreview branding={branding} /> : <LoginPreview branding={branding} />}
                    </div>
                    <p className="mt-3 text-center text-[11px] text-slate-500">Arraste a borda direita da prévia para ajustar livremente o tamanho.</p>
                </div>
            </section>
        </div>,
        document.body,
    );
}

export default TenantBrandingPreviewModal;
