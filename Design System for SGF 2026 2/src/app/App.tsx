import React, { useState } from 'react';
import { DesignSystemShowcase } from './components/examples/DesignSystemShowcase';
import { IconsShowcase } from './components/examples/IconsShowcase';
import { DashboardExample } from './components/examples/DashboardExample';
import { SGFButton } from './components/sgf';
import { Palette, FileCode, LayoutDashboard } from 'lucide-react';

export default function App() {
  const [view, setView] = useState<'components' | 'icons' | 'dashboard'>('dashboard');

  return (
    <div className="min-h-screen">
      {/* Navigation Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--sgf-dark)] shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[var(--sgf-primary)] to-[var(--sgf-light)] rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-lg">S</span>
              </div>
              <div>
                <h1 className="text-white font-black text-lg">SGF 2026</h1>
                <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider">
                  Design System
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <SGFButton
                variant={view === 'dashboard' ? 'primary' : 'ghost'}
                onClick={() => setView('dashboard')}
                size="sm"
                icon={LayoutDashboard}
                className={view !== 'dashboard' ? 'text-slate-300' : ''}
              >
                Dashboard
              </SGFButton>
              <SGFButton
                variant={view === 'components' ? 'primary' : 'ghost'}
                onClick={() => setView('components')}
                size="sm"
                icon={Palette}
                className={view !== 'components' ? 'text-slate-300' : ''}
              >
                Componentes
              </SGFButton>
              <SGFButton
                variant={view === 'icons' ? 'primary' : 'ghost'}
                onClick={() => setView('icons')}
                size="sm"
                icon={FileCode}
                className={view !== 'icons' ? 'text-slate-300' : ''}
              >
                Ícones
              </SGFButton>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="pt-20">
        {view === 'components' && <DesignSystemShowcase />}
        {view === 'icons' && <IconsShowcase />}
        {view === 'dashboard' && <DashboardExample />}
      </div>
    </div>
  );
}
