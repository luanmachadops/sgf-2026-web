import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import {
  LayoutDashboard, Building2, FileText, Receipt, Sparkle, Settings2, LogOut, User, Menu, X, Map, ShieldCheck, MapPin,
} from './components/sgf/icons';
import type { IconType } from './components/sgf/icons';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import TenantDetail from './pages/TenantDetail';
import Invoices from './pages/Invoices';
import Contracts from './pages/Contracts';
import AiUsage from './pages/AiUsage';
import Settings from './pages/Settings';
import Trackers from './pages/Trackers';
import Iopgps from './pages/Iopgps';
import Access from './pages/Access';

type Item = { icon: IconType; label: string; path: string };
type Section = { title: string; items: Item[] };
const SECTIONS: Section[] = [
  { title: 'Plataforma', items: [{ icon: LayoutDashboard, label: 'Visão Geral', path: '/' }] },
  { title: 'Gestão', items: [
    { icon: Building2, label: 'Prefeituras', path: '/prefeituras' },
    { icon: ShieldCheck, label: 'Gestão de Acessos', path: '/acessos' },
    { icon: Map, label: 'Rastreadores', path: '/rastreadores' },
    { icon: MapPin, label: 'Monitoramento GPS', path: '/monitoramento' },
    { icon: FileText, label: 'Licitações & Contratos', path: '/contratos' },
    { icon: Receipt, label: 'Pagamentos', path: '/pagamentos' },
  ] },
  { title: 'Inteligência', items: [{ icon: Sparkle, label: 'Uso de IA', path: '/ia' }] },
  { title: 'Sistema', items: [{ icon: Settings2, label: 'Configurações', path: '/configuracoes' }] },
];

function SidebarContent({ onNavigate, onClose }: { onNavigate?: () => void; onClose?: () => void }) {
  const { email, logout } = useAuth();
  const location = useLocation();
  return (
    <div className="flex h-full w-[260px] flex-col" style={{ backgroundColor: '#0F2B2F' }}>
      <div className="flex h-[72px] shrink-0 items-center gap-3 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-900/30">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[13px] font-semibold tracking-tight text-white">SGF • Superusuário</span>
          <span className="mt-0.5 text-[11px] font-medium tracking-normal text-emerald-400/80">Gestão de Prefeituras</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-auto rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white lg:hidden">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mx-4 h-px shrink-0 bg-white/[0.06]" />

      <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-3">
        {SECTIONS.map((section, i) => (
          <div key={i} className="mb-4 last:mb-0">
            <p className="mb-1 select-none px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-white/30">{section.title}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
                const Icon = item.icon;
                return (
                  <NavLink key={item.path} to={item.path} onClick={onNavigate}
                    className={`group flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium transition-all duration-150 ${active ? 'bg-emerald-500 text-white shadow-md shadow-emerald-900/40' : 'text-white/50 hover:bg-white/[0.06] hover:text-white/90'}`}>
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mx-4 h-px shrink-0 bg-white/[0.06]" />

      <div className="shrink-0 p-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400">
            <User className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight text-white/90">Superusuário</p>
            <p className="mt-0.5 truncate text-[10px] font-medium tracking-normal text-white/35">{email}</p>
          </div>
          <button onClick={logout} title="Sair" className="rounded-md p-1.5 text-white/25 transition-colors hover:bg-rose-500/15 hover:text-rose-400">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Fecha o drawer ao trocar de rota.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'hsl(181, 46%, 18%)' }}>
      {/* Sidebar fixa no desktop */}
      <div className="hidden lg:block"><SidebarContent /></div>

      {/* Drawer no mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-2xl animate-in slide-in-from-left duration-200">
            <SidebarContent onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden bg-[#E3E9E7] lg:ml-6 lg:mt-4 lg:rounded-tl-[32px] lg:shadow-2xl">
          {/* Top bar mobile */}
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-black/5 px-4 lg:hidden">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-black/5" aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-bold text-slate-800">SGF • Superusuário</span>
          </div>

          <main className="custom-scrollbar flex-1 overflow-y-auto scroll-smooth p-[var(--sgf-space-4)] md:p-[var(--sgf-space-8)]">
            <div className="mx-auto w-full max-w-[1400px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Private() {
  const { userId, isSuperadmin, isLoading } = useAuth();
  if (isLoading) return <div className="grid min-h-screen place-items-center text-slate-400">Carregando…</div>;
  if (!userId || !isSuperadmin) return <Navigate to="/login" replace />;
  return <Shell />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<Private />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/prefeituras" element={<Tenants />} />
          <Route path="/prefeituras/:id" element={<TenantDetail />} />
          <Route path="/rastreadores" element={<Trackers />} />
          <Route path="/monitoramento" element={<Iopgps />} />
          <Route path="/acessos" element={<Access />} />
          <Route path="/contratos" element={<Contracts />} />
          <Route path="/pagamentos" element={<Invoices />} />
          <Route path="/ia" element={<AiUsage />} />
          <Route path="/configuracoes" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
