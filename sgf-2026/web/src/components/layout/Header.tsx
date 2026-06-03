import React from 'react';
import { Menu, Person, User } from '@/components/sgf/icons';
import { useAuth } from '@/contexts/AuthContext';
import { useHeader } from '@/contexts/HeaderContext';
import {
    DropdownMenu,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UserProfileDropdown from './UserProfileDropdown';
import NotificationBell from './NotificationBell';

interface HeaderProps {
    onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
    const { user } = useAuth();
    const { title, description, headerAction } = useHeader();

    return (
        <header className="sticky top-0 z-30 w-full px-[var(--sgf-space-4)] md:px-[var(--sgf-space-8)] pt-[var(--sgf-space-6)] pb-[var(--sgf-space-2)] bg-[#E3E9E7]/80 backdrop-blur-md border-b-0">
          <div className="flex flex-wrap items-center gap-x-[var(--sgf-space-4)] gap-y-3 min-h-[5rem] max-w-[1400px] mx-auto w-full py-3 md:py-0">
            <div className="flex items-center gap-[var(--sgf-space-4)] min-w-0 flex-1">
                <button
                    type="button"
                    onClick={onMenuClick}
                    className="rounded-[var(--sgf-radius-base)] p-[var(--sgf-space-2)] -ml-[var(--sgf-space-2)] text-slate-500 hover:bg-black/5 lg:hidden transition-colors shrink-0"
                >
                    <Menu className="h-6 w-6" />
                </button>

                <div className="flex flex-col min-w-0">
                    <h1 className="text-[var(--sgf-text-xl)] md:text-[var(--sgf-text-2xl)] font-semibold text-slate-800 tracking-tight leading-none truncate">{title}</h1>
                    {description && (
                        <p className="text-[var(--sgf-text-sm)] text-slate-500 mt-[var(--sgf-space-1)] truncate">{description}</p>
                    )}
                </div>
            </div>

            {headerAction && (
                <div className="order-last w-full md:order-none md:w-auto md:mr-[var(--sgf-space-4)] flex flex-wrap items-center justify-end gap-2">
                    {headerAction}
                </div>
            )}

            <div className="flex items-center gap-[var(--sgf-space-2)] md:gap-[var(--sgf-space-3)] shrink-0">
                <NotificationBell />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="flex items-center gap-[var(--sgf-space-3)] rounded-full border border-transparent p-1 pl-3 transition-colors hover:border-black/5 hover:bg-black/5"
                        >
                            <div className="hidden min-w-[80px] flex-col items-end text-right md:flex">
                                <span className="w-full truncate text-[13px] font-semibold text-slate-700">{user?.name?.split(' ')[0] || 'Gestor'}</span>
                                <span className="w-full truncate text-[11px] font-medium uppercase tracking-[0.04em] text-slate-400">{user?.role || 'Admin'}</span>
                            </div>
                            <div className="h-8 w-8 md:h-9 md:w-9 rounded-full overflow-hidden border-2 border-emerald-500/20 shadow-sm shrink-0">
                                {user?.photoUrl ? (
                                    <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                        <User className="h-4 w-4 md:h-5 md:w-5" />
                                    </div>
                                )}
                            </div>
                        </button>
                    </DropdownMenuTrigger>

                    <UserProfileDropdown />
                </DropdownMenu>
            </div>
          </div>
        </header>
    );
}
