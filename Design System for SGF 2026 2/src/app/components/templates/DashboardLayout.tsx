/**
 * SGF 2026 - Dashboard Layout Template
 * Template de layout completo para páginas do sistema
 */

import React, { useState } from 'react';
import { SGFButton, SGFBadge } from '@/app/components/sgf';
import {
  LayoutDashboard,
  Map as MapIcon,
  Truck,
  Users,
  Fuel,
  Wrench,
  Bell,
  Search,
  Settings,
  FileText,
  Activity,
  ShieldCheck,
  Calendar,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
  count?: number;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  active = false,
  onClick,
  count,
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-200 group ${
      active
        ? 'bg-[var(--sgf-primary)] text-white shadow-lg shadow-emerald-900/40'
        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
    }`}
  >
    <div className="flex items-center gap-3">
      <Icon size={20} className={active ? 'text-white' : 'group-hover:text-emerald-400'} />
      <span className="font-semibold text-sm">{label}</span>
    </div>
    {count !== undefined && count > 0 && (
      <SGFBadge
        size="sm"
        variant={active ? 'default' : 'alert'}
        className={active ? 'bg-emerald-800 text-white' : ''}
      >
        {count}
      </SGFBadge>
    )}
  </button>
);

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeTab = 'dashboard',
  onTabChange,
}) => {
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Visão Estratégica' },
    { id: 'map', icon: MapIcon, label: 'Centro de Comando', count: 3 },
    { id: 'telemetry', icon: Activity, label: 'Telemetria Real' },
    { id: 'fleet', icon: Truck, label: 'Frota Municipal' },
    { id: 'drivers', icon: Users, label: 'Motoristas' },
    { id: 'fuel', icon: Fuel, label: 'Abastecimentos' },
    { id: 'maintenance', icon: Wrench, label: 'Manutenção' },
    { id: 'reports', icon: FileText, label: 'Relatórios & Auditoria' },
  ];

  return (
    <div className="flex h-screen bg-[var(--sgf-surface)] font-sans text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-72' : 'w-0'
        } bg-[var(--sgf-dark)] flex flex-col shrink-0 border-r border-slate-800 transition-all duration-300 overflow-hidden`}
      >
        {/* Logo */}
        <div className="p-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[var(--sgf-primary)] to-[var(--sgf-light)] rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/20">
              <ShieldCheck className="text-white" size={28} />
            </div>
            <div>
              <h1 className="font-black text-xl text-white tracking-tight uppercase">
                SGF 2026
              </h1>
              <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-[0.2em]">
                Gestão Pública
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-6 space-y-1 overflow-y-auto">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-4 mb-4">
            Inteligência
          </p>

          {menuItems.slice(0, 3).map((item) => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeTab === item.id}
              onClick={() => onTabChange?.(item.id)}
              count={item.count}
            />
          ))}

          <div className="pt-8 pb-4">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-4 mb-4">
              Gestão de Ativos
            </p>
            {menuItems.slice(3, 7).map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeTab === item.id}
                onClick={() => onTabChange?.(item.id)}
                count={item.count}
              />
            ))}
          </div>

          <div className="pt-4">
            <SidebarItem
              icon={FileText}
              label="Relatórios & Auditoria"
              active={activeTab === 'reports'}
              onClick={() => onTabChange?.('reports')}
            />
          </div>
        </nav>

        {/* User Profile */}
        <div className="p-6">
          <div className="bg-slate-800/40 p-4 rounded-3xl border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500 border-2 border-emerald-900/50 flex items-center justify-center text-sm font-bold text-white shadow-inner">
                JD
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-sm font-bold text-white truncate">João Doria Jr.</p>
                <p className="text-[10px] text-slate-400">Coordenador Geral</p>
              </div>
            </div>
            <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-rose-500/10 text-rose-400 rounded-xl text-xs font-bold hover:bg-rose-500/20 transition-all">
              <LogOut size={14} /> Encerrar Sessão
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-10 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl lg:hidden"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            <div>
              <h2 className="text-2xl font-black text-slate-800 capitalize tracking-tight">
                {menuItems.find((item) => item.id === activeTab)?.label ||
                  'Dashboard Estratégico'}
              </h2>
              <p className="text-xs text-slate-400 font-medium flex items-center gap-2">
                <Calendar size={12} /> Segunda-feira, 02 de Janeiro de 2026
              </p>
            </div>
          </div>

          {/* Search and Actions */}
          <div className="flex items-center gap-6">
            <div className="relative group hidden md:block">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--sgf-primary)] transition-colors"
                size={18}
              />
              <input
                type="text"
                placeholder="Pesquisar veículo, condutor ou secretaria..."
                className="pl-12 pr-6 py-3 bg-slate-50 border-transparent rounded-2xl text-sm w-80 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white focus:border-emerald-200 transition-all outline-none border border-slate-100"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button className="p-3 text-slate-400 hover:bg-slate-50 rounded-2xl transition-all relative">
                <Bell size={22} />
                <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>
              </button>
              <button className="p-3 text-slate-400 hover:bg-slate-50 rounded-2xl transition-all">
                <Settings size={22} />
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-10">
          {children}
        </div>
      </main>

      {/* Quick Action Floating Button */}
      <div className="fixed bottom-10 right-10 flex flex-col items-end gap-4 pointer-events-none z-50">
        <div className="flex gap-4 pointer-events-auto animate-in slide-in-from-right-10 duration-500 delay-300">
          <SGFButton
            variant="secondary"
            icon={FileText}
            size="lg"
            className="shadow-2xl"
          >
            Gerar Relatório
          </SGFButton>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
