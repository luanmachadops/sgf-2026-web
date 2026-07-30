// Datasets dos relatórios — agora alimentados por dados REAIS do Supabase.
// Cada relatório agrega registros do banco em KPIs de resumo, colunas e linhas
// que abastecem tanto a pré-visualização na tela quanto as exportações (PDF/Excel).

import type { PostgrestError } from '@supabase/supabase-js';
import { procurementApi, type ProcurementContractUsage } from './procurement-api';
import { supabase } from './supabase';

export interface ReportColumn {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    format?: 'text' | 'integer' | 'decimal' | 'currency' | 'percent' | 'date';
    defaultVisible?: boolean;
    filterable?: boolean;
    minWidth?: number;
}

export interface ReportKpi {
    label: string;
    value: string;
}

export interface ReportChart {
    title: string;
    description?: string;
    type: 'bar' | 'donut' | 'gauge';
    valueFormat?: 'integer' | 'decimal' | 'currency' | 'percent';
    data: { label: string; value: number }[];
}

export interface ReportDataset {
    columns: ReportColumn[];
    rows: Record<string, string | number>[];
    kpis: ReportKpi[];
    charts?: ReportChart[];
    notes?: string[];
}

export interface ReportFilterInput {
    /** id (uuid) da secretaria; vazio = todas */
    departmentId?: string;
    /** ISO date (yyyy-mm-dd) inicial */
    dateFrom?: string;
    /** ISO date (yyyy-mm-dd) final */
    dateTo?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const EMPTY: ReportDataset = { kpis: [], columns: [], rows: [], charts: [] };
const PAGE_SIZE = 1000;

type RangeQuery<T> = {
    range: (
        from: number,
        to: number,
    ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

/**
 * O Data API limita respostas por projeto (1.000 linhas por padrão). Relatórios
 * não podem aceitar truncamento silencioso, então percorremos todas as páginas.
 * As consultas chamadoras devem sempre informar uma ordenação determinística.
 */
async function fetchAllRows<T>(query: RangeQuery<T>): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
    }
}

const BRL = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const NUM = (n: number, d = 0) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

function dateRange(f?: ReportFilterInput) {
    const from = f?.dateFrom ? new Date(f.dateFrom + 'T00:00:00').toISOString() : undefined;
    const to = f?.dateTo ? new Date(f.dateTo + 'T23:59:59').toISOString() : undefined;
    return { from, to };
}

function withinRange(value: string | null | undefined, from?: string, to?: string): boolean {
    if (!value) return false;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return false;
    if (from && time < new Date(from).getTime()) return false;
    if (to && time > new Date(to).getTime()) return false;
    return true;
}

function topChartData(
    values: { label: string; value: number }[],
    limit = 8,
): { label: string; value: number }[] {
    return [...values]
        .filter((item) => Number.isFinite(item.value))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}

export function formatReportValue(
    value: string | number | null | undefined,
    format: ReportColumn['format'] = 'text',
): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value !== 'number') return String(value);
    if (format === 'currency') {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    if (format === 'integer') return NUM(value, 0);
    if (format === 'decimal') return NUM(value, 2);
    if (format === 'percent') return `${NUM(value, 1)}%`;
    return value.toLocaleString('pt-BR');
}

const VEHICLE_STATUS_LABEL: Record<string, string> = {
    liberado: 'Disponível',
    manutencao: 'Em manutenção',
    bloqueado: 'Bloqueado',
};

const SO_STATUS_LABEL: Record<string, string> = {
    pendente: 'Pendente',
    aprovada: 'Aprovada',
    rejeitada: 'Rejeitada',
    em_execucao: 'Em execução',
    concluida: 'Concluída',
};

const SO_OPERATIONAL_STATUS_LABEL: Record<string, string> = {
    pending: 'Pendente',
    authorized: 'Autorizada',
    at_shop: 'Na oficina',
    awaiting_quote_approval: 'Aguardando orçamento',
    in_progress: 'Em execução',
    ready: 'Pronta',
    received: 'Recebida',
    cancelled: 'Cancelada',
};

const SO_FINANCIAL_STATUS_LABEL: Record<string, string> = {
    not_started: 'Não iniciado',
    awaiting_commitment: 'Aguardando empenho',
    committed: 'Empenhada',
    invoiced: 'Faturada',
    attested: 'Atestada',
    paid: 'Paga',
};

const TRIP_STATUS_LABEL: Record<string, string> = {
    andamento: 'Em andamento',
    concluida: 'Concluída',
    problema: 'Com anomalia',
    cancelada: 'Cancelada',
    pendente: 'Pendente',
};

function fmtDate(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

type Rel = { plate?: string | null; brand?: string | null; model?: string | null } | null;
const vehicleLabel = (v: Rel) =>
    v ? [v.brand, v.model].filter(Boolean).join(' ') || (v.plate ?? '—') : '—';

// ── Relatórios ───────────────────────────────────────────────────────────────

async function fleetSummary(f?: ReportFilterInput): Promise<ReportDataset> {
    let q = supabase
        .from('vehicles')
        .select('id, plate, brand, model, current_odometer, status, department_id, created_at, departments(name)')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
    if (f?.departmentId) q = q.eq('department_id', f.departmentId);
    const data = await fetchAllRows(q);
    const rows = data.map((v) => ({
        plate: v.plate ?? '—',
        model: [v.brand, v.model].filter(Boolean).join(' ') || '—',
        department: (v.departments as { name?: string } | null)?.name ?? '—',
        odometer: Number(v.current_odometer ?? 0),
        status: VEHICLE_STATUS_LABEL[v.status as string] ?? (v.status as string) ?? '—',
    }));
    const depts = new Set(data.map((v) => v.department_id).filter(Boolean));
    const statusCounts = Object.entries(VEHICLE_STATUS_LABEL).map(([status, label]) => ({
        label,
        value: data.filter((vehicle) => vehicle.status === status).length,
    }));
    return {
        kpis: [
            { label: 'Total de veículos', value: NUM(rows.length) },
            { label: 'Disponíveis agora', value: NUM(data.filter((v) => v.status === 'liberado').length) },
            { label: 'Em manutenção agora', value: NUM(data.filter((v) => v.status === 'manutencao').length) },
            { label: 'Secretarias', value: NUM(depts.size) },
        ],
        columns: [
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90 },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 160 },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'odometer', label: 'Odômetro (km)', align: 'right', format: 'integer', minWidth: 120 },
            { key: 'status', label: 'Status atual', filterable: true, minWidth: 120 },
        ],
        rows,
        charts: [{
            title: 'Situação atual da frota',
            description: 'Distribuição dos veículos conforme o estado registrado no momento da emissão.',
            type: 'donut',
            valueFormat: 'integer',
            data: statusCounts,
        }],
        notes: ['Os indicadores de disponibilidade e manutenção representam a situação atual, não uma média histórica do período.'],
    };
}

