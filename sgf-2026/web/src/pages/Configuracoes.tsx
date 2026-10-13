import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFButton } from '@/components/sgf/SGFButton';
import { DollarSign, Receipt, CheckCircle, AlertTriangle, Loader2, Save, Building2, ChevronRight, CalendarClock, FileText, ShieldCheck } from '@/components/sgf/icons';
import { useBranding } from '@/contexts/BrandingContext';
import { useHeader } from '@/contexts/HeaderContext';
import { useAppSettings, useUpdateSettings } from '@/hooks/useSettings';
import { TenantIdentityCard } from '@/components/settings/TenantIdentityCard';
import { ToggleRow } from '@/components/settings/SettingsToggle';
import { WorkHoursSettings } from '@/components/settings/WorkHoursSettings';
import { useAuth } from '@/contexts/AuthContext';
import { ReportSignaturesEditor } from '@/components/settings/ReportSignaturesEditor';
import { cn } from '@/lib/utils';
import { useSyncOnChange } from '@/hooks/useSyncOnChange';

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

export default function Configuracoes() {
    const { setTitle, setDescription } = useHeader();
    const { data: settings } = useAppSettings();
    const update = useUpdateSettings();
    const { branding } = useBranding();
    const { user } = useAuth();
    const canEditWorkHours = ['admin', 'gestor'].includes(user?.accountRole ?? '');

    // Estados dos formulários
    const [fuelPriceMode, setFuelPriceMode] = useState<'contract' | 'free'>('free');
    const [cnhAlertDays, setCnhAlertDays] = useState('30');
    const [contractAlertDays, setContractAlertDays] = useState('30');
    const [requireFuelValidation, setRequireFuelValidation] = useState(false);
    const [tankOverflowAlert, setTankOverflowAlert] = useState(true);

    type Section = 'identity' | 'fuelRules' | 'alerts' | 'pricing' | 'workHours' | 'reports';
    const [openSection, setOpenSection] = useState<Section | null>(null);


    useEffect(() => {
        setTitle('Configurações');
        setDescription('Preferências gerais do sistema de gestão de frota.');
    }, [setTitle, setDescription]);

    useSyncOnChange(settings, () => {
        if (!settings) return;
        setFuelPriceMode(settings.fuelPriceMode);
        setCnhAlertDays(String(settings.cnhAlertDays));
        setContractAlertDays(String(settings.contractAlertDays));
        setRequireFuelValidation(settings.requireFuelValidation);
        setTankOverflowAlert(settings.tankOverflowAlert);
    });

    // Salva Precificação de Combustível
    const handleSaveFuelPrice = () => {
        update.mutate(
            { fuelPriceMode },
            {
                onSuccess: () => {
                    toast.success('Precificação de combustível salva.');
                    setOpenSection(null);
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
                    setOpenSection(null);
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
                    setOpenSection(null);
                },
                onError: () => toast.error('Erro ao salvar os alertas.'),
            },
        );
    };


    // Abre já em edição; fechar sem salvar volta aos valores gravados.
    const openModal = (section: Section) => {
        setOpenSection(section);
    };
    const closeModal = () => {
        if (settings) {
            setFuelPriceMode(settings.fuelPriceMode);
            setCnhAlertDays(String(settings.cnhAlertDays));
            setContractAlertDays(String(settings.contractAlertDays));
            setRequireFuelValidation(settings.requireFuelValidation);
            setTankOverflowAlert(settings.tankOverflowAlert);
        }
        setOpenSection(null);
    };

    const saveFooter = (onSave: () => void) => (
        <ModalFooter>
            <SGFButton variant="ghost" onClick={closeModal} disabled={update.isPending}>Cancelar</SGFButton>
            <SGFButton onClick={onSave} disabled={update.isPending} icon={update.isPending ? Loader2 : Save}>
                {update.isPending ? 'Salvando...' : 'Salvar'}
            </SGFButton>
        </ModalFooter>
    );

    const fuelModeLabel = FUEL_MODE_OPTIONS.find((o) => o.value === (settings?.fuelPriceMode ?? fuelPriceMode))?.title ?? '—';
    const navigate = useNavigate();
    // Gestão de acessos: só administrador e superadministrador (mesma regra da rota).
    const canManageAccess = user?.accountRole === 'admin' || user?.accountRole === 'superadmin';
    const cards: { key: Section | 'access'; icon: typeof Receipt; title: string; description: string; summary: string[]; to?: string }[] = [
        ...(canManageAccess ? [{
            key: 'access' as const, icon: ShieldCheck, title: 'Gerenciar acessos',
            description: 'Usuários do painel, perfis e permissões por módulo.',
            summary: ['Gestores, secretários e parceiros'],
            to: '/configuracoes/acessos',
        }] : []),
        {
            key: 'identity', icon: Building2, title: 'Identidade da Prefeitura',
            description: 'Logo, brasão, cores e dados que aparecem no painel e no app.',
            summary: [branding.name, [branding.city, branding.state].filter(Boolean).join('/')].filter(Boolean),
        },
        {
            key: 'fuelRules', icon: Receipt, title: 'Regras de Abastecimento',
            description: 'Validações e travas automáticas do combustível.',
            summary: [
                `Validação do gestor: ${settings?.requireFuelValidation ? 'exigida' : 'não exigida'}`,
                `Alerta acima do tanque: ${settings?.tankOverflowAlert ? 'ligado' : 'desligado'}`,
            ],
        },
        {
            key: 'alerts', icon: AlertTriangle, title: 'Alertas e prazos',
            description: 'Antecedência dos avisos de vencimento.',
            summary: [
                `CNH: ${settings?.cnhAlertDays ?? '—'} dias antes`,
                `Licitação: ${settings?.contractAlertDays ?? '—'} dias antes`,
            ],
        },
        ...(canEditWorkHours ? [{
            key: 'workHours' as const, icon: CalendarClock, title: 'Expediente e alertas',
            description: 'Horário de uso da frota, feriados, tolerâncias e automações.',
            summary: ['Alerta de uso fora do horário', 'Tolerâncias de km e consumo'],
        }] : []),
        {
            key: 'pricing', icon: DollarSign, title: 'Precificação de combustível',
            description: 'Como o valor do litro é definido no abastecimento.',
            summary: [fuelModeLabel],
        },
        {
            key: 'reports', icon: FileText, title: 'Relatórios e assinaturas',
            description: 'Quem assina os relatórios oficiais em PDF.',
            summary: ['Assinaturas padrão dos PDFs'],
        },
    ];

    return (
        <div className="space-y-6 pb-12">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <button
                            key={card.key}
                            type="button"
                            onClick={() => (card.to ? navigate(card.to) : openModal(card.key as Section))}
                            className="group flex flex-col gap-4 rounded-[var(--sgf-card-radius)] border border-slate-200/80 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--sgf-primary)] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[var(--sgf-focus-ring)]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--sgf-primary-soft)] text-[var(--sgf-primary)]">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <ChevronRight className="h-5 w-5 text-slate-300 transition-colors group-hover:text-[var(--sgf-primary)]" />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900">{card.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{card.description}</p>
                            </div>
                            <div className="mt-auto space-y-1 border-t border-slate-100 pt-3">
                                {card.summary.map((line) => (
                                    <p key={line} className="truncate text-xs font-medium text-slate-600">{line}</p>
                                ))}
                            </div>
                        </button>
                    );
                })}
            </div>

            <Modal isOpen={openSection === 'identity'} onClose={closeModal} title="Identidade da Prefeitura" description="Logo, brasão, cores e dados que aparecem no painel e no app." size="xl">
                <TenantIdentityCard embedded />
            </Modal>

            <Modal isOpen={openSection === 'fuelRules'} onClose={closeModal} title="Regras de Abastecimento" description="Validações e travas automáticas para controle de combustível." size="md" footer={saveFooter(handleSaveFuelRules)}>
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
            </Modal>

            <Modal isOpen={openSection === 'alerts'} onClose={closeModal} title="Alertas e prazos" description="Defina com quantos dias de antecedência o sistema avisa os vencimentos." size="md" footer={saveFooter(handleSaveAlerts)}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </Modal>

            {canEditWorkHours && (
                <Modal isOpen={openSection === 'workHours'} onClose={closeModal} title="Expediente e alertas" description="Quando a frota deve circular e quando o sistema deve avisar." size="xl">
                    <WorkHoursSettings />
                </Modal>
            )}

            <Modal isOpen={openSection === 'reports'} onClose={closeModal} title="Relatórios e assinaturas" description="Assinaturas padrão impressas no fim dos relatórios oficiais." size="lg">
                <ReportSignaturesEditor onSaved={closeModal} />
            </Modal>

            <Modal isOpen={openSection === 'pricing'} onClose={closeModal} title="Precificação de combustível" description="Como o valor do litro é determinado nos abastecimentos." size="lg" footer={saveFooter(handleSaveFuelPrice)}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                                    active ? 'border-[var(--sgf-primary)] bg-[var(--sgf-primary-soft)]' : 'border-slate-200 hover:border-[var(--sgf-primary)]',
                                )}
                            >
                                {active && <span className="absolute right-4 top-4 text-[var(--sgf-primary)]"><CheckCircle className="h-5 w-5" /></span>}
                                <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', active ? 'bg-[var(--sgf-primary-soft)] text-[var(--sgf-primary)]' : 'bg-slate-100 text-slate-500')}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{opt.title}</p>
                                    <p className="mt-1 text-sm leading-relaxed text-slate-500">{opt.description}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
                {fuelPriceMode === 'contract' && (
                    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-700">
                        Cadastre o preço de cada combustível em <b>Postos → Editar</b> para aplicar automaticamente.
                    </p>
                )}
            </Modal>
        </div>
    );
}
