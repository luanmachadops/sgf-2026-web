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

            {/* Protected routes */}
            <Route element={<PrivateRoute />}>
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
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route path="/perfil" element={<Perfil />} />
              </Route>
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
