/**
 * SGF 2026 - Icons and Visual Elements Showcase
 * Demonstração de ícones recomendados do Lucide React
 */

import React from 'react';
import { SGFCard } from '@/app/components/sgf';
import {
  // Navegação e UI
  LayoutDashboard,
  Map,
  FileText,
  Settings,
  Bell,
  Search,
  Filter,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  MoreHorizontal,
  
  // Veículos e Frota
  Truck,
  Car,
  Bus,
  Bike,
  Calendar,
  MapPin,
  Navigation,
  
  // Pessoas
  User,
  Users,
  UserCheck,
  UserX,
  Shield,
  
  // Combustível e Manutenção
  Fuel,
  Wrench,
  Hammer, // Substitui Tool que não existe
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  
  // Ações
  Plus,
  Edit,
  Trash2,
  Save,
  Upload,
  Download,
  RefreshCw,
  LogOut,
  
  // Status e Indicadores
  Activity,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowDownRight,
  Circle,
  
  // Documentos
  FileSpreadsheet,
  FilePlus,
  Folder,
  Clipboard,
  
  // Comunicação
  Mail,
  Phone,
  MessageCircle,
  
  // Tempo
  Clock,
  Timer,
  
  // Outros
  Eye,
  EyeOff,
  Info,
  HelpCircle,
  Star,
  Heart,
} from 'lucide-react';

const iconCategories = [
  {
    name: 'Navegação e Interface',
    icons: [
      { Icon: LayoutDashboard, name: 'LayoutDashboard', usage: 'Dashboard, visão geral' },
      { Icon: Map, name: 'Map', usage: 'Mapa, rastreamento' },
      { Icon: FileText, name: 'FileText', usage: 'Relatórios, documentos' },
      { Icon: Settings, name: 'Settings', usage: 'Configurações' },
      { Icon: Bell, name: 'Bell', usage: 'Notificações, alertas' },
      { Icon: Search, name: 'Search', usage: 'Busca, pesquisa' },
      { Icon: Filter, name: 'Filter', usage: 'Filtros' },
      { Icon: Menu, name: 'Menu', usage: 'Menu hambúrguer' },
      { Icon: X, name: 'X', usage: 'Fechar, cancelar' },
      { Icon: ChevronRight, name: 'ChevronRight', usage: 'Navegação, próximo' },
      { Icon: MoreVertical, name: 'MoreVertical', usage: 'Mais opções (vertical)' },
      { Icon: MoreHorizontal, name: 'MoreHorizontal', usage: 'Mais opções (horizontal)' },
    ],
  },
  {
    name: 'Veículos e Frota',
    icons: [
      { Icon: Truck, name: 'Truck', usage: 'Caminhão, veículos pesados' },
      { Icon: Car, name: 'Car', usage: 'Carro, veículos leves' },
      { Icon: Bus, name: 'Bus', usage: 'Ônibus, transporte coletivo' },
      { Icon: Bike, name: 'Bike', usage: 'Motocicleta, bicicleta' },
      { Icon: MapPin, name: 'MapPin', usage: 'Localização, pin no mapa' },
      { Icon: Navigation, name: 'Navigation', usage: 'Direção, navegação' },
    ],
  },
  {
    name: 'Pessoas e Usuários',
    icons: [
      { Icon: User, name: 'User', usage: 'Usuário, perfil, motorista' },
      { Icon: Users, name: 'Users', usage: 'Múltiplos usuários, equipe' },
      { Icon: UserCheck, name: 'UserCheck', usage: 'Usuário verificado, ativo' },
      { Icon: UserX, name: 'UserX', usage: 'Usuário bloqueado, inativo' },
      { Icon: Shield, name: 'Shield', usage: 'Admin, segurança' },
    ],
  },
  {
    name: 'Combustível e Manutenção',
    icons: [
      { Icon: Fuel, name: 'Fuel', usage: 'Combustível, abastecimento' },
      { Icon: Wrench, name: 'Wrench', usage: 'Manutenção, reparo' },
      { Icon: Hammer, name: 'Hammer', usage: 'Ferramentas, oficina' },
      { Icon: AlertTriangle, name: 'AlertTriangle', usage: 'Aviso, atenção' },
      { Icon: AlertCircle, name: 'AlertCircle', usage: 'Erro, problema' },
      { Icon: CheckCircle, name: 'CheckCircle', usage: 'Sucesso, concluído' },
    ],
  },
  {
    name: 'Ações',
    icons: [
      { Icon: Plus, name: 'Plus', usage: 'Adicionar, criar novo' },
      { Icon: Edit, name: 'Edit', usage: 'Editar, modificar' },
      { Icon: Trash2, name: 'Trash2', usage: 'Deletar, remover' },
      { Icon: Save, name: 'Save', usage: 'Salvar, gravar' },
      { Icon: Upload, name: 'Upload', usage: 'Upload, enviar' },
      { Icon: Download, name: 'Download', usage: 'Download, baixar' },
      { Icon: RefreshCw, name: 'RefreshCw', usage: 'Atualizar, recarregar' },
      { Icon: LogOut, name: 'LogOut', usage: 'Sair, logout' },
    ],
  },
  {
    name: 'Status e Indicadores',
    icons: [
      { Icon: Activity, name: 'Activity', usage: 'Atividade, telemetria' },
      { Icon: TrendingUp, name: 'TrendingUp', usage: 'Crescimento, tendência positiva' },
      { Icon: TrendingDown, name: 'TrendingDown', usage: 'Queda, tendência negativa' },
      { Icon: ArrowUpRight, name: 'ArrowUpRight', usage: 'Aumento percentual' },
      { Icon: ArrowDownRight, name: 'ArrowDownRight', usage: 'Diminuição percentual' },
      { Icon: Circle, name: 'Circle', usage: 'Indicador de status (dot)' },
    ],
  },
  {
    name: 'Documentos',
    icons: [
      { Icon: FileSpreadsheet, name: 'FileSpreadsheet', usage: 'Excel, planilhas' },
      { Icon: FilePlus, name: 'FilePlus', usage: 'Novo documento' },
      { Icon: Folder, name: 'Folder', usage: 'Pasta, categoria' },
      { Icon: Clipboard, name: 'Clipboard', usage: 'Checklist, anotações' },
    ],
  },
  {
    name: 'Tempo',
    icons: [
      { Icon: Calendar, name: 'Calendar', usage: 'Data, calendário, agendamento' },
      { Icon: Clock, name: 'Clock', usage: 'Hora, tempo' },
      { Icon: Timer, name: 'Timer', usage: 'Cronômetro, duração' },
    ],
  },
];

