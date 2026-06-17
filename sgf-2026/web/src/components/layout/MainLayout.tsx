import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { HeaderProvider, useHeader } from '@/contexts/HeaderContext';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export default function MainLayout() {
    return (
        <HeaderProvider>
            <LayoutWithHeader />
        </HeaderProvider>
    );
}

function LayoutWithHeader() {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [variant, setVariant] = useState<'desktop' | 'compact' | 'mobile'>('desktop');
    const { title, description } = useHeader();

    // Atualização em tempo real de listas/dashboard/mapa (sem F5).
    useRealtimeSync();

    // Determine Layout Variant on resize
    React.useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            if (width < 1024) {
                setVariant('mobile');
            } else if (width < 1350) {
                setVariant('compact');
            } else {
                setVariant('desktop');
            }
        };

        handleResize(); // Check on mount
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const toggleSidebar = () => setIsMobileOpen(!isMobileOpen);

    return (
        <div className="flex h-[100dvh] overflow-hidden" style={{ backgroundColor: 'hsl(181, 46%, 18%)' }}>
            <Sidebar
                variant={variant}
                isOpen={isMobileOpen}
                onToggle={toggleSidebar}
            />

            <div className="flex flex-1 flex-col overflow-hidden p-0 relative min-h-0 min-w-0">
                {/* Main Content Area - Single Container */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 lg:mt-[var(--sgf-space-4)] lg:ml-[var(--sgf-space-6)] mt-0 ml-0 lg:rounded-tl-[32px] rounded-none bg-[#E3E9E7] shadow-none lg:shadow-2xl relative">
                    <Header onMenuClick={toggleSidebar} />

                    <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-[var(--sgf-space-4)] md:p-[var(--sgf-space-8)] scroll-smooth custom-scrollbar">
                        <div className="w-full max-w-[1400px] mx-auto">
                            <Outlet />
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