async function fuelConsumption(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    const q = supabase
        .from('fuelings')
        .select(`id, liters, total_cost, price_per_liter, km_per_liter, station, station_id,
            created_at, filled_at, fuel_type, odometer, vehicle_id, workflow_status,
            vehicles(plate, brand, model, department_id, departments(name))`)
        .in('workflow_status', ['validado', 'lancado_direto'])
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
    let list = await fetchAllRows(q);
    list = list.filter((row) => withinRange(row.filled_at ?? row.created_at, from, to));
    if (f?.departmentId) {
        list = list.filter((r) => (r.vehicles as { department_id?: string } | null)?.department_id === f.departmentId);
    }
    const rows = list.map((r) => ({
        date: fmtDate(r.filled_at ?? r.created_at),
        model: vehicleLabel(r.vehicles as Rel),
        plate: (r.vehicles as Rel)?.plate ?? '—',
        department: (r.vehicles as { departments?: { name?: string } | null } | null)?.departments?.name ?? '—',
        fuelType: String(r.fuel_type ?? '—').toUpperCase(),
        liters: Number(r.liters ?? 0),
        unitPrice: r.price_per_liter === null ? '—' : Number(r.price_per_liter),
        cost: Number(r.total_cost ?? 0),
        avg: Number(r.km_per_liter ?? 0) > 0 ? Number(r.km_per_liter) : '—',
        odometer: r.odometer === null ? '—' : Number(r.odometer),
        station: r.station ?? '—',
    }));
    const totalLiters = list.reduce((s, r) => s + Number(r.liters ?? 0), 0);
    const totalCost = list.reduce((s, r) => s + Number(r.total_cost ?? 0), 0);
    const validConsumption = list.filter((r) =>
        Number(r.km_per_liter ?? 0) > 0 && Number(r.liters ?? 0) > 0
    );
    const consumptionLiters = validConsumption.reduce((sum, row) => sum + Number(row.liters ?? 0), 0);
    const estimatedDistance = validConsumption.reduce(
        (sum, row) => sum + Number(row.km_per_liter ?? 0) * Number(row.liters ?? 0),
        0,
    );
    const avg = consumptionLiters > 0 ? estimatedDistance / consumptionLiters : 0;
    const vehicles = new Set(list.map((r) => r.vehicle_id).filter(Boolean));
    const costByVehicle = new Map<string, number>();
    for (const row of rows) {
        const key = String(row.plate);
        costByVehicle.set(key, (costByVehicle.get(key) ?? 0) + Number(row.cost));
    }
    return {
        kpis: [
            { label: 'Litros consumidos', value: `${NUM(totalLiters, 0)} L` },
            { label: 'Gasto total', value: BRL(totalCost) },
            {
                label: 'Consumo médio ponderado',
                value: consumptionLiters > 0 ? `${NUM(avg, 1)} km/L` : 'Sem medição válida',
            },
            { label: 'Veículos monitorados', value: NUM(vehicles.size) },
        ],
        columns: [
            { key: 'date', label: 'Data', format: 'date', minWidth: 90 },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90 },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 150 },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'fuelType', label: 'Combustível', filterable: true, minWidth: 105 },
            { key: 'liters', label: 'Litros', align: 'right', format: 'decimal', minWidth: 85 },
            { key: 'unitPrice', label: 'Preço unitário', align: 'right', format: 'currency', minWidth: 115 },
            { key: 'cost', label: 'Valor total', align: 'right', format: 'currency', minWidth: 115 },
            { key: 'avg', label: 'Média (km/L)', align: 'right', format: 'decimal', minWidth: 110 },
            { key: 'odometer', label: 'Odômetro', align: 'right', format: 'integer', defaultVisible: false, minWidth: 100 },
            { key: 'station', label: 'Posto', filterable: true, minWidth: 160 },
        ],
        rows,
        charts: [{
            title: 'Custo por veículo',
            description: 'Veículos com maior valor de abastecimentos válidos no período.',
            type: 'bar',
            valueFormat: 'currency',
            data: topChartData([...costByVehicle].map(([label, value]) => ({ label, value }))),
        }],
        notes: [
            'Somente abastecimentos validados ou lançados diretamente como efetivos compõem litros, valores e consumo.',
            'O consumo médio é ponderado pelos litros, equivalente à distância estimada total dividida pelo volume total com medição válida.',
        ],
    };
}

