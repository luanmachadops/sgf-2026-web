import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { PartnerNotificationBell } from '@/components/partners/PartnerNotificationBell';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    LogOut,
    Menu,
    ShieldCheck,
    User,
    X,
    type IconType,
} from '@/components/sgf/icons';
import { cn } from '@/lib/utils';

export interface PartnerNavItem {
    label: string;
    path: string;
    icon: IconType;
    end?: boolean;
}

interface PartnerPortalLayoutProps {
    portal: 'posto' | 'oficina';
    systemName: string;
    partnerName?: string;
    title: string;
    description: string;
    navItems: PartnerNavItem[];
    children: ReactNode;
    headerMeta?: ReactNode;
}

function PartnerSidebar({
    navItems,
    systemName,
    mobile,
    onClose,
}: {
    navItems: PartnerNavItem[];
    systemName: string;
    mobile?: boolean;
    onClose?: () => void;
}) {
    const { user, logout } = useAuth();
    const { branding } = useBranding();
    return (
        <aside className="flex h-full w-[240px] flex-col bg-[#0F2B2F] text-white">
            <div className="flex h-[72px] shrink-0 items-center gap-3 px-5">
                <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center',
                    branding.sealUrl || branding.logoUrl
                        ? ''
                        : 'rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600',
                )}>
                    {branding.sealUrl || branding.logoUrl ? (
                        <img
                            src={branding.sealUrl || branding.logoUrl}
                            alt={branding.name}
                            className="h-full w-full object-contain"
                        />
                    ) : (
                        <ShieldCheck className="h-5 w-5 text-white" />
                    )}
                </div>
                <div className="min-w-0 flex-1 leading-none">
                    <p className="truncate text-[13px] font-semibold">{branding.name}</p>
                    <p className="mt-1 truncate text-[10px] font-medium text-emerald-400/80">{systemName}</p>
                </div>
                {mobile && (
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white">
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="mx-4 h-px bg-white/[0.06]" />
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                    Portal do parceiro
                </p>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.end}
                            onClick={onClose}
                            className={({ isActive }) => cn(
                                'flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium transition',
                                isActive
                                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-950/30'
                                    : 'text-white/50 hover:bg-white/[0.06] hover:text-white/90',
                            )}
                        >
                            <Icon className="h-[18px] w-[18px]" />
                            <span>{item.label}</span>
                        </NavLink>
                    );
                })}
            </nav>

            <div className="mx-4 h-px bg-white/[0.06]" />
            <div className="p-3">
                <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400">
                        <User className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-white/90">{user?.name || 'Parceiro'}</p>
                        <p className="truncate text-[10px] font-medium text-white/35">{systemName}</p>
                    </div>
                    <button
                        type="button"
                        title="Sair"
                        onClick={() => void logout()}
                        className="rounded-md p-1.5 text-white/30 transition hover:bg-rose-500/15 hover:text-rose-400"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}

export function PartnerPortalLayout({
    portal,
    systemName,
    partnerName,
    title,
    description,
    navItems,
    children,
    headerMeta,
}: PartnerPortalLayoutProps) {
    const { user, logout } = useAuth();
    const { branding } = useBranding();
    const [mobileOpen, setMobileOpen] = useState(false);
    const fallbackPath = portal === 'posto' ? '/posto' : '/oficina';

    return (
        <div className="flex h-[100dvh] overflow-hidden bg-[#0F2B2F]">
            <div className="hidden lg:block">
                <PartnerSidebar navItems={navItems} systemName={systemName} />
            </div>

            {mobileOpen && (
                <>
                    <button
                        type="button"
                        aria-label="Fechar menu"
                        onClick={() => setMobileOpen(false)}
                        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    />
                    <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
                        <PartnerSidebar
                            navItems={navItems}
                            systemName={systemName}
                            mobile
                            onClose={() => setMobileOpen(false)}
                        />
                    </div>
                </>
            )}

            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden lg:ml-6 lg:mt-4">
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#E3E9E7] lg:rounded-tl-[32px] lg:shadow-2xl">
                    <header className="sticky top-0 z-30 bg-[#E3E9E7]/85 px-4 pb-2 pt-6 backdrop-blur-md md:px-8">
                        <div className="mx-auto flex min-h-[5rem] w-full max-w-[1400px] items-center gap-4 py-3 md:py-0">
                            <button
                                type="button"
                                onClick={() => setMobileOpen(true)}
                                className="-ml-2 shrink-0 rounded-xl p-2 text-slate-500 hover:bg-black/5 lg:hidden"
                            >
                                <Menu className="h-6 w-6" />
                            </button>
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                                        {branding.name}
                                    </span>
                                    {partnerName && (
                                        <>
                                            <span className="text-slate-300">•</span>
                                            <span className="truncate text-[11px] font-semibold text-slate-400">{partnerName}</span>
                                        </>
                                    )}
                                </div>
                                <h1 className="truncate text-xl font-semibold tracking-tight text-slate-800 md:text-2xl">{title}</h1>
                                <p className="mt-1 truncate text-sm text-slate-500">{description}</p>
                            </div>
                            {headerMeta && <div className="hidden shrink-0 xl:block">{headerMeta}</div>}
                            <div className="flex shrink-0 items-center gap-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            className="flex items-center gap-3 rounded-full p-1 pl-3 transition hover:bg-black/5"
                                        >
                                            <div className="hidden min-w-[80px] flex-col items-end md:flex">
                                                <span className="w-full truncate text-[13px] font-semibold text-slate-700">
                                                    {user?.name?.split(' ')[0] || 'Parceiro'}
                                                </span>
                                                <span className="w-full truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                                    {portal}
                                                </span>
                                            </div>
                                            <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 border-emerald-500/20 bg-emerald-50 text-emerald-600">
                                                {user?.photoUrl ? (
                                                    <img src={user.photoUrl} alt={user.name} className="h-full w-full object-cover" />
                                                ) : (
                                                    <User className="h-5 w-5" />
                                                )}
                                            </div>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64 rounded-2xl border-slate-200 bg-white p-2 shadow-xl">
                                        <DropdownMenuLabel>
                                            <p className="truncate font-bold text-slate-900">{user?.name}</p>
                                            <p className="truncate text-xs font-normal text-slate-400">{user?.email}</p>
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem asChild className="rounded-xl py-2.5">
                                            <NavLink to={`${fallbackPath}/dados`}><User /> Meus dados</NavLink>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            variant="destructive"
                                            className="rounded-xl py-2.5"
                                            onSelect={() => void logout()}
                                        >
                                            <LogOut /> Sair
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                {user?.id && (
                                    <PartnerNotificationBell userId={user.id} fallbackPath={fallbackPath} variant="light" />
                                )}
                            </div>
                        </div>
                    </header>

                    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-8">
                        <div className="mx-auto w-full max-w-[1400px]">
                            {children}
                            <footer className="flex items-center justify-between gap-3 py-8 text-xs text-slate-400">
                                <span>SGF 2026 · {branding.name}</span>
                                <span>{systemName}</span>
                            </footer>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
