import { Building2 } from '@/components/sgf/icons';
import type { Tenant } from '@/lib/api';

type TenantIdentityData = Pick<Tenant, 'name' | 'photo_url' | 'seal_url' | 'logo_url'>;

export function TenantIdentity({ tenant, fallback = '—' }: { tenant?: TenantIdentityData | null; fallback?: string }) {
  if (!tenant) return <span className="text-slate-400">{fallback}</span>;
  const image = tenant.photo_url || tenant.seal_url || tenant.logo_url;

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-50 text-[var(--sgf-primary)]">
        {image
          ? <img src={image} alt="" className="h-full w-full object-cover" />
          : <Building2 className="h-4 w-4" />}
      </span>
      <span className="truncate font-medium text-slate-800">{tenant.name}</span>
    </span>
  );
}