async function maintenanceHistory(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let q = supabase
        .from('service_orders')
        .select(`id, created_at, received_at, completed_at, category, description, status, priority,
            budget, cost, odometer, operational_status, financial_status, commitment_number, nad_number,
            vehicle_id, repair_shops(name),
            vehicles(plate, brand, model, department_id, departments(name))`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    let list = await fetchAllRows(q);
    if (f?.departmentId) {
        list = list.filter((r) => (r.vehicles as { department_id?: string } | null)?.department_id === f.departmentId);
    }
    const rows = list.map((r) => ({
        openedAt: fmtDate(r.created_at),
        receivedAt: fmtDate(r.received_at),
        model: vehicleLabel(r.vehicles as Rel),
        plate: (r.vehicles as Rel)?.plate ?? '—',
        department: (r.vehicles as { departments?: { name?: string } | null } | null)?.departments?.name ?? '—',
        category: r.category ?? '—',
        description: r.description ?? '—',
        shop: (r.repair_shops as { name?: string } | null)?.name ?? '—',
        budget: Number(r.budget ?? 0),
        cost: Number(r.cost ?? 0),
        operationalStatus: SO_OPERATIONAL_STATUS_LABEL[r.operational_status as string]
            ?? SO_STATUS_LABEL[r.status as string]
            ?? String(r.operational_status ?? r.status ?? '—'),
        financialStatus: SO_FINANCIAL_STATUS_LABEL[r.financial_status as string]
            ?? String(r.financial_status ?? '—'),
        commitment: r.commitment_number ?? '—',
        nad: r.nad_number ?? '—',
    }));
    const registeredCost = list.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
    const approvedBudget = list.reduce((sum, row) => sum + Number(row.budget ?? 0), 0);
    const statusCounts = new Map<string, number>();
    for (const row of rows) {
        statusCounts.set(
            String(row.operationalStatus),
            (statusCounts.get(String(row.operationalStatus)) ?? 0) + 1,
        );
    }
    return {
        kpis: [
            { label: 'Ordens de serviço', value: NUM(list.length) },
            { label: 'Orçamento aprovado', value: BRL(approvedBudget) },
            { label: 'Custo final registrado', value: BRL(registeredCost) },
            { label: 'Recebidas', value: NUM(list.filter((r) => r.operational_status === 'received').length) },
        ],
        columns: [
            { key: 'openedAt', label: 'Abertura', format: 'date', minWidth: 90 },
            { key: 'receivedAt', label: 'Recebimento', format: 'date', defaultVisible: false, minWidth: 100 },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90 },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 150 },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'category', label: 'Categoria', filterable: true, minWidth: 120 },
            { key: 'description', label: 'Descrição', minWidth: 220 },
            { key: 'shop', label: 'Oficina', filterable: true, minWidth: 160 },
            { key: 'budget', label: 'Orçado', align: 'right', format: 'currency', minWidth: 110 },
            { key: 'cost', label: 'Custo final', align: 'right', format: 'currency', minWidth: 110 },
            { key: 'operationalStatus', label: 'Situação operacional', filterable: true, minWidth: 145 },
            { key: 'financialStatus', label: 'Situação financeira', filterable: true, minWidth: 145 },
            { key: 'commitment', label: 'Empenho', defaultVisible: false, minWidth: 115 },
            { key: 'nad', label: 'NAD', defaultVisible: false, minWidth: 100 },
        ],
        rows,
        charts: [{
            title: 'Ordens por situação operacional',
            description: 'Distribuição do fluxo operacional das manutenções abertas no período.',
            type: 'bar',
            valueFormat: 'integer',
            data: topChartData([...statusCounts].map(([label, value]) => ({ label, value }))),
        }],
        notes: [
            'O período considera a data de abertura da ordem de serviço.',
            'Custo final registrado não significa, por si só, valor liquidado ou pago; a situação financeira deve ser conferida.',
        ],
    };
}

async function tripAnalysis(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let q = supabase
        .from('trips')
        .select(`id, start_at, distance_km, destination, status, end_at, vehicle_id,
            vehicles(plate, brand, model, department_id, departments(name)),
            profiles!trips_driver_id_fkey(full_name)`)
        .order('start_at', { ascending: false })
        .order('id', { ascending: true });
    if (from) q = q.gte('start_at', from);
    if (to) q = q.lte('start_at', to);
    let list = await fetchAllRows(q);
    if (f?.departmentId) {
        list = list.filter((r) => (r.vehicles as { department_id?: string } | null)?.department_id === f.departmentId);
    }
    const rows = list.map((r) => ({
        date: fmtDate(r.start_at),
        model: vehicleLabel(r.vehicles as Rel),
        plate: (r.vehicles as Rel)?.plate ?? '—',
        department: (r.vehicles as { departments?: { name?: string } | null } | null)?.departments?.name ?? '—',
        driver: (r.profiles as { full_name?: string } | null)?.full_name ?? '—',
        distance: Number(r.distance_km ?? 0),
        destination: r.destination ?? '—',
        status: TRIP_STATUS_LABEL[r.status as string] ?? String(r.status ?? '—'),
    }));
    const completed = list.filter((r) => ['concluida', 'problema'].includes(r.status));
    const totalKm = completed.reduce((s, r) => s + Number(r.distance_km ?? 0), 0);
    const avgKm = completed.length ? totalKm / completed.length : 0;
    const tripStatusCounts = Object.entries(TRIP_STATUS_LABEL).map(([status, label]) => ({
        label,
        value: list.filter((trip) => trip.status === status).length,
    }));
    return {
        kpis: [
            { label: 'Viagens', value: NUM(list.length) },
            { label: 'Km percorridos', value: `${NUM(totalKm, 0)} km` },
            { label: 'Distância média', value: `${NUM(avgKm, 0)} km` },
            { label: 'Anomalias', value: NUM(list.filter((r) => r.status === 'problema').length) },
        ],
        columns: [
            { key: 'date', label: 'Data', format: 'date', minWidth: 90 },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90 },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 150 },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'driver', label: 'Motorista', filterable: true, minWidth: 160 },
            { key: 'distance', label: 'Distância (km)', align: 'right', format: 'decimal', minWidth: 115 },
            { key: 'destination', label: 'Destino', filterable: true, minWidth: 180 },
            { key: 'status', label: 'Situação', filterable: true, minWidth: 120 },
        ],
        rows,
        charts: [{
            title: 'Situação das viagens',
            description: 'Quantidade de viagens por situação no período selecionado.',
            type: 'donut',
            valueFormat: 'integer',
            data: tripStatusCounts,
        }],
        notes: ['Quilometragem total e distância média consideram viagens encerradas, inclusive as encerradas com anomalia.'],
    };
}