export const IconsShowcase: React.FC = () => {
  const [copiedIcon, setCopiedIcon] = React.useState<string | null>(null);

  const copyToClipboard = (iconName: string) => {
    const importStatement = `import { ${iconName} } from 'lucide-react';`;
    navigator.clipboard.writeText(importStatement);
    setCopiedIcon(iconName);
    setTimeout(() => setCopiedIcon(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[var(--sgf-surface)] p-10">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-black text-slate-900 mb-3">
          SGF 2026 Icons Library
        </h1>
        <p className="text-lg text-slate-600 mb-2">
          Ícones do Lucide React recomendados para o sistema
        </p>
        <p className="text-sm text-slate-500">
          Clique em um ícone para copiar o import statement
        </p>
      </div>

      {/* Icon Categories */}
      <div className="space-y-12">
        {iconCategories.map((category) => (
          <section key={category.name}>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">
              {category.name}
            </h2>

            <SGFCard padding="lg">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {category.icons.map(({ Icon, name, usage }) => (
                  <button
                    key={name}
                    onClick={() => copyToClipboard(name)}
                    className="flex flex-col items-center p-4 rounded-2xl border-2 border-transparent hover:border-[var(--sgf-primary)] hover:bg-emerald-50 transition-all duration-200 cursor-pointer group"
                  >
                    <div className="w-16 h-16 flex items-center justify-center mb-3 rounded-2xl bg-slate-100 group-hover:bg-[var(--sgf-primary)] group-hover:text-white transition-all duration-200">
                      <Icon size={32} />
                    </div>

                    <p className="font-bold text-sm text-slate-800 mb-1 text-center">
                      {name}
                    </p>

                    <p className="text-xs text-slate-500 text-center line-clamp-2">
                      {usage}
                    </p>

                    {copiedIcon === name && (
                      <div className="mt-2 px-2 py-1 bg-emerald-500 text-white text-xs font-bold rounded-lg">
                        ✓ Copiado!
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </SGFCard>
          </section>
        ))}
      </div>

      {/* Color Reference */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">
          Cores para Ícones
        </h2>

        <SGFCard padding="lg">
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-lg mb-4">Cores Principais</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { color: 'text-emerald-600', name: 'Emerald (Primary)', bg: 'bg-emerald-50' },
                  { color: 'text-slate-600', name: 'Slate (Neutral)', bg: 'bg-slate-50' },
                  { color: 'text-blue-600', name: 'Blue (Info)', bg: 'bg-blue-50' },
                  { color: 'text-amber-600', name: 'Amber (Warning)', bg: 'bg-amber-50' },
                  { color: 'text-red-600', name: 'Red (Error)', bg: 'bg-red-50' },
                ].map((item) => (
                  <div key={item.name} className={`p-4 ${item.bg} rounded-2xl`}>
                    <Truck className={`${item.color} mb-2`} size={32} />
                    <p className="text-xs font-bold text-slate-700">{item.name}</p>
                    <code className="text-[10px] text-slate-500 block mt-1">
                      {item.color}
                    </code>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-4">Tamanhos de Ícones</h3>
              <div className="flex flex-wrap items-end gap-8">
                {[
                  { size: 16, label: 'Small (16px)', usage: 'Badges, labels' },
                  { size: 20, label: 'Medium (20px)', usage: 'Botões, cards' },
                  { size: 24, label: 'Large (24px)', usage: 'Headers, KPIs' },
                  { size: 32, label: 'XL (32px)', usage: 'Features principais' },
                  { size: 48, label: 'XXL (48px)', usage: 'Empty states' },
                ].map((item) => (
                  <div key={item.size} className="text-center">
                    <div className="flex items-center justify-center h-24 mb-2">
                      <Truck size={item.size} className="text-[var(--sgf-primary)]" />
                    </div>
                    <p className="font-bold text-xs text-slate-700">{item.label}</p>
                    <p className="text-[10px] text-slate-500">{item.usage}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SGFCard>
      </section>

      {/* Usage Examples */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">
          Exemplos de Uso
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <SGFCard padding="lg">
            <h3 className="font-bold text-lg mb-4">Em Botões</h3>
            <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-sm overflow-x-auto">
{`<SGFButton 
  icon={Save} 
  iconPosition="left"
>
  Salvar Dados
</SGFButton>`}
            </pre>
          </SGFCard>

          <SGFCard padding="lg">
            <h3 className="font-bold text-lg mb-4">Em KPI Cards</h3>
            <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-sm overflow-x-auto">
{`<SGFKPICard
  title="Veículos"
  value="128"
  icon={Truck}
  iconColor="text-emerald-600"
/>`}
            </pre>
          </SGFCard>

          <SGFCard padding="lg">
            <h3 className="font-bold text-lg mb-4">Com Cores Dinâmicas</h3>
            <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-sm overflow-x-auto">
{`const iconColor = status === 'active' 
  ? 'text-emerald-600' 
  : 'text-slate-400';

<Activity className={iconColor} />`}
            </pre>
          </SGFCard>

          <SGFCard padding="lg">
            <h3 className="font-bold text-lg mb-4">Em Badges</h3>
            <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-sm overflow-x-auto">
{`<SGFBadge 
  variant="success" 
  icon={CheckCircle}
>
  Ativo
</SGFBadge>`}
            </pre>
          </SGFCard>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center mt-20 pt-10 border-t border-slate-200">
        <p className="text-slate-500 text-sm mb-2">
          Todos os ícones são do{' '}
          <a
            href="https://lucide.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--sgf-primary)] font-bold hover:underline"
          >
            Lucide React
          </a>
        </p>
        <p className="text-slate-400 text-xs">
          SGF 2026 Design System - Icons Showcase
        </p>
      </div>
    </div>
  );
};

export default IconsShowcase;