import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Map,
    Car,
    Users,
    Fuel,
    Droplet,
    Wrench,
    Camera,
    Route,
    BuildingGovernment,
    Toolbox,
    Gavel,
    BarChart3,
    Settings2,
    ShieldCheck,
    Clipboard,
    X,
    LogOut,
    User,
    Menu,
    Bell,
} from '@/components/sgf/icons';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { ProfilePhoto } from '@/components/sgf/ProfilePhoto';
import { useBranding } from '@/contexts/BrandingContext';
import { canAccessModule, type AccessModule } from '@/lib/accessModules';
import { procurementAccess } from '@/lib/procurement-navigation';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// --- Configuration ---
type MenuItem = {
    icon: typeof Car;
    label: string;
    path: string;
    badge?: string;
    module?: AccessModule;
    accessManagersOnly?: boolean;
    auditOnly?: boolean;
    procurement?: boolean;
};
type MenuSection = { title: string; items: MenuItem[] };
const menuSections: MenuSection[] = [
    {
        title: 'Visão geral',
        items: [
            { icon: LayoutDashboard, label: 'Dashboard', path: '/', module: 'dashboard' },
            { icon: Map, label: 'Mapa', path: '/mapa', module: 'map' },
            { icon: Bell, label: 'Notificações', path: '/notificacoes', module: 'notifications' },
        ]
    },
    {
        title: 'Operação',
        items: [
            { icon: Route, label: 'Viagens', path: '/viagens', module: 'trips' },
            { icon: Clipboard, label: 'Checklists', path: '/checklists', module: 'checklists' },
            { icon: Camera, label: 'Infrações', path: '/infracoes', module: 'infractions' },
        ]
    },
    {
        title: 'Frota',
        items: [
            { icon: Car, label: 'Veículos', path: '/veiculos', module: 'fleet' },
            { icon: Users, label: 'Motoristas', path: '/motoristas', module: 'drivers' },
            { icon: BuildingGovernment, label: 'Secretarias', path: '/secretarias', module: 'departments' },
        ]
    },
    {
        title: 'Combustível',
        items: [
            { icon: Fuel, label: 'Abastecimentos', path: '/abastecimentos', module: 'refuelings' },
            { icon: Droplet, label: 'Postos', path: '/postos', module: 'stations' },
        ]
    },
    {
        title: 'Manutenção',
        items: [
            { icon: Wrench, label: 'Manutenções', path: '/manutencoes', module: 'maintenances' },
            { icon: Toolbox, label: 'Oficinas', path: '/oficinas', module: 'repair_shops' },
        ]
    },
    {
        title: 'Administração',
        items: [
            { icon: Gavel, label: 'Licitações e Contratos', path: '/licitacoes', procurement: true },
            { icon: BarChart3, label: 'Relatórios & Auditoria', path: '/relatorios', module: 'reports' },
        ]
    },
    {
        title: 'Sistema',
        items: [
            { icon: ShieldCheck, label: 'Gerenciar acessos', path: '/acessos', accessManagersOnly: true },
            { icon: ShieldCheck, label: 'Trilha de auditoria', path: '/auditoria', auditOnly: true },
            { icon: Settings2, label: 'Configurações', path: '/configuracoes', module: 'settings' },
        ]
    }
];
const GLOBAL_ONLY_PATHS = new Set([
    '/postos',
    '/oficinas',
    '/secretarias',
    '/relatorios',
    '/configuracoes',
]);

// --- Internal Components ---

interface SidebarContentProps {
    isCollapsed: boolean;
    onToggle: () => void;
    showToggle: boolean;
}

