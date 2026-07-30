import { lazy, Suspense, type ReactNode } from 'react';
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
import ResetPassword from '@/pages/ResetPassword';
import SuspendedAccess from '@/pages/SuspendedAccess';
import { useAuth } from '@/contexts/AuthContext';
import { AppLaunchSplash } from '@/components/pwa/AppLaunchSplash';
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt';
import { canAccessModule, type AccessModule } from '@/lib/accessModules';
import AccessManagement from '@/pages/AccessManagement';
import TermsAndPrivacy from '@/pages/TermsAndPrivacy';

const StationPortal = lazy(() => import('@/pages/partner/StationPortal'));
const WorkshopPortal = lazy(() => import('@/pages/partner/WorkshopPortal'));

const routeLoading = (
  <div className="grid min-h-screen place-items-center bg-slate-50">
    <div className="h-9 w-9 animate-spin rounded-full border-4 border-[var(--sgf-primary)] border-t-transparent" />
  </div>
);

function GlobalManagementRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.departmentScopeId ? <Navigate to="/" replace /> : children;
}

function ModuleRoute({ module, children }: { module: AccessModule; children: ReactNode }) {
  const { user } = useAuth();
  return canAccessModule(user?.allowedModules, module) ? children : <Navigate to="/perfil" replace />;
}

function AccessManagersRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.accountRole === 'admin'
    || user?.accountRole === 'gestor'
    || user?.accountRole === 'superadmin'
    ? children
    : <Navigate to="/" replace />;
}

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
          <AppLaunchSplash />
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/posto/login" element={<Login portal="posto" />} />
            <Route path="/oficina/login" element={<Login portal="oficina" />} />
            {/* Convite de cadastro do motorista — link https enviado por
                WhatsApp, redireciona para o app. Precisa ficar fora do
                PrivateRoute: o motorista ainda não tem conta. */}
            <Route path="/convite" element={<Convite />} />
            <Route path="/termos-e-privacidade" element={<TermsAndPrivacy />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/acesso-suspenso" element={<SuspendedAccess />} />

            {/* Protected routes */}
            <Route element={<PrivateRoute allow={['ADMIN', 'MANAGER', 'SUPERADMIN']} />}>
              <Route element={<MainLayout />}>
                <Route path="/" element={<ModuleRoute module="dashboard"><Dashboard /></ModuleRoute>} />
                <Route path="/mapa" element={<ModuleRoute module="map"><MapPage /></ModuleRoute>} />
                <Route path="/veiculos" element={<ModuleRoute module="fleet"><Vehicles /></ModuleRoute>} />
                <Route path="/veiculos/:id" element={<ModuleRoute module="fleet"><VehicleDetails /></ModuleRoute>} />
                <Route path="/motoristas" element={<ModuleRoute module="drivers"><Drivers /></ModuleRoute>} />
                <Route path="/motoristas/:id" element={<ModuleRoute module="drivers"><DriverDetails /></ModuleRoute>} />
                <Route path="/viagens" element={<ModuleRoute module="trips"><Trips /></ModuleRoute>} />
                <Route path="/abastecimentos" element={<ModuleRoute module="refuelings"><Refuelings /></ModuleRoute>} />
                <Route path="/manutencoes" element={<ModuleRoute module="maintenances"><Maintenances /></ModuleRoute>} />
                <Route path="/checklists" element={<ModuleRoute module="checklists"><Checklists /></ModuleRoute>} />
                <Route path="/infracoes" element={<ModuleRoute module="infractions"><Infracoes /></ModuleRoute>} />
                <Route path="/relatorios" element={<ModuleRoute module="reports"><GlobalManagementRoute><Reports /></GlobalManagementRoute></ModuleRoute>} />
                <Route path="/secretarias" element={<ModuleRoute module="departments"><GlobalManagementRoute><Departments /></GlobalManagementRoute></ModuleRoute>} />
                <Route path="/secretarias/:id" element={<ModuleRoute module="departments"><GlobalManagementRoute><Departments /></GlobalManagementRoute></ModuleRoute>} />
                <Route path="/postos" element={<ModuleRoute module="stations"><GlobalManagementRoute><Stations /></GlobalManagementRoute></ModuleRoute>} />
                <Route path="/postos/:id" element={<ModuleRoute module="stations"><GlobalManagementRoute><Stations /></GlobalManagementRoute></ModuleRoute>} />
                <Route path="/oficinas" element={<ModuleRoute module="repair_shops"><GlobalManagementRoute><RepairShops /></GlobalManagementRoute></ModuleRoute>} />
                <Route path="/oficinas/:id" element={<ModuleRoute module="repair_shops"><GlobalManagementRoute><RepairShops /></GlobalManagementRoute></ModuleRoute>} />
                <Route path="/configuracoes" element={<ModuleRoute module="settings"><GlobalManagementRoute><Configuracoes /></GlobalManagementRoute></ModuleRoute>} />
                <Route path="/acessos" element={<AccessManagersRoute><AccessManagement /></AccessManagersRoute>} />
                <Route path="/perfil" element={<Perfil />} />
                <Route path="/notificacoes" element={<ModuleRoute module="notifications"><Notificacoes /></ModuleRoute>} />
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
          <PwaInstallPrompt />
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
