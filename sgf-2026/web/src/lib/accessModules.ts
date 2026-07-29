export const ACCESS_MODULES = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'map', label: 'Mapa e rastreamento' },
    { id: 'notifications', label: 'Notificações' },
    { id: 'fleet', label: 'Gestão de frotas' },
    { id: 'drivers', label: 'Motoristas' },
    { id: 'trips', label: 'Viagens' },
    { id: 'refuelings', label: 'Abastecimentos' },
    { id: 'stations', label: 'Postos' },
    { id: 'maintenances', label: 'Manutenções' },
    { id: 'repair_shops', label: 'Oficinas' },
    { id: 'checklists', label: 'Checklists' },
    { id: 'infractions', label: 'Infrações' },
    { id: 'departments', label: 'Secretarias' },
    { id: 'reports', label: 'Relatórios e auditoria' },
    { id: 'settings', label: 'Configurações' },
] as const;

export type AccessModule = (typeof ACCESS_MODULES)[number]['id'];

export const ALL_ACCESS_MODULES = ACCESS_MODULES.map((module) => module.id);

export function canAccessModule(
    allowedModules: readonly string[] | undefined,
    module: AccessModule,
): boolean {
    // Perfis anteriores à migração não podem ficar presos fora do painel.
    return !allowedModules || allowedModules.includes(module);
}