async function driverPerformance(f?: ReportFilterInput): Promise<ReportDataset> {
    let dq = supabase
        .from('profiles')
        .select('id, full_name, score, driver_status, department_id, departments(name)')
        .eq('role', 'motorista')
        .order('score', { ascending: false })
        .order('id', { ascending: true });
    if (f?.departmentId) dq = dq.eq('department_id', f.departmentId);
    const drivers = await fetchAllRows(dq);

    const { from, to } = dateRange(f);
    let tq = supabase
        .from('trips')
        .select('id, driver_id, distance_km, start_at')
        .in('status', ['concluida', 'problema'])
        .order('start_at', { ascending: false })
        .order('id', { ascending: true });
    if (from) tq = tq.gte('start_at', from);
    if (to) tq = tq.lte('start_at', to);
    const trips = await fetchAllRows(tq);

    const tripStats = new Map<string, { trips: number; km: number }>();
    for (const t of trips) {
        if (!t.driver_id) continue;
        const cur = tripStats.get(t.driver_id) ?? { trips: 0, km: 0 };
        cur.trips += 1;
        cur.km += Number(t.distance_km ?? 0);
        tripStats.set(t.driver_id, cur);
    }

    const rows = drivers.map((d) => {
        const st = tripStats.get(d.id) ?? { trips: 0, km: 0 };
        return {
            driver: d.full_name ?? '—',
            department: (d.departments as { name?: string } | null)?.name ?? '—',
            trips: st.trips,
            km: Number(st.km.toFixed(0)),
            score: Number(d.score ?? 0),
        };
    });
    const totalTrips = rows.reduce((s, r) => s + Number(r.trips), 0);
    const active = drivers.filter((d) => d.driver_status === 'ativo');
    const avgScore = active.length ? active.reduce((s, d) => s + Number(d.score ?? 0), 0) / active.length : 0;
    return {
        kpis: [
            { label: 'Motoristas', value: NUM(drivers.length) },
            { label: 'Ativos', value: NUM(active.length) },
            { label: 'Viagens no período', value: NUM(totalTrips) },
            { label: 'Pontuação média', value: `${NUM(avgScore, 0)}/100` },
        ],
        columns: [
            { key: 'driver', label: 'Motorista', filterable: true, minWidth: 170 },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'trips', label: 'Viagens encerradas', align: 'right', format: 'integer', minWidth: 130 },
            { key: 'km', label: 'Km encerrados', align: 'right', format: 'integer', minWidth: 110 },
            { key: 'score', label: 'Pontuação atual', align: 'right', format: 'decimal', minWidth: 115 },
        ],
        rows,
        charts: [{
            title: 'Quilometragem por motorista',
            description: 'Motoristas com maior distância em viagens encerradas no período.',
            type: 'bar',
            valueFormat: 'integer',
            data: topChartData(rows.map((row) => ({ label: String(row.driver), value: Number(row.km) }))),
        }],
        notes: [
            'Viagens e quilômetros consideram viagens encerradas, inclusive as encerradas com anomalia.',
            'A pontuação é o valor atual do cadastro do motorista na data de emissão.',
        ],
    };
}

// Agregação por secretaria (compartilhada por cost-analysis, department-usage, efficiency-report)
async function departmentAggregates(f?: ReportFilterInput) {
    const { from, to } = dateRange(f);
    const [allDepts, vehicles, fuelings, trips, serviceOrders] = await Promise.all([
        fetchAllRows(
            supabase.from('departments').select('id, name').order('name').order('id'),
        ),
        fetchAllRows(
            supabase.from('vehicles').select('id, department_id, status').order('id'),
        ),
        (() => {
            const q = supabase
                .from('fuelings')
                .select('id, total_cost, created_at, filled_at, vehicle_id')
                .in('workflow_status', ['validado', 'lancado_direto'])
                .order('created_at', { ascending: false })
                .order('id');
            return fetchAllRows(q);
        })(),
        (() => {
            let q = supabase
                .from('trips')
                .select('id, vehicle_id, distance_km, start_at')
                .in('status', ['concluida', 'problema'])
                .order('start_at', { ascending: false })
                .order('id');
            if (from) q = q.gte('start_at', from);
            if (to) q = q.lte('start_at', to);
            return fetchAllRows(q);
        })(),
        fetchAllRows(
            supabase
                .from('service_orders')
                .select('id, vehicle_id, cost, budget, status, operational_status, received_at, completed_at, created_at')
                .or('operational_status.eq.received,status.eq.concluida')
                .order('created_at', { ascending: false })
                .order('id'),
        ),
    ]);
    let depts = allDepts;
    if (f?.departmentId) depts = depts.filter((d) => d.id === f.departmentId);

    const vehDept = new Map<string, string | null>();
    for (const v of vehicles) vehDept.set(v.id, v.department_id);

    return depts.map((d) => {
        const deptVehicles = vehicles.filter((v) => v.department_id === d.id);
        const fuel = fuelings
            .filter((fueling) =>
                fueling.vehicle_id
                && vehDept.get(fueling.vehicle_id) === d.id
                && withinRange(fueling.filled_at ?? fueling.created_at, from, to)
            )
            .reduce((s, x) => s + Number(x.total_cost ?? 0), 0);
        const deptTrips = trips.filter((x) => x.vehicle_id && vehDept.get(x.vehicle_id) === d.id);
        const km = deptTrips.reduce((s, x) => s + Number(x.distance_km ?? 0), 0);
        const maintenanceOrders = serviceOrders.filter((order) => {
            if (!order.vehicle_id || vehDept.get(order.vehicle_id) !== d.id) return false;
            const competence = order.received_at ?? order.completed_at ?? order.created_at;
            return withinRange(competence, from, to);
        });
        const maintenanceCost = maintenanceOrders.reduce(
            (sum, order) => sum + Number(order.cost ?? order.budget ?? 0),
            0,
        );
        return {
            name: d.name,
            vehicles: deptVehicles.length,
            available: deptVehicles.filter((v) => v.status === 'liberado').length,
            maintenanceVehicles: deptVehicles.filter((v) => v.status === 'manutencao').length,
            trips: deptTrips.length,
            km,
            fuel,
            maintenanceCost,
            totalCost: fuel + maintenanceCost,
        };
    });
}