function SidebarContent({ isCollapsed, onToggle, showToggle }: SidebarContentProps) {
    const location = useLocation();
    const { user, logout } = useAuth();
    const { branding } = useBranding();
    const departmentScoped = Boolean(user?.departmentScopeId);
    const procurement = procurementAccess(user);
    // Gestão de acessos: só administrador e superadministrador.
    const canManageAccess = user?.accountRole === 'admin'
        || user?.accountRole === 'superadmin';
    const canSeeAudit = user?.accountRole === 'admin'
        || user?.accountRole === 'superadmin'
        || (user?.accountRole === 'gestor' && !departmentScoped);
    const visibleSections = menuSections
        .map((section) => ({
            ...section,
            items: section.items
                .filter((item) => !item.procurement || Boolean(procurement.entry))
                .map((item) => item.procurement ? { ...item, path: procurement.entry ?? item.path } : item)
                .filter((item) => !item.accessManagersOnly || canManageAccess)
                .filter((item) => !item.auditOnly || canSeeAudit)
                .filter((item) => !item.module || canAccessModule(user?.allowedModules, item.module))
                .filter((item) => !departmentScoped || !GLOBAL_ONLY_PATHS.has(item.path)),
        }))
        .filter((section) => section.items.length > 0);

    return (
        <div
            className={cn(
                "flex flex-col h-full transition-all duration-300",
                isCollapsed ? "w-[64px] items-center" : "w-[240px]",
            )}
            style={{ backgroundColor: 'var(--sgf-dark)' }}
        >
            {/* Logo Section */}
            <div className={cn(
                "flex shrink-0 items-center relative",
                isCollapsed
                    ? "flex-col pt-4 pb-2 gap-4 h-[120px] justify-start"
                    : "flex-col justify-center px-5 pt-5 pb-4 gap-2.5 text-center"
            )}>
                {/* Hamburger Toggle (collapsed) */}
                {showToggle && isCollapsed && (
                    <button
                        onClick={onToggle}
                        className="text-white/30 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                )}

                {/* Logo icon — brasão sem fundo/cantos; só o fallback usa o box estilizado */}
                <div className={cn("flex shrink-0 items-center justify-center", isCollapsed ? "h-9 w-9" : "h-14 w-14")}>
                    <img src={branding.sealUrl || branding.logoUrl || '/exattus-rotta.svg'} alt={branding.name} className="h-full w-full object-contain" />
                </div>

                {/* Brand text */}
                {!isCollapsed && (
                    <div className="flex flex-col items-center leading-tight">
                        <span className="line-clamp-2 max-w-[200px] text-[13px] font-semibold tracking-tight text-white">{branding.name}</span>
                    </div>
                )}

                {/* Close Button */}
                {showToggle && !isCollapsed && (
                    <button
                        onClick={onToggle}
                        className="absolute right-3 top-3 text-white/30 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/5"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Divider */}
            <div className="shrink-0 mx-4 h-px bg-white/[0.06]" />

            {/* Navigation */}
            <nav className={cn(
                "flex-1 overflow-y-auto py-3 custom-scrollbar",
                isCollapsed ? "px-2" : "px-3"
            )}>
                {visibleSections.map((section, sectionIndex) => (
                    <div key={sectionIndex} className="mb-3 last:mb-0">
                        {/* Section header */}
                        {!isCollapsed && (
                            <p className="mb-1 px-2 text-[9px] font-normal uppercase tracking-[0.06em] text-white/30 select-none">
                                {section.title}
                            </p>
                        )}
                        {isCollapsed && (
                            <div className="mb-2 w-5 h-px bg-white/10 mx-auto" />
                        )}

                        {/* Items */}
                        <div className="space-y-0.5">
                            {section.items.map((item) => {
                                const Icon = item.icon;
                                const isActive = item.path === '/'
                                    ? location.pathname === '/'
                                    : location.pathname.startsWith(item.path);

                                return (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        title={isCollapsed ? item.label : undefined}
                                        className={({ isActive }) =>
                                            cn(
                                                'group flex items-center rounded-lg py-2 text-[13px] font-medium transition-all duration-150',
                                                isCollapsed
                                                    ? "justify-center px-0 w-10 h-9 mx-auto"
                                                    : "px-2 gap-2.5",
                                                isActive
                                                    ? 'bg-[var(--sgf-primary)] text-[var(--sgf-primary-contrast)] shadow-md'
                                                    : 'text-white/50 hover:bg-white/[0.06] hover:text-white/90'
                                            )
                                        }
                                    >
                                        <Icon className="h-[18px] w-[18px] shrink-0" />
                                        {!isCollapsed && (
                                            <>
                                                <span className="flex-1 truncate">{item.label}</span>
                                                {item.badge && (
                                                    <span className={cn(
                                                        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                                                        isActive
                                                            ? "bg-white/20 text-white"
                                                            : "bg-white/10 text-white/60"
                                                    )}>
                                                        {item.badge}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </NavLink>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Divider */}
            <div className="shrink-0 mx-4 h-px bg-white/[0.06]" />

            {/* Profile Section */}
            <div className={cn("shrink-0", isCollapsed ? "p-2" : "p-3")}>
                <div className={cn(
                    "flex items-center rounded-xl bg-white/[0.04] border border-white/[0.06] transition-all",
                    isCollapsed
                        ? "p-1.5 justify-center flex-col gap-1.5"
                        : "px-3 py-2.5 gap-2.5"
                )}>
                    {/* Avatar */}
                    <div className={cn(
                        "shrink-0 overflow-hidden rounded-lg bg-[var(--sgf-primary)] flex items-center justify-center",
                        isCollapsed ? "h-8 w-8" : "h-8 w-8"
                    )}>
                        <ProfilePhoto
                            src={user?.photoUrl}
                            alt={user?.name ?? ''}
                            className="h-full w-full object-cover"
                            fallback={<User className="h-4 w-4 text-white" />}
                        />
                    </div>

                    {/* User info */}
                    {!isCollapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-white/90 truncate leading-tight">
                                {user?.name?.split(' ')[0] || 'Usuário'}
                            </p>
                            <p className="text-[10px] text-white/35 font-medium truncate mt-0.5 tracking-normal">
                                {user?.role || 'Visitante'}
                            </p>
                        </div>
                    )}

                    {/* Logout */}
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <button
                                title="Sair"
                                className="rounded-md text-white/25 hover:bg-rose-500/15 hover:text-rose-400 transition-colors p-1.5"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-[var(--sgf-dark)] border-white/10 text-white">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-white">Deseja realmente sair?</AlertDialogTitle>
                                <AlertDialogDescription className="text-white/60">
                                    Você voltará para a tela de login.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white border-0 transition-colors">
                                    Cancelar
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={(e) => {
                                        e.preventDefault();
                                        logout();
                                    }}
                                    className="bg-rose-500 text-white hover:bg-rose-600 border-0 transition-colors"
                                >
                                    Sair
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
        </div>
    );
}

// --- Main Sidebar Component ---

interface SidebarProps {
    variant: 'desktop' | 'compact' | 'mobile';
    isOpen: boolean;
    onToggle: () => void;
}

export default function Sidebar({ variant, isOpen, onToggle }: SidebarProps) {
    const showBackdrop = isOpen && (variant === 'mobile' || variant === 'compact');

    return (
        <>
            {/* Backdrop */}
            {showBackdrop && (
                <div
                    className="fixed inset-0 z-40 bg-black/50"
                    onClick={onToggle}
                />
            )}

            {/* Desktop Mode */}
            {variant === 'desktop' && (
                <aside className="relative h-full z-30">
                    <SidebarContent isCollapsed={false} onToggle={() => { }} showToggle={false} />
                </aside>
            )}

            {/* Compact Mode */}
            {variant === 'compact' && (
                <aside className="relative h-full z-30 hidden lg:flex">
                    <SidebarContent isCollapsed={true} onToggle={onToggle} showToggle={true} />
                </aside>
            )}

            {/* Overlay Drawer */}
            <aside
                className={cn(
                    'fixed left-0 top-0 z-50 h-full transform transition-transform duration-300',
                    isOpen ? 'translate-x-0' : '-translate-x-full',
                    variant === 'desktop' ? 'hidden' : 'block'
                )}
            >
                <SidebarContent
                    isCollapsed={false}
                    onToggle={onToggle}
                    showToggle={true}
                />
            </aside>
        </>
    );
}
