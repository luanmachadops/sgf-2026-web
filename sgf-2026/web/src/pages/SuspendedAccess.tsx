import { AlertCircle, Car, Mail, Phone } from '@/components/sgf/icons';
import { readSuspendedTenant } from '@/lib/authErrors';

export default function SuspendedAccess() {
  const tenant = readSuspendedTenant();

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-[var(--sgf-dark)] to-[var(--sgf-primary)] p-6">
      <section className="w-full max-w-lg rounded-[2.5rem] bg-white p-8 text-center shadow-2xl sm:p-12">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-amber-100 text-amber-700">
          <AlertCircle className="h-10 w-10" />
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-[var(--sgf-primary)]">
          <Car className="h-5 w-5" />
          Exattus Rotta
        </div>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">Serviço temporariamente suspenso</h1>
        <p className="mt-4 text-slate-600">
          O acesso de {tenant?.name ? <strong>{tenant.name}</strong> : 'sua prefeitura'} está temporariamente suspenso.
          Entre em contato com o suporte para saber mais informações e regularizar o serviço.
        </p>

        {(tenant?.supportEmail || tenant?.supportPhone) && (
          <div className="mt-8 space-y-3 rounded-2xl bg-slate-50 p-5 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Fale com o suporte</p>
            {tenant.supportEmail && (
              <a className="flex items-center gap-3 font-semibold text-[var(--sgf-primary)] hover:underline" href={`mailto:${tenant.supportEmail}`}>
                <Mail className="h-5 w-5" /> {tenant.supportEmail}
              </a>
            )}
            {tenant.supportPhone && (
              <a className="flex items-center gap-3 font-semibold text-[var(--sgf-primary)] hover:underline" href={`tel:${tenant.supportPhone.replace(/[^\d+]/g, '')}`}>
                <Phone className="h-5 w-5" /> {tenant.supportPhone}
              </a>
            )}
          </div>
        )}

        <a href="/login" className="mt-8 inline-flex rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          Voltar ao login
        </a>
      </section>
    </main>
  );
}