async function costAnalysis(f?: ReportFilterInput): Promise<ReportDataset> {
    const agg = await departmentAggregates(f);
    const rows = agg.map((d) => ({
        department: d.name,
        fuel: Number(d.fuel.toFixed(0)),
        maintenance: Number(d.maintenanceCost.toFixed(0)),
        total: Number(d.totalCost.toFixed(0)),
    }));
    const totalFuel = agg.reduce((s, d) => s + d.fuel, 0);
    const totalMaintenance = agg.reduce((s, d) => s + d.maintenanceCost, 0);
    const totalCost = totalFuel + totalMaintenance;
    return {
        kpis: [
            { label: 'Custo operacional', value: BRL(totalCost) },
            { label: 'Combustível', value: BRL(totalFuel) },
            { label: 'Manutenção concluída', value: BRL(totalMaintenance) },
            { label: 'Secretarias', value: NUM(agg.length) },
        ],
        columns: [
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'fuel', label: 'Combustível', align: 'right', format: 'currency', minWidth: 125 },
            { key: 'maintenance', label: 'Manutenção concluída', align: 'right', format: 'currency', minWidth: 160 },
            { key: 'total', label: 'Total operacional', align: 'right', format: 'currency', minWidth: 145 },
        ],
        rows,
        charts: [{
            title: 'Custo operacional por secretaria',
            description: 'Combustível efetivo e manutenções concluídas no período.',
            type: 'bar',
            valueFormat: 'currency',
            data: topChartData(rows.map((row) => ({ label: String(row.department), value: Number(row.total) }))),
        }],
        notes: [
            'Combustível considera somente abastecimentos efetivos.',
            'Manutenção considera o custo final (ou orçamento, se o custo estiver ausente) das ordens recebidas/concluídas no período.',
            'Os valores são operacionais e devem ser conciliados com empenhos, notas, liquidação e pagamentos nos relatórios fiscais específicos.',
        ],
    };
}

async function departmentUsage(f?: ReportFilterInput): Promise<ReportDataset> {
    const agg = await departmentAggregates(f);
    const rows = agg.map((d) => ({
        department: d.name,
        vehicles: d.vehicles,
        trips: d.trips,
        km: Number(d.km.toFixed(0)),
        fuelCost: Number(d.fuel.toFixed(0)),
        maintenanceCost: Number(d.maintenanceCost.toFixed(0)),
        totalCost: Number(d.totalCost.toFixed(0)),
    }));
    const totalVehicles = agg.reduce((s, d) => s + d.vehicles, 0);
    const biggest = [...agg].sort((a, b) => b.vehicles - a.vehicles)[0];
    return {
        kpis: [
            { label: 'Secretarias', value: NUM(agg.length) },
            { label: 'Veículos alocados', value: NUM(totalVehicles) },
            { label: 'Maior frota', value: biggest ? `${biggest.name} (${biggest.vehicles})` : '—' },
            { label: 'Total de viagens', value: NUM(agg.reduce((s, d) => s + d.trips, 0)) },
        ],
        columns: [
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'vehicles', label: 'Veículos atuais', align: 'right', format: 'integer', minWidth: 120 },
            { key: 'trips', label: 'Viagens encerradas', align: 'right', format: 'integer', minWidth: 130 },
            { key: 'km', label: 'Km encerrados', align: 'right', format: 'integer', minWidth: 110 },
            { key: 'fuelCost', label: 'Combustível', align: 'right', format: 'currency', minWidth: 120 },
            { key: 'maintenanceCost', label: 'Manutenção', align: 'right', format: 'currency', minWidth: 120 },
            { key: 'totalCost', label: 'Custo operacional', align: 'right', format: 'currency', minWidth: 140 },
        ],
        rows,
        charts: [{
            title: 'Veículos por secretaria',
            description: 'Distribuição atual dos veículos alocados.',
            type: 'bar',
            valueFormat: 'integer',
            data: topChartData(rows.map((row) => ({ label: String(row.department), value: Number(row.vehicles) }))),
        }],
        notes: [
            'Veículos representam a alocação atual; viagens, quilômetros e custos obedecem ao período selecionado.',
            'Custo operacional separa combustível efetivo e manutenções concluídas.',
        ],
    };
}

async function efficiencyReport(f?: ReportFilterInput): Promise<ReportDataset> {
    const agg = await departmentAggregates(f);
    const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '0%');
    const rows = agg.map((d) => ({
        department: d.name,
        availability: d.vehicles > 0 ? (d.available / d.vehicles) * 100 : 0,
        maintenance: d.vehicles > 0 ? (d.maintenanceVehicles / d.vehicles) * 100 : 0,
        km: Number(d.km.toFixed(0)),
        trips: d.trips,
    }));
    const totalVeh = agg.reduce((s, d) => s + d.vehicles, 0);
    const totalAvail = agg.reduce((s, d) => s + d.available, 0);
    const totalMaint = agg.reduce((s, d) => s + d.maintenanceVehicles, 0);
    const totalKm = agg.reduce((s, d) => s + d.km, 0);
    return {
        kpis: [
            { label: 'Disponibilidade atual', value: pct(totalAvail, totalVeh) },
            { label: 'Em manutenção agora', value: pct(totalMaint, totalVeh) },
            { label: 'Km por veículo atual', value: `${NUM(totalVeh > 0 ? totalKm / totalVeh : 0, 0)} km` },
            { label: 'Veículos atuais', value: NUM(totalVeh) },
        ],
        columns: [
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'availability', label: 'Disponibilidade atual', align: 'right', format: 'percent', minWidth: 145 },
            { key: 'maintenance', label: 'Em manutenção agora', align: 'right', format: 'percent', minWidth: 150 },
            { key: 'trips', label: 'Viagens encerradas', align: 'right', format: 'integer', minWidth: 130 },
            { key: 'km', label: 'Km encerrados', align: 'right', format: 'integer', minWidth: 115 },
        ],
        rows,
        charts: [{
            title: 'Disponibilidade atual por secretaria',
            description: 'Percentual calculado com base no estado atual dos veículos.',
            type: 'bar',
            valueFormat: 'percent',
            data: topChartData(rows.map((row) => ({
                label: String(row.department),
                value: Number(row.availability),
            }))),
        }],
        notes: [
            'Disponibilidade e manutenção são fotografias do estado atual da frota na emissão.',
            'Viagens e quilômetros consideram viagens encerradas, inclusive as encerradas com anomalia.',
        ],
    };
}

