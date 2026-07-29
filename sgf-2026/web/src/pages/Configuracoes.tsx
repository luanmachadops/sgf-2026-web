import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFButton } from '@/components/sgf/SGFButton';
import { DollarSign, Receipt, CheckCircle, AlertTriangle, Loader2, Users, Edit, Save } from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings, useUpdateSettings } from '@/hooks/useSettings';
import { NewSecretarioModal } from '@/components/settings/NewSecretarioModal';
import { TenantIdentityCard } from '@/components/settings/TenantIdentityCard';
import { cn } from '@/lib/utils';

const FUEL_MODE_OPTIONS = [
    {
        value: 'contract' as const,
        title: 'Preço da licitação',
        description: 'O valor do litro vem do contrato/licitação de cada posto e fica travado no abastecimento.',
        icon: Receipt,
    },
    {
        value: 'free' as const,
        title: 'Preço livre',
        description: 'O valor do litro é digitado manualmente a cada abastecimento.',
        icon: DollarSign,
    },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                checked ? 'bg-[var(--sgf-primary)]' : 'bg-slate-300',
                disabled && 'cursor-default',
            )}
        >
            <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
        </button>
    );
}

function ToggleRow({ title, desc, checked, onChange, disabled }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <p className="text-xs text-slate-500">{desc}</p>
            </div>
            <Toggle checked={checked} onChange={onChange} disabled={disabled} />
        </div>
    );
}

