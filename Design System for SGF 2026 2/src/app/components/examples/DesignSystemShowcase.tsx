/**
 * SGF 2026 - Design System Showcase
 * Demonstração visual de todos os componentes do sistema
 */

import React, { useState } from 'react';
import {
  SGFButton,
  SGFCard,
  SGFInput,
  SGFSelect,
  SGFBadge,
  SGFKPICard,
  SGFAlert,
  SGFProgressBar,
  SGFTextarea,
} from '@/app/components/sgf';
import {
  Save,
  Upload,
  Download,
  Truck,
  Activity,
  Fuel,
  Search,
  User,
} from 'lucide-react';

export const DesignSystemShowcase: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [selectValue, setSelectValue] = useState('option1');
  const [textareaValue, setTextareaValue] = useState('');

  return (
    <div className="min-h-screen bg-[var(--sgf-surface)] p-10">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-black text-slate-900 mb-3">
          SGF 2026 Design System
        </h1>
        <p className="text-lg text-slate-600">
          Componentes reutilizáveis para o Sistema de Gestão de Frotas
        </p>
      </div>

      {/* Color Palette */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-slate-800 mb-6">Paleta de Cores</h2>
        <SGFCard padding="lg">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            <div>
              <div className="w-full h-24 rounded-2xl bg-[var(--sgf-dark)] mb-3 shadow-lg"></div>
              <p className="font-bold text-sm text-slate-700">SGF Dark</p>
              <p className="text-xs text-slate-500">#0F2B2F</p>
            </div>
            <div>
              <div className="w-full h-24 rounded-2xl bg-[var(--sgf-primary)] mb-3 shadow-lg"></div>
              <p className="font-bold text-sm text-slate-700">SGF Primary</p>
              <p className="text-xs text-slate-500">#00A86B</p>
            </div>
            <div>
              <div className="w-full h-24 rounded-2xl bg-[var(--sgf-light)] mb-3 shadow-lg"></div>
              <p className="font-bold text-sm text-slate-700">SGF Light</p>
              <p className="text-xs text-slate-500">#70C4A8</p>
            </div>
            <div>
              <div className="w-full h-24 rounded-2xl bg-[var(--sgf-status-moving)] mb-3 shadow-lg"></div>
              <p className="font-bold text-sm text-slate-700">Moving</p>
              <p className="text-xs text-slate-500">#22C55E</p>
            </div>
            <div>
              <div className="w-full h-24 rounded-2xl bg-[var(--sgf-status-alert)] mb-3 shadow-lg"></div>
              <p className="font-bold text-sm text-slate-700">Alert</p>
              <p className="text-xs text-slate-500">#EF4444</p>
            </div>
          </div>
        </SGFCard>
      </section>

      {/* Buttons */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-slate-800 mb-6">Botões</h2>
        
        <SGFCard padding="lg" className="mb-6">
          <h3 className="font-bold text-lg mb-4 text-slate-700">Variantes</h3>
          <div className="flex flex-wrap gap-4">
            <SGFButton variant="primary">Primary</SGFButton>
            <SGFButton variant="secondary">Secondary</SGFButton>
            <SGFButton variant="outline">Outline</SGFButton>
            <SGFButton variant="ghost">Ghost</SGFButton>
            <SGFButton variant="danger">Danger</SGFButton>
          </div>
        </SGFCard>

        <SGFCard padding="lg" className="mb-6">
          <h3 className="font-bold text-lg mb-4 text-slate-700">Tamanhos</h3>
          <div className="flex flex-wrap items-center gap-4">
            <SGFButton size="sm">Small</SGFButton>
            <SGFButton size="md">Medium</SGFButton>
            <SGFButton size="lg">Large</SGFButton>
            <SGFButton size="xl">Extra Large</SGFButton>
          </div>
        </SGFCard>

        <SGFCard padding="lg">
          <h3 className="font-bold text-lg mb-4 text-slate-700">Com Ícones</h3>
          <div className="flex flex-wrap gap-4">
            <SGFButton icon={Save} iconPosition="left">Salvar</SGFButton>
            <SGFButton icon={Upload} iconPosition="right" variant="secondary">
              Upload
            </SGFButton>
            <SGFButton icon={Download} variant="outline">
              Download
            </SGFButton>
            <SGFButton loading variant="primary">
              Carregando...
            </SGFButton>
          </div>
        </SGFCard>
      </section>

      {/* Form Inputs */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-slate-800 mb-6">Campos de Formulário</h2>
        
        <SGFCard padding="lg" className="mb-6">
          <h3 className="font-bold text-lg mb-4 text-slate-700">Input</h3>
          <div className="space-y-4 max-w-md">
            <SGFInput
              label="Nome Completo"
              placeholder="Digite seu nome..."
              fullWidth
            />
            <SGFInput
              label="Pesquisar"
              placeholder="Buscar veículo..."
              icon={Search}
              fullWidth
            />
            <SGFInput
              label="Email"
              type="email"
              placeholder="seu@email.com"
              icon={User}
              iconPosition="right"
              hint="Use seu email institucional"
              fullWidth
            />
            <SGFInput
              label="Campo com Erro"
              placeholder="Erro..."
              error="Este campo é obrigatório"
              fullWidth
            />
          </div>
        </SGFCard>

        <SGFCard padding="lg" className="mb-6">
          <h3 className="font-bold text-lg mb-4 text-slate-700">Select</h3>
          <div className="max-w-md">
            <SGFSelect
              label="Secretaria"
              options={[
                { value: 'option1', label: 'Obras' },
                { value: 'option2', label: 'Saúde' },
                { value: 'option3', label: 'Educação' },
              ]}
              value={selectValue}
              onChange={setSelectValue}
              hint="Selecione o departamento responsável"
              fullWidth
            />
          </div>
        </SGFCard>

        <SGFCard padding="lg">
          <h3 className="font-bold text-lg mb-4 text-slate-700">Textarea</h3>
          <div className="max-w-md">
            <SGFTextarea
              label="Observações"
              placeholder="Digite suas observações..."
              rows={4}
              maxLength={200}
              showCount
              value={textareaValue}
              onChange={(e) => setTextareaValue(e.target.value)}
              fullWidth
            />
          </div>
        </SGFCard>
      </section>

      {/* Badges */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-slate-800 mb-6">Badges</h2>
        
        <SGFCard padding="lg" className="mb-6">
          <h3 className="font-bold text-lg mb-4 text-slate-700">Variantes Padrão</h3>
          <div className="flex flex-wrap gap-3">
            <SGFBadge variant="default">Default</SGFBadge>
            <SGFBadge variant="success">Success</SGFBadge>
            <SGFBadge variant="warning">Warning</SGFBadge>
            <SGFBadge variant="error">Error</SGFBadge>
            <SGFBadge variant="info">Info</SGFBadge>
          </div>
        </SGFCard>

        <SGFCard padding="lg" className="mb-6">
          <h3 className="font-bold text-lg mb-4 text-slate-700">Status de Veículos</h3>
          <div className="flex flex-wrap gap-3">
            <SGFBadge variant="moving" dot>Em Movimento</SGFBadge>
            <SGFBadge variant="idle" dot>Parado/Ligado</SGFBadge>
            <SGFBadge variant="stopped" dot>Desligado</SGFBadge>
            <SGFBadge variant="alert" dot>Alerta</SGFBadge>
          </div>
        </SGFCard>

        <SGFCard padding="lg">
          <h3 className="font-bold text-lg mb-4 text-slate-700">Tamanhos</h3>
          <div className="flex flex-wrap items-center gap-3">
            <SGFBadge size="sm">Small</SGFBadge>
            <SGFBadge size="md">Medium</SGFBadge>
            <SGFBadge size="lg">Large</SGFBadge>
          </div>
        </SGFCard>
      </section>

      {/* KPI Cards */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-slate-800 mb-6">KPI Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <SGFKPICard
            title="Veículos Ativos"
            value="128"
            percentage={8.2}
            trend="up"
            icon={Truck}
            iconColor="text-emerald-600"
          />
          <SGFKPICard
            title="Em Movimento"
            value="42"
            percentage={12.5}
            trend="up"
            icon={Activity}
            iconColor="text-blue-600"
          />
          <SGFKPICard
            title="Gasto Combustível"
            value="15.420 L"
            percentage={3.1}
            trend="down"
            icon={Fuel}
            iconColor="text-amber-600"
          />
        </div>
      </section>

      {/* Alerts */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-slate-800 mb-6">Alertas</h2>
        <div className="space-y-4">
          <SGFAlert
            variant="info"
            title="Informação"
            message="Sistema funcionando normalmente. Todos os serviços estão online."
          />
          <SGFAlert
            variant="success"
            title="Sucesso"
            message="Dados salvos com sucesso! As alterações foram aplicadas."
          />
          <SGFAlert
            variant="warning"
            title="Atenção"
            message="3 veículos estão com manutenção preventiva agendada para esta semana."
          />
          <SGFAlert
            variant="error"
            title="Erro"
            message="Não foi possível conectar ao servidor. Tente novamente em alguns minutos."
            dismissible
          />
        </div>
      </section>

      {/* Progress Bars */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-slate-800 mb-6">Barras de Progresso</h2>
        <SGFCard padding="lg">
          <div className="space-y-6">
            <SGFProgressBar
              value={75}
              label="Combustível"
              showPercentage
              variant="success"
            />
            <SGFProgressBar
              value={45}
              label="Manutenções Concluídas"
              showPercentage
              variant="default"
            />
            <SGFProgressBar
              value={15}
              label="Nível Crítico"
              showPercentage
              variant="error"
            />
            <SGFProgressBar
              value={60}
              label="Alerta"
              showPercentage
              variant="warning"
              size="lg"
            />
          </div>
        </SGFCard>
      </section>

      {/* Cards */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-slate-800 mb-6">Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <SGFCard variant="default" padding="lg">
            <h3 className="font-bold text-lg mb-2">Card Padrão</h3>
            <p className="text-slate-600">
              Card com borda sutil e sombra leve. Ideal para conteúdo geral.
            </p>
          </SGFCard>

          <SGFCard variant="elevated" padding="lg">
            <h3 className="font-bold text-lg mb-2">Card Elevado</h3>
            <p className="text-slate-600">
              Card com sombra mais pronunciada para dar destaque.
            </p>
          </SGFCard>

          <SGFCard variant="bordered" padding="lg">
            <h3 className="font-bold text-lg mb-2">Card com Borda</h3>
            <p className="text-slate-600">
              Card com borda colorida para dar ênfase.
            </p>
          </SGFCard>

          <SGFCard variant="glass" padding="lg" hover>
            <h3 className="font-bold text-lg mb-2">Card Glass (com hover)</h3>
            <p className="text-slate-600">
              Card com efeito glassmorphism e animação ao passar o mouse.
            </p>
          </SGFCard>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center mt-20 pt-10 border-t border-slate-200">
        <p className="text-slate-500 text-sm">
          SGF 2026 Design System - v1.0 | Desenvolvido para Gestão de Frotas Municipais
        </p>
      </div>
    </div>
  );
};

export default DesignSystemShowcase;