const INFRACTION_STATUS_LABEL: Record<string, string> = {
    pendente: 'Pendente',
    indicada: 'Indicada',
    aprovada: 'Aprovada',
    rejeitada: 'Rejeitada',
    paga: 'Paga',
};

async function infractionsReport(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let q = supabase
        .from('infractions')
        .select(`id, occurred_at, plate, description, location, amount, points, status, vehicle_id,
            vehicles(department_id),
            indicated:profiles!infractions_indicated_driver_id_fkey(full_name),
            suggested:profiles!infractions_suggested_driver_id_fkey(full_name)`)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: true });
    if (from) q = q.gte('occurred_at', from);
    if (to) q = q.lte('occurred_at', to);
    let list = await fetchAllRows(q);
    if (f?.departmentId) {
        list = list.filter((r) => (r.vehicles as { department_id?: string } | null)?.department_id === f.departmentId);
    }

    const rows = list.map((r) => ({
        date: fmtDate(r.occurred_at),
        plate: r.plate ?? '—',
        description: r.description ?? '—',
        location: r.location ?? '—',
        driver: (r.indicated as { full_name?: string } | null)?.full_name
            ?? (r.suggested as { full_name?: string } | null)?.full_name
            ?? '—',
        amount: Number(r.amount ?? 0),
        points: Number(r.points ?? 0),
        status: INFRACTION_STATUS_LABEL[r.status as string] ?? (r.status as string) ?? '—',
    }));

    const totalAmount = list.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalPoints = list.reduce((s, r) => s + Number(r.points ?? 0), 0);
    return {
        kpis: [
            { label: 'Total de infrações', value: NUM(list.length) },
            { label: 'Pendentes', value: NUM(list.filter((r) => r.status === 'pendente').length) },
            { label: 'Valor total', value: BRL(totalAmount) },
            { label: 'Pontos acumulados', value: NUM(totalPoints) },
        ],
        columns: [
            { key: 'date', label: 'Data', format: 'date', minWidth: 90 },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90 },
            { key: 'description', label: 'Infração', filterable: true, minWidth: 190 },
            { key: 'location', label: 'Local', filterable: true, minWidth: 170 },
            { key: 'driver', label: 'Condutor', filterable: true, minWidth: 160 },
            { key: 'amount', label: 'Valor', align: 'right', format: 'currency', minWidth: 105 },
            { key: 'points', label: 'Pontos', align: 'right', format: 'integer', defaultVisible: false, minWidth: 80 },
            { key: 'status', label: 'Situação', filterable: true, minWidth: 110 },
        ],
        rows,
        charts: [{
            title: 'Valores por situação',
            description: 'Soma dos valores das infrações conforme a situação no período.',
            type: 'bar',
            valueFormat: 'currency',
            data: topChartData(Object.values(INFRACTION_STATUS_LABEL).map((label) => ({
                label,
                value: rows
                    .filter((row) => row.status === label)
                    .reduce((sum, row) => sum + Number(row.amount), 0),
            }))),
        }],
    };
}