export default function Configuracoes() {
    const { setTitle, setDescription } = useHeader();
    const { user } = useAuth();
    const { data: settings } = useAppSettings();
    const update = useUpdateSettings();
    const [showSecretario, setShowSecretario] = useState(false);

    // Estados dos formulários
    const [fuelPriceMode, setFuelPriceMode] = useState<'contract' | 'free'>('free');
    const [cnhAlertDays, setCnhAlertDays] = useState('30');
    const [contractAlertDays, setContractAlertDays] = useState('30');
    const [requireFuelValidation, setRequireFuelValidation] = useState(false);
    const [tankOverflowAlert, setTankOverflowAlert] = useState(true);

    // Estados de edição independente por card
    const [editingFuelPrice, setEditingFuelPrice] = useState(false);
    const [editingFuelRules, setEditingFuelRules] = useState(false);
    const [editingAlerts, setEditingAlerts] = useState(false);

    useEffect(() => {
        setTitle('Configurações');
        setDescription('Preferências gerais do sistema de gestão de frota.');
    }, [setTitle, setDescription]);

    useEffect(() => {
        if (!settings) return;
        setFuelPriceMode(settings.fuelPriceMode);
        setCnhAlertDays(String(settings.cnhAlertDays));
        setContractAlertDays(String(settings.contractAlertDays));
        setRequireFuelValidation(settings.requireFuelValidation);
        setTankOverflowAlert(settings.tankOverflowAlert);
    }, [settings]);

    // Salva Precificação de Combustível
    const handleSaveFuelPrice = () => {
        update.mutate(
            { fuelPriceMode },
            {
                onSuccess: () => {
                    toast.success('Precificação de combustível salva.');
                    setEditingFuelPrice(false);
                },
                onError: () => toast.error('Erro ao salvar a precificação.'),
            },
        );
    };

    // Salva Regras de Abastecimento
    const handleSaveFuelRules = () => {
        update.mutate(
            { requireFuelValidation, tankOverflowAlert },
            {
                onSuccess: () => {
                    toast.success('Regras de abastecimento salvas.');
                    setEditingFuelRules(false);
                },
                onError: () => toast.error('Erro ao salvar as regras.'),
            },
        );
    };

    // Salva Alertas e Prazos
    const handleSaveAlerts = () => {
        update.mutate(
            {
                cnhAlertDays: Math.max(1, Number(cnhAlertDays) || 30),
                contractAlertDays: Math.max(1, Number(contractAlertDays) || 30),
            },
            {
                onSuccess: () => {
                    toast.success('Alertas e prazos salvos.');
                    setEditingAlerts(false);
                },
                onError: () => toast.error('Erro ao salvar os alertas.'),
            },
        );
    };

    const readonlyInputClasses = (isEditing: boolean) => !isEditing
        ? '!opacity-100 !bg-slate-50/70 !text-slate-800 font-medium cursor-default focus:ring-0 focus:border-slate-200'
        : 'bg-white text-slate-900';

    return (
        <div className="space-y-6 pb-12">
            {/* Grid Principal de 2 Colunas */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
                
                {/* COLUNA ESQUERDA */}
                <div className="space-y-6">
                    {/* 1. Identidade da Prefeitura */}
                    <TenantIdentityCard />

                    {/* 2. Precificação de combustível */}
                    <SGFCard padding="lg" className="border border-slate-200/80 shadow-sm transition-all hover:shadow-md">
                        <div className="mb-5 flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Precificação de combustível</h3>
                                <p className="text-sm text-slate-500">Como o valor do litro é determinado nos abastecimentos.</p>
                            </div>
                            <div>
                                {!editingFuelPrice ? (
                                    <SGFButton size="sm" onClick={() => setEditingFuelPrice(true)} icon={Edit}>
                                        Editar
                                    </SGFButton>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <SGFButton variant="ghost" size="sm" onClick={() => {
                                            if (settings) setFuelPriceMode(settings.fuelPriceMode);
                                            setEditingFuelPrice(false);
                                        }}>
                                            Cancelar
                                        </SGFButton>
                                        <SGFButton size="sm" onClick={handleSaveFuelPrice} disabled={update.isPending} icon={update.isPending ? Loader2 : Save}>
                                            {update.isPending ? 'Salvando...' : 'Salvar'}
                                        </SGFButton>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {FUEL_MODE_OPTIONS.map((opt) => {
                                const Icon = opt.icon;
                                const active = fuelPriceMode === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={!editingFuelPrice}
                                        onClick={() => setFuelPriceMode(opt.value)}
                                        className={cn(
                                            'relative flex flex-col gap-3 rounded-2xl border-2 p-5 text-left transition-all',
                                            active ? 'border-[var(--sgf-primary)] bg-[var(--sgf-primary-soft)]' : 'border-slate-200 hover:border-[var(--sgf-primary)]',
                                            !editingFuelPrice && 'cursor-default hover:border-slate-200',
                                        )}
                                    >
                                        {active && <span className="absolute right-4 top-4 text-[var(--sgf-primary)]"><CheckCircle className="h-5 w-5" /></span>}
                                        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', active ? 'bg-[var(--sgf-primary-soft)] text-[var(--sgf-primary)]' : 'bg-slate-100 text-slate-500')}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-900 text-sm">{opt.title}</p>
                                            <p className="mt-1 text-sm text-slate-500 leading-relaxed">{opt.description}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {fuelPriceMode === 'contract' && (
                            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 leading-relaxed">
                                Cadastre o preço de cada combustível em <b>Postos → Editar</b> para aplicar automaticamente.
                            </p>
                        )}
                    </SGFCard>
                </div>

                {/* COLUNA DIREITA */}
                <div className="space-y-6">
                    {/* 1. Secretários (Gestão de Acessos ao Painel) — apenas administrador */}
                    {user?.role === 'ADMIN' && (
                        <SGFCard padding="lg" className="border border-slate-200/80 shadow-sm transition-all hover:shadow-md bg-white text-slate-900">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                                        <Users className="h-5.5 w-5.5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-900">Secretários (acesso ao painel)</h3>
                                        <p className="text-sm text-slate-500">Gerencie os secretários e acessos restritos de cada secretaria.</p>
                                    </div>
                                </div>
                                <SGFButton onClick={() => setShowSecretario(true)} className="!rounded-full">
                                    Novo secretário
                                </SGFButton>
                            </div>
                        </SGFCard>
                    )}

                    {/* 2. Regras de Abastecimento */}
                    <SGFCard padding="lg" className="border border-slate-200/80 shadow-sm transition-all hover:shadow-md">
                        <div className="mb-4 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Receipt className="h-5 w-5 text-slate-400" />
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900">Regras de Abastecimento</h3>
                                    <p className="text-sm text-slate-500">Validações e travas automáticas para controle de combustível.</p>
                                </div>
                            </div>
                            <div>
                                {!editingFuelRules ? (
                                    <SGFButton size="sm" onClick={() => setEditingFuelRules(true)} icon={Edit}>
                                        Editar
                                    </SGFButton>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <SGFButton variant="ghost" size="sm" onClick={() => {
                                            if (settings) {
                                                setRequireFuelValidation(settings.requireFuelValidation);
                                                setTankOverflowAlert(settings.tankOverflowAlert);
                                            }
                                            setEditingFuelRules(false);
                                        }}>
                                            Cancelar
                                        </SGFButton>
                                        <SGFButton size="sm" onClick={handleSaveFuelRules} disabled={update.isPending} icon={update.isPending ? Loader2 : Save}>
                                            {update.isPending ? 'Salvando...' : 'Salvar'}
                                        </SGFButton>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-3">
                            <ToggleRow
                                title="Exigir validação do gestor"
                                desc="Abastecimentos lançados pelo motorista precisam ser validados antes de contabilizar."
                                checked={requireFuelValidation}
                                onChange={setRequireFuelValidation}
                                disabled={!editingFuelRules}
                            />
                            <ToggleRow
                                title="Alertar litros acima da capacidade"
                                desc="Marca anomalia quando os litros abastecidos ultrapassam a capacidade do tanque do veículo."
                                checked={tankOverflowAlert}
                                onChange={setTankOverflowAlert}
                                disabled={!editingFuelRules}
                            />
                        </div>
                    </SGFCard>

                    {/* 3. Alertas e prazos do sistema */}
                    <SGFCard padding="lg" className="border border-slate-200/80 shadow-sm transition-all hover:shadow-md">
                        <div className="mb-4 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-slate-400" />
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900">Alertas e prazos</h3>
                                    <p className="text-sm text-slate-500">Defina o limite de dias para notificação de vencimentos.</p>
                                </div>
                            </div>
                            <div>
                                {!editingAlerts ? (
                                    <SGFButton size="sm" onClick={() => setEditingAlerts(true)} icon={Edit}>
                                        Editar
                                    </SGFButton>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <SGFButton variant="ghost" size="sm" onClick={() => {
                                            if (settings) {
                                                setCnhAlertDays(String(settings.cnhAlertDays));
                                                setContractAlertDays(String(settings.contractAlertDays));
                                            }
                                            setEditingAlerts(false);
                                        }}>
                                            Cancelar
                                        </SGFButton>
                                        <SGFButton size="sm" onClick={handleSaveAlerts} disabled={update.isPending} icon={update.isPending ? Loader2 : Save}>
                                            {update.isPending ? 'Salvando...' : 'Salvar'}
                                        </SGFButton>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <SGFInput
                                label="Alertar CNH a vencer (dias)"
                                type="number"
                                value={cnhAlertDays}
                                readOnly={!editingAlerts}
                                inputClassName={readonlyInputClasses(editingAlerts)}
                                onChange={(e) => setCnhAlertDays(e.target.value)}
                                hint="Motoristas com CNH vencendo neste prazo entram em alerta."
                                fullWidth
                            />
                            <SGFInput
                                label="Alertar licitação a vencer (dias)"
                                type="number"
                                value={contractAlertDays}
                                readOnly={!editingAlerts}
                                inputClassName={readonlyInputClasses(editingAlerts)}
                                onChange={(e) => setContractAlertDays(e.target.value)}
                                hint="Postos com contrato vencendo neste prazo entram em alerta."
                                fullWidth
                            />
                        </div>
                    </SGFCard>
                </div>

            </div>

            <NewSecretarioModal isOpen={showSecretario} onClose={() => setShowSecretario(false)} />
        </div>
    );
}
