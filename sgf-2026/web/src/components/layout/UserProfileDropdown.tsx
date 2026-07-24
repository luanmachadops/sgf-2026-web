import { useNavigate } from 'react-router-dom';
import {
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    Building2,
    CalendarClock,
    ChevronRight,
    LogOut,
    Settings2,
    ShieldCheck,
    Person as UserIcon,
} from '@/components/sgf/icons';
import { useAuth } from '@/contexts/AuthContext';

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
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-[#F5F7F9] p-3 transition-colors hover:bg-slate-100/80">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#00A86B] shadow-sm border border-slate-200/60">
                <Icon className="h-4.5 w-4.5 text-[#00A86B]" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">{label}</p>
                <p className="truncate text-xs font-semibold text-[#1F2937]" title={value}>{value}</p>
            </div>
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
            sideOffset={10}
            className="w-[340px] overflow-hidden rounded-[24px] border border-slate-200/90 bg-white p-0 shadow-[0_24px_60px_rgba(15,43,47,0.22)] z-[1050]"
        >
            {/* Top Banner — #0F2B2F (Primary Dark) com brilho decorativo verde #00A86B */}
            <div className="relative overflow-hidden bg-[#0F2B2F] px-5 py-5 text-white">
                {/* Glow decorativo suave da marca */}
                <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-[#00A86B]/25 blur-2xl" />
                <div className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-[#70C4A8]/15 blur-xl" />

                <div className="relative flex items-center gap-4">
                    {/* Foto / Avatar com borda verde primária (#00A86B) */}
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#00A86B] bg-white/10 shadow-md">
                        {user.photoUrl ? (
                            <img src={user.photoUrl} alt={user.name} className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-lg font-bold tracking-wider text-white">{getInitials(user.name)}</span>
                        )}
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-[#22C55E] ring-2 ring-[#0F2B2F]" title="Sessão ativa" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-white leading-tight">{user.name}</p>
                        <p className="mt-0.5 truncate text-xs text-[#70C4A8]">{user.email || 'usuario@sgf.local'}</p>
                        
                        <div className="mt-2.5 flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#00A86B] px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                                <ShieldCheck className="h-3 w-3 text-white" />
                                {roleLabels[user.role] || user.role}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Informações da Conta em Células Elegantes */}
            <div className="grid grid-cols-1 gap-2.5 p-4 bg-white">
                <InfoCell icon={Building2} label="Secretaria" value={user.departmentName || 'Não vinculada'} />
                <InfoCell icon={CalendarClock} label="Cadastrado em" value={formatCreatedAt(user.createdAt)} />
            </div>

            <DropdownMenuSeparator className="my-0 bg-slate-100" />

            {/* Opções de Navegação e Ações */}
            <div className="p-3 space-y-1 bg-white">
                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); navigate('/perfil'); }}
                    className="group flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-[#1F2937] transition-all hover:bg-[#F5F7F9] focus:bg-[#F5F7F9] focus:text-[#00A86B]"
                >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-emerald-50 group-hover:text-[#00A86B]">
                        <UserIcon className="h-4 w-4" />
                    </div>
                    <span className="flex-1 font-medium text-slate-800 group-hover:text-[#00A86B]">Meu Perfil</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#00A86B]" />
                </DropdownMenuItem>

                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); navigate('/configuracoes'); }}
                    className="group flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-[#1F2937] transition-all hover:bg-[#F5F7F9] focus:bg-[#F5F7F9] focus:text-[#00A86B]"
                >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-emerald-50 group-hover:text-[#00A86B]">
                        <Settings2 className="h-4 w-4" />
                    </div>
                    <span className="flex-1 font-medium text-slate-800 group-hover:text-[#00A86B]">Configurações do Sistema</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#00A86B]" />
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1.5 bg-slate-100" />

                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); logout(); }}
                    variant="destructive"
                    className="group flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-[#DC2626] transition-all hover:bg-rose-50 focus:bg-rose-50 focus:text-rose-600"
                >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-500 transition-colors group-hover:bg-rose-100">
                        <LogOut className="h-4 w-4" />
                    </div>
                    <span className="flex-1 font-semibold text-rose-600">Sair do Sistema</span>
                </DropdownMenuItem>
            </div>
        </DropdownMenuContent>
    );
}