async function fuelByStation(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    const query = supabase
        .from('fuelings')
        .select('id, station_id, liters, total_cost, workflow_status, created_at, filled_at, fuel_stations(name), vehicles(department_id)')
        .not('station_id', 'is', null)
        .in('workflow_status', ['concluido', 'validado', 'lancado_direto', 'rejeitado_admin'])
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });

    type FuelRow = {
        station_id: string | null;
        liters: number | null;
        total_cost: number | null;
        workflow_status: string;
        created_at: string;
        filled_at: string | null;
        fuel_stations: { name?: string | null } | null;
        vehicles: { department_id?: string | null } | null;
    };
    const [fuelRows, contractUsage] = await Promise.all([
        fetchAllRows(query) as unknown as Promise<FuelRow[]>,
        procurementApi.getContractUsage(),
    ]);
    let list = fuelRows;
    list = list.filter((row) => withinRange(row.filled_at ?? row.created_at, from, to));
    if (f?.departmentId) {
        list = list.filter((row) => row.vehicles?.department_id === f.departmentId);
    }

    const grouped = new Map<string, {
        station: string;
        count: number;
        liters: number;
        presented: number;
        validated: number;
        pending: number;
        rejected: number;
    }>();
    for (const row of list) {
        if (!row.station_id) continue;
        const current = grouped.get(row.station_id) ?? {
            station: row.fuel_stations?.name || 'Posto não identificado',
            count: 0,
            liters: 0,
            presented: 0,
            validated: 0,
            pending: 0,
            rejected: 0,
        };
        if (row.workflow_status === 'rejeitado_admin') {
            current.rejected += 1;
        } else {
            current.count += 1;
            current.liters += Number(row.liters ?? 0);
            current.presented += Number(row.total_cost ?? 0);
            if (['validado', 'lancado_direto'].includes(row.workflow_status)) {
                current.validated += Number(row.total_cost ?? 0);
            }
            if (row.workflow_status === 'concluido') current.pending += Number(row.total_cost ?? 0);
        }
        grouped.set(row.station_id, current);
    }

    const rows = contractUsage
        .filter((usage) => usage.partnerKind === 'posto')
        .map((usage) => {
            const activity = grouped.get(usage.partnerId) ?? {
                station: usage.partnerName,
                count: 0,
                liters: 0,
                presented: 0,
                validated: 0,
                pending: 0,
                rejected: 0,
            };
            return {
                station: usage.partnerName,
                fuelings: activity.count,
                liters: Number(activity.liters.toFixed(2)),
                presented: Number(activity.presented.toFixed(2)),
                validated: Number(activity.validated.toFixed(2)),
                pending: Number(activity.pending.toFixed(2)),
                rejected: activity.rejected,
                contractValue: usage.contractValue ?? 'Não informado',
                reserved: Number(usage.reservedValue.toFixed(2)),
                realized: Number(usage.realizedValue.toFixed(2)),
                disputed: Number(usage.disputedValue.toFixed(2)),
                remaining: usage.remainingValue ?? 'Não calculado',
                consumedPercent: usage.consumedPercent ?? 'Sem teto',
                invoiced: 'Ainda não controlado',
                paid: 'Ainda não controlado',
            };
        })
        .sort((a, b) => b.presented - a.presented);
    const total = rows.reduce((sum, row) => ({
        fuelings: sum.fuelings + row.fuelings,
        liters: sum.liters + row.liters,
        validated: sum.validated + row.validated,
        contracted: sum.contracted + (typeof row.contractValue === 'number' ? row.contractValue : 0),
        remaining: sum.remaining + (typeof row.remaining === 'number' ? row.remaining : 0),
    }), { fuelings: 0, liters: 0, validated: 0, contracted: 0, remaining: 0 });

    return {
        kpis: [
            { label: 'Postos cadastrados', value: NUM(rows.length) },
            { label: 'Abastecimentos', value: NUM(total.fuelings) },
            { label: 'Total contratado', value: BRL(total.contracted) },
            { label: 'Saldo disponível', value: BRL(total.remaining) },
        ],
        columns: [
            { key: 'station', label: 'Posto', filterable: true, minWidth: 180 },
            { key: 'fuelings', label: 'Registros', align: 'right', format: 'integer', minWidth: 90 },
            { key: 'liters', label: 'Litros', align: 'right', format: 'decimal', minWidth: 90 },
            { key: 'presented', label: 'Apresentado', align: 'right', format: 'currency', minWidth: 125 },
            { key: 'validated', label: 'Validado', align: 'right', format: 'currency', minWidth: 115 },
            { key: 'pending', label: 'Pendente', align: 'right', format: 'currency', minWidth: 115 },
            { key: 'rejected', label: 'Rejeitados', align: 'right', format: 'integer', minWidth: 95 },
            { key: 'contractValue', label: 'Contratado', align: 'right', format: 'currency', minWidth: 120 },
            { key: 'reserved', label: 'Reservado', align: 'right', format: 'currency', minWidth: 110 },
            { key: 'realized', label: 'Realizado acumulado', align: 'right', format: 'currency', minWidth: 145 },
            { key: 'disputed', label: 'Em contestação', align: 'right', format: 'currency', defaultVisible: false, minWidth: 125 },
            { key: 'remaining', label: 'Saldo disponível', align: 'right', format: 'currency', minWidth: 130 },
            { key: 'consumedPercent', label: '% consumido', align: 'right', format: 'percent', minWidth: 105 },
            { key: 'invoiced', label: 'Faturado', defaultVisible: false, minWidth: 145 },
            { key: 'paid', label: 'Pago', defaultVisible: false, minWidth: 145 },
        ],
        rows,
        charts: [{
            title: 'Termômetro das licitações dos postos',
            description: 'Percentual consumido do valor contratado; a faixa de atenção começa em 80%.',
            type: 'gauge',
            valueFormat: 'percent',
            data: topChartData(rows.flatMap((row) =>
                typeof row.consumedPercent === 'number'
                    ? [{ label: String(row.station), value: row.consumedPercent }]
                    : []
            )),
        }],
        notes: [
            'Apresentado reúne registros concluídos e validados; rejeições não compõem litros nem valores.',
            'O saldo da licitação é acumulado do contrato e não muda com o filtro de período ou secretaria.',
            'Faturado e pago estão identificados como não controlados até a implantação do fechamento fiscal do posto.',
            'Este resumo é gerencial e ainda não representa o fechamento fiscal mensal congelado, que será tratado em etapa específica.',
        ],
    };
}

