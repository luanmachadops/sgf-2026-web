import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useMyProfile } from './lib/profile';
import { NotificationBell } from './components/Notifications';
import { AppLaunchSplash } from './components/pwa/AppLaunchSplash';
import {
  Home, Building2, FileText, Receipt, Sparkle, Settings2, LogOut, User, Menu, Map, ShieldCheck, MapPin,
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
  { title: 'Plataforma', items: [{ icon: Home, label: 'Visão geral', path: '/' }] },
  { title: 'Gestão', items: [
    { icon: Building2, label: 'Prefeituras', path: '/prefeituras' },
    { icon: ShieldCheck, label: 'Acessos', path: '/acessos' },
    { icon: Map, label: 'Rastreadores', path: '/rastreadores' },
    { icon: MapPin, label: 'Monitoramento GPS', path: '/monitoramento' },
    { icon: FileText, label: 'Contratos', path: '/contratos' },
    { icon: Receipt, label: 'Pagamentos', path: '/pagamentos' },
  ] },
  { title: 'Inteligência', items: [{ icon: Sparkle, label: 'Uso de IA', path: '/ia' }] },
  { title: 'Sistema', items: [{ icon: Settings2, label: 'Configurações', path: '/configuracoes' }] },
];

/**
 * Menu no padrão do app: painel escuro (#0F2B2F) com cantos de 28px, itens em
 * pílula; o ativo inverte para branco com tinta escura, como a pílula ativa da
 * barra de abas do motorista.
 */
function SidebarContent({ onNavigate, rail }: { onNavigate?: () => void; rail?: boolean }) {
  // Modo trilho (tablet): só ícones; os textos aparecem quando o mouse entra e o painel se expande.
  // Recolhido, os textos saem do fluxo (hidden) para o ícone ficar exatamente no centro.
  const hide = rail ? 'hidden group-hover/rail:block' : '';
  const { email, logout } = useAuth();
  const { data: me } = useMyProfile();
  const location = useLocation();
  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-[28px] ${rail ? 'w-[60px] transition-[width] duration-200 ease-out group-hover/rail:w-[264px] group-hover/rail:shadow-[0_24px_64px_rgb(15_43_47/0.35)]' : 'w-[264px]'} bg-[var(--rt-ink900)] text-white`}>
      <div className={`flex shrink-0 items-center gap-3 pb-4 pt-6 ${rail ? 'px-[10px]' : 'px-5'}`}>
        <img src="/exattus-rotta.svg" alt="" className={`shrink-0 ${rail ? 'h-[40px] w-[40px]' : 'h-10 w-10'}`} />
        <div className={`min-w-0 leading-tight ${hide}`}>
          <p className="truncate text-[15px] font-bold tracking-[-0.01em]">Exattus Rotta</p>
          <p className="text-xs font-medium text-white/50">Superadmin</p>
        </div>
      </div>

      <nav className={`rt-scroll flex-1 overflow-y-auto overflow-x-hidden pb-3 ${rail ? 'px-[6px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'px-3'}`}>
        {SECTIONS.map((section) => (
          <div key={section.title} className="mt-4 first:mt-1">
            <p className={`mb-1.5 select-none truncate whitespace-nowrap px-3 text-[11px] font-medium text-white/35 ${rail ? 'invisible group-hover/rail:visible' : ''}`}>{section.title}</p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    title={rail ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-full ${rail ? 'h-[44px] px-[15px]' : 'h-11 px-3.5'} text-[13px] font-medium transition ${
                      active ? 'bg-white text-[var(--rt-ink900)] shadow-[0_6px_16px_rgb(0_0_0/0.18)]' : 'text-white/65 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-[var(--rt-brand)]' : ''}`} />
                    <span className={`truncate whitespace-nowrap ${hide}`}>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`shrink-0 ${rail ? 'p-[4px]' : 'p-3'}`}>
        <div className={`flex items-center gap-3 rounded-[22px] ${rail ? 'p-[6px]' : 'p-2.5'} ${rail ? 'group-hover/rail:bg-white/[0.06]' : 'bg-white/[0.06]'}`}>
          <NavLink to="/configuracoes" onClick={onNavigate} className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--rt-brand)] ${rail ? 'h-[40px] w-[40px]' : 'h-10 w-10'} text-white`} title="Meu perfil">
            {me?.photoSrc ? <img src={me.photoSrc} alt="" className="h-full w-full object-cover" /> : <User className="h-5 w-5" />}
          </NavLink>
          <div className={`min-w-0 flex-1 ${hide}`}>
            <p className="truncate text-sm font-semibold">{me?.full_name || 'Superusuário'}</p>
            <p className="truncate text-[11px] text-white/45">{email}</p>
          </div>
          <button onClick={logout} title="Sair" aria-label="Sair" className={`${rail ? 'hidden group-hover/rail:grid' : 'grid'} h-9 w-9 shrink-0 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white`}>
            <LogOut className="h-[18px] w-[18px]" />
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
    <div className="flex h-screen overflow-hidden bg-[var(--rt-paper)]">
      {/* Menu flutuante no desktop */}
      <div className="hidden shrink-0 p-4 pr-0 lg:block"><SidebarContent /></div>

      {/* Tablet: trilho de ícones que se expande por cima do conteúdo ao passar o mouse */}
      <div className="relative hidden w-[76px] shrink-0 md:block lg:hidden">
        <div className="group/rail absolute inset-y-0 left-0 z-40 p-4 pr-0">
          <SidebarContent rail />
        </div>
      </div>

      {/* Drawer no mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-[var(--rt-ink900)]/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 p-3">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barra superior no mobile */}
        <div className="flex h-16 shrink-0 items-center gap-3 px-4 md:hidden">
          <button onClick={() => setMobileOpen(true)} className="grid h-11 w-11 place-items-center rounded-full bg-white text-[var(--rt-ink900)] shadow-[var(--rt-shadow-card)]" aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <img src="/exattus-rotta.svg" alt="" className="h-8 w-8" />
          <span className="text-[15px] font-bold text-[var(--rt-ink900)]">Exattus Rotta</span>
          <div className="ml-auto"><NotificationBell onDark={false} /></div>
        </div>

        {/* Barra superior no tablet/desktop: avisos no canto direito, como nos sites */}
        <div className="hidden h-[72px] shrink-0 items-center justify-end px-6 md:flex lg:px-10">
          <NotificationBell onDark={false} />
        </div>

        <main className="rt-scroll flex-1 overflow-y-auto scroll-smooth px-4 pb-10 pt-2 sm:px-6 md:pt-0 lg:px-10">
          <div className="mx-auto w-full max-w-[1320px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function Private() {
  const { userId, isSuperadmin, isLoading } = useAuth();
  if (isLoading) return <div className="grid min-h-screen place-items-center text-[var(--rt-ink400)]">Carregando…</div>;
  if (!userId || !isSuperadmin) return <Navigate to="/login" replace />;
  return <Shell />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppLaunchSplash />
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
