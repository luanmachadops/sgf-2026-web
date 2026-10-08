import { Car, User } from '@/components/sgf/icons';
import { EntityAvatar } from '@/components/sgf/EntityAvatar';

/**
 * Células padrão das tabelas: veículo (foto + placa + modelo) e motorista
 * (foto + nome). Mesmo formato em todas as telas do painel.
 */
export function VehicleCell({ plate, name, photoUrl, fallback = 'Sem veículo' }: {
    plate?: string | null;
    name?: string | null;
    photoUrl?: string | null;
    fallback?: string;
}) {
    const label = plate ? plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : null;
    return (
        <div className="flex min-w-0 items-center gap-3">
            <EntityAvatar url={photoUrl} icon={Car} alt={plate ?? 'Veículo'} square size="sm" />
            <div className="min-w-0 max-w-[220px]">
                <p className="whitespace-nowrap font-mono font-semibold text-slate-900">{label ?? <span className="font-sans font-medium text-slate-400">{fallback}</span>}</p>
                {name && <p className="truncate text-xs text-slate-500">{name}</p>}
            </div>
        </div>
    );
}

export function DriverCell({ name, photoUrl, subtitle, fallback = 'Sem motorista' }: {
    name?: string | null;
    photoUrl?: string | null;
    subtitle?: string | null;
    fallback?: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <EntityAvatar url={photoUrl} icon={User} alt={name ?? 'Motorista'} size="sm" />
            <div className="min-w-0 max-w-[240px]">
                <p className={`truncate ${name ? 'text-slate-700' : 'italic text-slate-400'}`}>{name || fallback}</p>
                {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
        </div>
    );
}
