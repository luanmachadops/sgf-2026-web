import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { BrandingProvider } from '@/contexts/BrandingContext';
import PrivateRoute from '@/components/auth/PrivateRoute';
import MainLayout from '@/components/layout/MainLayout';
import { Toaster } from '@/components/ui/sonner';

// Pages
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import MapPage from '@/pages/Map';
import Vehicles from '@/pages/Vehicles';
import VehicleDetails from '@/pages/VehicleDetails';
import Drivers from '@/pages/Drivers';
import DriverDetails from '@/pages/DriverDetails';
import Trips from '@/pages/Trips';
import Refuelings from '@/pages/Refuelings';
import Maintenances from '@/pages/Maintenances';
import Checklists from '@/pages/Checklists';
import Reports from '@/pages/Reports';
import Infracoes from '@/pages/Infracoes';
import Configuracoes from '@/pages/Configuracoes';
import Perfil from '@/pages/Perfil';
import Departments from '@/pages/Departments';
import Stations from '@/pages/Stations';
import RepairShops from '@/pages/RepairShops';
import Notificacoes from '@/pages/Notificacoes';
import Convite from '@/pages/Convite';

const StationPortal = lazy(() => import('@/pages/partner/StationPortal'));
const WorkshopPortal = lazy(() => import('@/pages/partner/WorkshopPortal'));

const routeLoading = (
  <div className="grid min-h-screen place-items-center bg-slate-50">
    <div className="h-9 w-9 animate-spin rounded-full border-4 border-[var(--sgf-primary)] border-t-transparent" />
  </div>
);

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
      // Refetch quando o foco volta — útil quando o usuário troca de tab depois de logar.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster richColors closeButton position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/posto/login" element={<Login portal="posto" />} />
            <Route path="/oficina/login" element={<Login portal="oficina" />} />
            {/* Convite de cadastro do motorista — link https enviado por
                WhatsApp, redireciona para o app. Precisa ficar fora do
                PrivateRoute: o motorista ainda não tem conta. */}
            <Route path="/convite" element={<Convite />} />

            {/* Protected routes */}
            <Route element={<PrivateRoute allow={['ADMIN', 'MANAGER', 'SUPERADMIN']} />}>
              <Route element={<MainLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/mapa" element={<MapPage />} />
                <Route path="/veiculos" element={<Vehicles />} />
                <Route path="/veiculos/:id" element={<VehicleDetails />} />
                <Route path="/motoristas" element={<Drivers />} />
                <Route path="/motoristas/:id" element={<DriverDetails />} />
                <Route path="/viagens" element={<Trips />} />
                <Route path="/abastecimentos" element={<Refuelings />} />
                <Route path="/manutencoes" element={<Maintenances />} />
                <Route path="/checklists" element={<Checklists />} />
                <Route path="/infracoes" element={<Infracoes />} />
                <Route path="/relatorios" element={<Reports />} />
                <Route path="/secretarias" element={<Departments />} />
                <Route path="/secretarias/:id" element={<Departments />} />
                <Route path="/postos" element={<Stations />} />
                <Route path="/postos/:id" element={<Stations />} />
                <Route path="/oficinas" element={<RepairShops />} />
                <Route path="/oficinas/:id" element={<RepairShops />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route path="/perfil" element={<Perfil />} />
                <Route path="/notificacoes" element={<Notificacoes />} />
              </Route>
            </Route>

            {/* Portal do posto: bundle separado e fronteira explícita de papel. */}
            <Route element={<PrivateRoute allow={['POSTO']} loginTo="/posto/login" />}>
              <Route
                path="/posto/*"
                element={<Suspense fallback={routeLoading}><StationPortal /></Suspense>}
              />
            </Route>
            <Route element={<PrivateRoute allow={['OFICINA']} loginTo="/oficina/login" />}>
              <Route
                path="/oficina/*"
                element={<Suspense fallback={routeLoading}><WorkshopPortal /></Suspense>}
              />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
