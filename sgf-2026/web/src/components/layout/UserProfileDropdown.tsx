import {
    BadgeCheck,
    Building2,
    CalendarClock,
    LogOut,
    Mail,
    Settings2,
    Person as UserIcon,
} from '@/components/sgf/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const roleLabels = {
    ADMIN: 'Administrador',
    MANAGER: 'Gestor',
    VIEWER: 'Visualizador',
} as const;

function formatCreatedAt(date: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(date));
}

function getInitials(name?: string) {
    if (!name) return 'SG';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default function UserProfileDropdown() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    if (!user) {
        return null;
    }

    return (
        <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={12}
            className="w-[340px] overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-0 shadow-[0_24px_60px_rgba(15,43,47,0.18)] z-[1050]"
        >
            <DropdownMenuLabel className="p-0">
                <div className="rounded-t-[22px] bg-[linear-gradient(135deg,rgba(15,43,47,1),rgba(0,168,107,0.88))] px-[var(--sgf-space-5)] py-[var(--sgf-space-5)] text-white">
                    <div className="flex items-center gap-[var(--sgf-space-4)]">
                        <div className="flex h-[3.5rem] w-[3.5rem] items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/12 shadow-inner">
                            {user.photoUrl ? (
                                <img src={user.photoUrl} alt={user.name} className="h-full w-full object-cover" />
                            ) : (
                                <span className="text-[var(--sgf-text-lg)] font-[var(--sgf-font-bold)] tracking-[0.06em]">
                                    {getInitials(user.name)}
                                </span>
                            )}
                        </div>

                        <div className="min-w-0">
                            <p className="truncate text-[15px] font-[var(--sgf-font-semibold)] text-white">
                                {user.name}
                            </p>
                            <p className="mt-[2px] truncate text-[12px] text-white/72">
                                {user.email || 'usuario@sgf.local'}
                            </p>
                        </div>
                    </div>
                </div>
            </DropdownMenuLabel>

            <div className="space-y-[var(--sgf-space-2)] px-[var(--sgf-space-3)] py-[var(--sgf-space-3)]">
                <div className="rounded-[16px] border border-slate-200 bg-slate-50/90 px-[var(--sgf-space-4)] py-[var(--sgf-space-3)]">
                    <div className="flex items-center gap-[var(--sgf-space-3)] text-slate-600">
                        <BadgeCheck className="h-4 w-4 text-emerald-600" />
                        <span className="text-[11px] font-[var(--sgf-font-bold)] uppercase tracking-[0.14em]">Perfil</span>
                    </div>
                    <p className="mt-[var(--sgf-space-2)] text-[13px] font-[var(--sgf-font-semibold)] text-slate-900">
                        {roleLabels[user.role]}
                    </p>
                </div>

                <div className="rounded-[16px] border border-slate-200 bg-slate-50/90 px-[var(--sgf-space-4)] py-[var(--sgf-space-3)]">
                    <div className="flex items-center gap-[var(--sgf-space-3)] text-slate-600">
                        <Building2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-[11px] font-[var(--sgf-font-bold)] uppercase tracking-[0.14em]">Secretaria</span>
                    </div>
                    <p className="mt-[var(--sgf-space-2)] text-[13px] font-[var(--sgf-font-semibold)] text-slate-900">
                        {user.departmentName || 'Nao vinculada'}
                    </p>
                </div>
            </div>

            <DropdownMenuSeparator className="mx-0 my-0 bg-slate-200" />

            <div className="px-[var(--sgf-space-2)] py-[var(--sgf-space-2)]">
                <div className="flex items-center gap-[var(--sgf-space-3)] rounded-[14px] px-[var(--sgf-space-3)] py-[var(--sgf-space-3)] text-slate-700">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <div className="min-w-0">
                        <p className="text-[13px] font-[var(--sgf-font-medium)]">Conta</p>
                        <p className="truncate text-[11px] text-slate-500">{user.email || 'Nao informado'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-[var(--sgf-space-3)] rounded-[14px] px-[var(--sgf-space-3)] py-[var(--sgf-space-3)] text-slate-700">
                    <CalendarClock className="h-4 w-4 text-slate-400" />
                    <div className="min-w-0">
                        <p className="text-[13px] font-[var(--sgf-font-medium)]">Membro desde</p>
                        <p className="truncate text-[11px] text-slate-500">{formatCreatedAt(user.createdAt)}</p>
                    </div>
                </div>

                <div className="flex items-center gap-[var(--sgf-space-3)] rounded-[14px] px-[var(--sgf-space-3)] py-[var(--sgf-space-3)] text-slate-700">
                    <Settings2 className="h-4 w-4 text-slate-400" />
                    <div className="min-w-0">
                        <p className="text-[13px] font-[var(--sgf-font-medium)]">Ambiente</p>
                        <p className="truncate text-[11px] text-slate-500">Painel Administrativo SGF 2026</p>
                    </div>
                </div>
            </div>

            <DropdownMenuSeparator className="mx-0 my-0 bg-slate-200" />

            <div className="p-[var(--sgf-space-2)] space-y-1">
                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); navigate('/perfil'); }}
                    className="h-11 rounded-[14px] px-[var(--sgf-space-3)] text-[13px] font-[var(--sgf-font-semibold)] text-slate-700"
                >
                    <UserIcon className="h-4 w-4 text-slate-400" />
                    Meu perfil
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); navigate('/configuracoes'); }}
                    className="h-11 rounded-[14px] px-[var(--sgf-space-3)] text-[13px] font-[var(--sgf-font-semibold)] text-slate-700"
                >
                    <Settings2 className="h-4 w-4 text-slate-400" />
                    Configurações
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={(e) => {
                        e.preventDefault();
                        logout();
                    }}
                    variant="destructive"
                    className="h-11 rounded-[14px] px-[var(--sgf-space-3)] text-[13px] font-[var(--sgf-font-semibold)]"
                >
                    <LogOut className="h-4 w-4" />
                    Sair do sistema
                </DropdownMenuItem>
            </div>
        </DropdownMenuContent>
    );
}