async function maintenanceByShop(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    const query = supabase
        .from('service_orders')
        .select(`id, repair_shop_id, budget, cost, operational_status, financial_status,
            created_at, completed_at, received_at, repair_shops(name), vehicles(department_id)`)
        .not('repair_shop_id', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });

    type OrderRow = {
        repair_shop_id: string | null;
        budget: number | null;
        cost: number | null;
        operational_status: string;
        financial_status: string;
        created_at: string;
        completed_at: string | null;
        received_at: string | null;
        repair_shops: { name?: string | null } | null;
        vehicles: { department_id?: string | null } | null;
    };
    const [orderRows, contractUsage] = await Promise.all([
        fetchAllRows(query) as unknown as Promise<OrderRow[]>,
        procurementApi.getContractUsage(),
    ]);
    let list = orderRows;
    list = list.filter((row) =>
        withinRange(row.received_at ?? row.completed_at ?? row.created_at, from, to)
    );
    if (f?.departmentId) {
        list = list.filter((row) => row.vehicles?.department_id === f.departmentId);
    }

    const grouped = new Map<string, {
        shop: string;
        orders: number;
        budget: number;
        cost: number;
        execution: number;
        openFinance: number;
        paid: number;
    }>();
    for (const row of list) {
        if (!row.repair_shop_id) continue;
        const current = grouped.get(row.repair_shop_id) ?? {
            shop: row.repair_shops?.name || 'Oficina não identificada',
            orders: 0,
            budget: 0,
            cost: 0,
            execution: 0,
            openFinance: 0,
            paid: 0,
        };
        current.orders += 1;
        current.budget += Number(row.budget ?? 0);
        current.cost += Number(Number(row.cost ?? 0) > 0 ? row.cost : row.budget ?? 0);
        if (['at_shop', 'awaiting_quote_approval', 'in_progress', 'ready'].includes(row.operational_status)) {
            current.execution += 1;
        }
        if (!['not_started', 'paid'].includes(row.financial_status)) current.openFinance += 1;
        if (row.financial_status === 'paid') current.paid += 1;
        grouped.set(row.repair_shop_id, current);
    }

    const usageByShop = new Map(
        contractUsage
            .filter((item) => item.partnerKind === 'oficina')
            .map((item) => [item.partnerId, item] satisfies [string, ProcurementContractUsage]),
    );
    const rows = [...usageByShop.values()]
        .map((usage) => {
            const activity = grouped.get(usage.partnerId) ?? {
                shop: usage.partnerName,
                orders: 0,
                budget: 0,
                cost: 0,
                execution: 0,
                openFinance: 0,
                paid: 0,
            };
            return {
                shop: usage.partnerName,
                orders: activity.orders,
                budget: Number(activity.budget.toFixed(2)),
                cost: Number(activity.cost.toFixed(2)),
                execution: activity.execution,
                openFinance: activity.openFinance,
                paidOrders: activity.paid,
                contractValue: usage.contractValue ?? 'Não informado',
                reserved: Number(usage.reservedValue.toFixed(2)),
                realized: Number(usage.realizedValue.toFixed(2)),
                invoiced: Number((usage.invoicedValue ?? 0).toFixed(2)),
                paid: Number((usage.paidValue ?? 0).toFixed(2)),
                remaining: usage.remainingValue ?? 'Não calculado',
                consumedPercent: usage.consumedPercent ?? 'Sem teto',
            };
        })
        .sort((a, b) => b.cost - a.cost);
    const totals = rows.reduce((sum, row) => ({
        orders: sum.orders + row.orders,
        budget: sum.budget + row.budget,
        cost: sum.cost + row.cost,
        openFinance: sum.openFinance + row.openFinance,
        contracted: sum.contracted + (typeof row.contractValue === 'number' ? row.contractValue : 0),
        remaining: sum.remaining + (typeof row.remaining === 'number' ? row.remaining : 0),
    }), { orders: 0, budget: 0, cost: 0, openFinance: 0, contracted: 0, remaining: 0 });

    return {
        kpis: [
            { label: 'Oficinas cadastradas', value: NUM(rows.length) },
            { label: 'Ordens de serviço', value: NUM(totals.orders) },
            { label: 'Total contratado', value: BRL(totals.contracted) },
            { label: 'Saldo disponível', value: BRL(totals.remaining) },
        ],
        columns: [
            { key: 'shop', label: 'Oficina', filterable: true, minWidth: 180 },
            { key: 'orders', label: 'OS', align: 'right', format: 'integer', minWidth: 70 },
            { key: 'budget', label: 'Orçado', align: 'right', format: 'currency', minWidth: 115 },
            { key: 'cost', label: 'Custo final', align: 'right', format: 'currency', minWidth: 115 },
            { key: 'execution', label: 'Em execução', align: 'right', format: 'integer', minWidth: 105 },
            { key: 'openFinance', label: 'Financeiro aberto', align: 'right', format: 'integer', minWidth: 130 },
            { key: 'paidOrders', label: 'OS pagas', align: 'right', format: 'integer', defaultVisible: false, minWidth: 85 },
            { key: 'contractValue', label: 'Contratado', align: 'right', format: 'currency', minWidth: 120 },
            { key: 'reserved', label: 'Reservado', align: 'right', format: 'currency', minWidth: 110 },
            { key: 'realized', label: 'Realizado acumulado', align: 'right', format: 'currency', minWidth: 145 },
            { key: 'invoiced', label: 'Faturado', align: 'right', format: 'currency', minWidth: 110 },
            { key: 'paid', label: 'Pago', align: 'right', format: 'currency', minWidth: 110 },
            { key: 'remaining', label: 'Saldo disponível', align: 'right', format: 'currency', minWidth: 130 },
            { key: 'consumedPercent', label: '% consumido', align: 'right', format: 'percent', minWidth: 105 },
        ],
        rows,
        charts: [{
            title: 'Termômetro das licitações das oficinas',
            description: 'Percentual consumido do valor contratado; a faixa de atenção começa em 80%.',
            type: 'gauge',
            valueFormat: 'percent',
            data: topChartData(rows.flatMap((row) =>
                typeof row.consumedPercent === 'number'
                    ? [{ label: String(row.shop), value: row.consumedPercent }]
                    : []
            )),
        }],
        notes: [
            'A competência usa recebimento; na ausência, conclusão e depois abertura da ordem.',
            'O saldo da licitação é acumulado do contrato e não muda com o filtro de período ou secretaria.',
            'Reservado e realizado consomem o teto; faturado e pago são marcos da mesma despesa e não são somados novamente.',
        ],
    };
}

const FETCHERS: Record<string, (f?: ReportFilterInput) => Promise<ReportDataset>> = {
    'fleet-summary': fleetSummary,
    'fuel-consumption': fuelConsumption,
    'maintenance-history': maintenanceHistory,
    'trip-analysis': tripAnalysis,
    'driver-performance': driverPerformance,
    'cost-analysis': costAnalysis,
    'department-usage': departmentUsage,
    'efficiency-report': efficiencyReport,
    'infractions': infractionsReport,
    'fuel-by-station': fuelByStation,
    'maintenance-by-shop': maintenanceByShop,
};

/** Busca o dataset real de um relatório, aplicando os filtros selecionados. */
export async function fetchReportDataset(
    reportId: string,
    filters?: ReportFilterInput
): Promise<ReportDataset> {
    const fn = FETCHERS[reportId];
    if (!fn) return EMPTY;
    return fn(filters);
}

/** Opções de secretaria (reais) para os filtros do relatório. */
export async function fetchDepartmentOptions(): Promise<{ value: string; label: string }[]> {
    const data = await fetchAllRows(
        supabase.from('departments').select('id, name').order('name').order('id'),
    );
    return [
        { value: '', label: 'Todas as secretarias' },
        ...data.map((d) => ({ value: d.id, label: d.name })),
    ];
}

export { TRIP_STATUS_LABEL };
