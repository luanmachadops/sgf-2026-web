import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFButton } from '@/components/sgf/SGFButton';
import { DollarSign, Receipt, CheckCircle, Building2, AlertTriangle, Loader2, Users } from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings, useUpdateSettings } from '@/hooks/useSettings';
import { NewSecretarioModal } from '@/components/settings/NewSecretarioModal';
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
                checked ? 'bg-emerald-500' : 'bg-slate-300',
                disabled && 'opacity-50',
            )}
        >
            <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
        </button>
    );
}

function ToggleRow({ title, desc, checked, onChange }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <p className="text-xs text-slate-500">{desc}</p>
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

export default function Configuracoes() {
    const { setTitle, setDescription } = useHeader();
    const { user } = useAuth();
    const { data: settings } = useAppSettings();
    const update = useUpdateSettings();
    const [showSecretario, setShowSecretario] = useState(false);

    const [fuelPriceMode, setFuelPriceMode] = useState<'contract' | 'free'>('free');
    const [orgName, setOrgName] = useState('');
    const [cnhAlertDays, setCnhAlertDays] = useState('30');
    const [contractAlertDays, setContractAlertDays] = useState('30');
    const [requireFuelValidation, setRequireFuelValidation] = useState(false);
    const [tankOverflowAlert, setTankOverflowAlert] = useState(true);

    useEffect(() => {
        setTitle('Configurações');
        setDescription('Preferências gerais do sistema de gestão de frota.');
    }, [setTitle, setDescription]);

    useEffect(() => {
        if (!settings) return;
        setFuelPriceMode(settings.fuelPriceMode);
        setOrgName(settings.orgName);
        setCnhAlertDays(String(settings.cnhAlertDays));
        setContractAlertDays(String(settings.contractAlertDays));
        setRequireFuelValidation(settings.requireFuelValidation);
        setTankOverflowAlert(settings.tankOverflowAlert);
    }, [settings]);

    const handleSave = () => {
        update.mutate(
            {
                fuelPriceMode,
                orgName: orgName.trim(),
                cnhAlertDays: Math.max(1, Number(cnhAlertDays) || 30),
                contractAlertDays: Math.max(1, Number(contractAlertDays) || 30),
                requireFuelValidation,
                tankOverflowAlert,
            },
            {
                onSuccess: () => toast.success('Configurações salvas.'),
                onError: () => toast.error('Erro ao salvar as configurações.'),
            },
        );
    };

    return (
        <div className="space-y-6 pb-4">
            {/* Acessos do painel — apenas administrador */}
            {user?.role === 'ADMIN' && (
                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-slate-400" />
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Secretários (acesso ao painel)</h3>
                                <p className="text-sm text-slate-500">Crie acessos restritos a uma secretaria específica.</p>
                            </div>
                        </div>
                        <SGFButton onClick={() => setShowSecretario(true)}>Novo secretário</SGFButton>
                    </div>
                </SGFCard>
            )}

            {/* Identidade */}
            <SGFCard padding="lg" className="border border-slate-200/80">
                <div className="mb-4 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-slate-400" />
                    <h3 className="text-lg font-semibold text-slate-900">Identidade</h3>
                </div>
                <SGFInput
                    label="Nome do órgão / prefeitura"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Ex.: Prefeitura Municipal de Tapejara"
                    hint="Aparece nos relatórios e documentos exportados."
                    fullWidth
                />
            </SGFCard>

            {/* Precificação */}
            <SGFCard padding="lg" className="border border-slate-200/80">
                <div className="mb-5">
                    <h3 className="text-lg font-semibold text-slate-900">Precificação de combustível</h3>
                    <p className="text-sm text-slate-500">Como o valor do litro é determinado nos abastecimentos.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {FUEL_MODE_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const active = fuelPriceMode === opt.value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setFuelPriceMode(opt.value)}
                                className={cn(
                                    'relative flex flex-col gap-3 rounded-2xl border-2 p-5 text-left transition-all',
                                    active ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 hover:border-emerald-200',
                                )}
                            >
                                {active && <span className="absolute right-4 top-4 text-emerald-500"><CheckCircle className="h-5 w-5" /></span>}
                                <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-900">{opt.title}</p>
                                    <p className="mt-1 text-sm text-slate-500">{opt.description}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
                {fuelPriceMode === 'contract' && (
                    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Cadastre o preço de cada combustível em <b>Postos → Editar</b> para aplicar automaticamente.
                    </p>
                )}
            </SGFCard>

            {/* Alertas */}
            <SGFCard padding="lg" className="border border-slate-200/80">
                <div className="mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-slate-400" />
                    <h3 className="text-lg font-semibold text-slate-900">Alertas e prazos</h3>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SGFInput
                        label="Alertar CNH a vencer (dias)"
                        type="number"
                        value={cnhAlertDays}
                        onChange={(e) => setCnhAlertDays(e.target.value)}
                        hint="Motoristas com CNH vencendo neste prazo entram em alerta."
                        fullWidth
                    />
                    <SGFInput
                        label="Alertar licitação a vencer (dias)"
                        type="number"
                        value={contractAlertDays}
                        onChange={(e) => setContractAlertDays(e.target.value)}
                        hint="Postos com contrato vencendo neste prazo entram em alerta."
                        fullWidth
                    />
                </div>
            </SGFCard>

            {/* Abastecimento */}
            <SGFCard padding="lg" className="border border-slate-200/80">
                <div className="mb-4 flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-slate-400" />
                    <h3 className="text-lg font-semibold text-slate-900">Abastecimento</h3>
                </div>
                <div className="space-y-3">
                    <ToggleRow
                        title="Exigir validação do gestor"
                        desc="Abastecimentos lançados pelo motorista precisam ser validados antes de contabilizar."
                        checked={requireFuelValidation}
                        onChange={setRequireFuelValidation}
                    />
                    <ToggleRow
                        title="Alertar litros acima da capacidade"
                        desc="Marca anomalia quando os litros abastecidos ultrapassam a capacidade do tanque do veículo."
                        checked={tankOverflowAlert}
                        onChange={setTankOverflowAlert}
                    />
                </div>
            </SGFCard>

            <div className="flex justify-end">
                <SGFButton icon={update.isPending ? Loader2 : undefined} disabled={update.isPending} onClick={handleSave}>
                    {update.isPending ? 'Salvando...' : 'Salvar configurações'}
                </SGFButton>
            </div>

            <NewSecretarioModal isOpen={showSecretario} onClose={() => setShowSecretario(false)} />
        </div>
    );
}
