import {
    Building2,
    CalendarClock,
    ChevronRight,
    LogOut,
    Settings2,
    ShieldCheck,
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

function formatCreatedAt(date?: string) {
    if (!date) return '—';
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

function InfoCell({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-slate-400">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</span>
            </div>
            <p className="mt-1.5 truncate text-[13px] font-semibold text-slate-800" title={value}>{value}</p>
        </div>
    );
}

export default function UserProfileDropdown() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    if (!user) return null;

    return (
        <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={12}
            className="w-[320px] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white p-0 shadow-[0_24px_60px_rgba(15,43,47,0.18)] z-[1050]"
        >
            {/* Cabeçalho — gradiente da marca (Primary Dark → Primary Green) */}
            <DropdownMenuLabel className="p-0">
                <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0F2B2F_0%,#0c5f4f_55%,#00A86B_100%)] px-5 pb-5 pt-5 text-white">
                    {/* brilho decorativo */}
                    <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
                    <div className="relative flex items-center gap-3.5">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/25 bg-white/10 shadow-inner">
                            {user.photoUrl ? (
                                <img src={user.photoUrl} alt={user.name} className="h-full w-full object-cover" />
                            ) : (
                                <span className="text-base font-bold tracking-[0.06em]">{getInitials(user.name)}</span>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold leading-tight">{user.name}</p>
                            <p className="mt-0.5 truncate text-[12px] text-white/70">{user.email || 'usuario@sgf.local'}</p>
                            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-sm">
                                <ShieldCheck className="h-3 w-3" />
                                {roleLabels[user.role]}
                            </span>
                        </div>
                    </div>
                </div>
            </DropdownMenuLabel>

            {/* Infos compactas */}
            <div className="grid grid-cols-2 gap-2 px-3 pb-1 pt-3">
                <InfoCell icon={Building2} label="Secretaria" value={user.departmentName || 'Não vinculada'} />
                <InfoCell icon={CalendarClock} label="Membro desde" value={formatCreatedAt(user.createdAt)} />
            </div>

            <DropdownMenuSeparator className="mx-3 my-2 bg-slate-100" />

            {/* Ações */}
            <div className="p-2 pt-0">
                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); navigate('/perfil'); }}
                    className="group h-11 rounded-xl px-3 text-[13px] font-semibold text-slate-700 focus:bg-slate-50"
                >
                    <UserIcon className="h-4 w-4 text-slate-400 group-focus:text-emerald-600" />
                    <span className="flex-1">Meu perfil</span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); navigate('/configuracoes'); }}
                    className="group h-11 rounded-xl px-3 text-[13px] font-semibold text-slate-700 focus:bg-slate-50"
                >
                    <Settings2 className="h-4 w-4 text-slate-400 group-focus:text-emerald-600" />
                    <span className="flex-1">Configurações</span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                </DropdownMenuItem>

                <DropdownMenuSeparator className="mx-1 my-1.5 bg-slate-100" />

                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); logout(); }}
                    variant="destructive"
                    className="h-11 rounded-xl px-3 text-[13px] font-semibold focus:bg-red-50"
                >
                    <LogOut className="h-4 w-4" />
                    Sair do sistema
                </DropdownMenuItem>
            </div>
        </DropdownMenuContent>
    );
}
