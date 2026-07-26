// Datasets dos relatórios — agora alimentados por dados REAIS do Supabase.
// Cada relatório agrega registros do banco em KPIs de resumo, colunas e linhas
// que abastecem tanto a pré-visualização na tela quanto as exportações (PDF/Excel).

import { supabase } from './supabase';

export interface ReportColumn {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
}

export interface ReportKpi {
    label: string;
    value: string;
}

export interface ReportDataset {
    columns: ReportColumn[];
    rows: Record<string, string | number>[];
    kpis: ReportKpi[];
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
const EMPTY: ReportDataset = { kpis: [], columns: [], rows: [] };

const BRL = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const NUM = (n: number, d = 0) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

function dateRange(f?: ReportFilterInput) {
    const from = f?.dateFrom ? new Date(f.dateFrom + 'T00:00:00').toISOString() : undefined;
    const to = f?.dateTo ? new Date(f.dateTo + 'T23:59:59').toISOString() : undefined;
    return { from, to };
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
        .select('plate, brand, model, current_odometer, status, department_id, departments(name)')
        .order('created_at', { ascending: false });
    if (f?.departmentId) q = q.eq('department_id', f.departmentId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []).map((v) => ({
        plate: v.plate ?? '—',
        model: [v.brand, v.model].filter(Boolean).join(' ') || '—',
        department: (v.departments as { name?: string } | null)?.name ?? '—',
        odometer: Number(v.current_odometer ?? 0),
        status: VEHICLE_STATUS_LABEL[v.status as string] ?? (v.status as string) ?? '—',
    }));
    const depts = new Set((data ?? []).map((v) => v.department_id).filter(Boolean));
    return {
        kpis: [
            { label: 'Total de veículos', value: NUM(rows.length) },
            { label: 'Disponíveis', value: NUM((data ?? []).filter((v) => v.status === 'liberado').length) },
            { label: 'Em manutenção', value: NUM((data ?? []).filter((v) => v.status === 'manutencao').length) },
            { label: 'Secretarias', value: NUM(depts.size) },
        ],
        columns: [
            { key: 'plate', label: 'Placa' },
            { key: 'model', label: 'Modelo' },
            { key: 'department', label: 'Secretaria' },
            { key: 'odometer', label: 'Odômetro (km)', align: 'right' },
            { key: 'status', label: 'Status' },
        ],
        rows,
    };
}

async function fuelConsumption(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let q = supabase
        .from('fuelings')
        .select('liters, total_cost, km_per_liter, station, created_at, vehicle_id, vehicles(plate, brand, model, department_id)')
        .order('created_at', { ascending: false });
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data, error } = await q;
    if (error) throw error;
    let list = data ?? [];
    if (f?.departmentId) {
        list = list.filter((r) => (r.vehicles as { department_id?: string } | null)?.department_id === f.departmentId);
    }
    const rows = list.map((r) => ({
        model: vehicleLabel(r.vehicles as Rel),
        plate: (r.vehicles as Rel)?.plate ?? '—',
        liters: Number(r.liters ?? 0),
        cost: Number(r.total_cost ?? 0),
        avg: Number(r.km_per_liter ?? 0),
        station: r.station ?? '—',
    }));
    const totalLiters = list.reduce((s, r) => s + Number(r.liters ?? 0), 0);
    const totalCost = list.reduce((s, r) => s + Number(r.total_cost ?? 0), 0);
    const valid = list.filter((r) => r.km_per_liter && Number(r.km_per_liter) > 0);
    const avg = valid.length ? valid.reduce((s, r) => s + Number(r.km_per_liter), 0) / valid.length : 0;
    const vehicles = new Set(list.map((r) => r.vehicle_id).filter(Boolean));
    return {
        kpis: [
            { label: 'Litros consumidos', value: `${NUM(totalLiters, 0)} L` },
            { label: 'Gasto total', value: BRL(totalCost) },
            { label: 'Consumo médio', value: `${NUM(avg, 1)} km/L` },
            { label: 'Veículos monitorados', value: NUM(vehicles.size) },
        ],
        columns: [
            { key: 'model', label: 'Modelo' },
            { key: 'plate', label: 'Placa' },
            { key: 'liters', label: 'Litros', align: 'right' },
            { key: 'cost', label: 'Custo (R$)', align: 'right' },
            { key: 'avg', label: 'Média (km/L)', align: 'right' },
            { key: 'station', label: 'Posto' },
        ],
        rows,
    };
}

async function maintenanceHistory(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let q = supabase
        .from('service_orders')
        .select('created_at, category, description, status, priority, vehicle_id, vehicles(plate, brand, model, department_id)')
        .order('created_at', { ascending: false });
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data, error } = await q;
    if (error) throw error;
    let list = data ?? [];
    if (f?.departmentId) {
        list = list.filter((r) => (r.vehicles as { department_id?: string } | null)?.department_id === f.departmentId);
    }
    const rows = list.map((r) => ({
        date: fmtDate(r.created_at),
        model: vehicleLabel(r.vehicles as Rel),
        plate: (r.vehicles as Rel)?.plate ?? '—',
        category: r.category ?? '—',
        description: r.description ?? '—',
        status: SO_STATUS_LABEL[r.status as string] ?? (r.status as string) ?? '—',
    }));
    return {
        kpis: [
            { label: 'Ordens de serviço', value: NUM(list.length) },
            { label: 'Pendentes', value: NUM(list.filter((r) => r.status === 'pendente').length) },
            { label: 'Em execução', value: NUM(list.filter((r) => r.status === 'em_execucao').length) },
            { label: 'Concluídas', value: NUM(list.filter((r) => r.status === 'concluida').length) },
        ],
        columns: [
            { key: 'date', label: 'Data' },
            { key: 'model', label: 'Modelo' },
            { key: 'plate', label: 'Placa' },
            { key: 'category', label: 'Categoria' },
            { key: 'description', label: 'Descrição' },
            { key: 'status', label: 'Status' },
        ],
        rows,
    };
}

async function tripAnalysis(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let q = supabase
        .from('trips')
        .select('start_at, distance_km, destination, status, end_at, vehicle_id, vehicles(plate, brand, model, department_id), profiles!trips_driver_id_fkey(full_name)')
        .order('start_at', { ascending: false });
    if (from) q = q.gte('start_at', from);
    if (to) q = q.lte('start_at', to);
    const { data, error } = await q;
    if (error) throw error;
    let list = data ?? [];
    if (f?.departmentId) {
        list = list.filter((r) => (r.vehicles as { department_id?: string } | null)?.department_id === f.departmentId);
    }
    const rows = list.map((r) => ({
        date: fmtDate(r.start_at),
        model: vehicleLabel(r.vehicles as Rel),
        plate: (r.vehicles as Rel)?.plate ?? '—',
        driver: (r.profiles as { full_name?: string } | null)?.full_name ?? '—',
        distance: Number(r.distance_km ?? 0),
        destination: r.destination ?? '—',
    }));
    const totalKm = list.reduce((s, r) => s + Number(r.distance_km ?? 0), 0);
    const completed = list.filter((r) => r.status === 'concluida');
    const avgKm = completed.length ? totalKm / completed.length : 0;
    return {
        kpis: [
            { label: 'Viagens', value: NUM(list.length) },
            { label: 'Km percorridos', value: `${NUM(totalKm, 0)} km` },
            { label: 'Distância média', value: `${NUM(avgKm, 0)} km` },
            { label: 'Anomalias', value: NUM(list.filter((r) => r.status === 'problema').length) },
        ],
        columns: [
            { key: 'date', label: 'Data' },
            { key: 'model', label: 'Modelo' },
            { key: 'plate', label: 'Placa' },
            { key: 'driver', label: 'Motorista' },
            { key: 'distance', label: 'Distância (km)', align: 'right' },
            { key: 'destination', label: 'Destino' },
        ],
        rows,
    };
}

async function driverPerformance(f?: ReportFilterInput): Promise<ReportDataset> {
    let dq = supabase
        .from('profiles')
        .select('id, full_name, score, driver_status, department_id, departments(name)')
        .eq('role', 'motorista')
        .order('score', { ascending: false });
    if (f?.departmentId) dq = dq.eq('department_id', f.departmentId);
    const { data: drivers, error } = await dq;
    if (error) throw error;

    const { from, to } = dateRange(f);
    let tq = supabase.from('trips').select('driver_id, distance_km, start_at');
    if (from) tq = tq.gte('start_at', from);
    if (to) tq = tq.lte('start_at', to);
    const { data: trips } = await tq;

    const tripStats = new Map<string, { trips: number; km: number }>();
    for (const t of trips ?? []) {
        const cur = tripStats.get(t.driver_id) ?? { trips: 0, km: 0 };
        cur.trips += 1;
        cur.km += Number(t.distance_km ?? 0);
        tripStats.set(t.driver_id, cur);
    }

    const rows = (drivers ?? []).map((d) => {
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
    const active = (drivers ?? []).filter((d) => d.driver_status === 'ativo');
    const avgScore = active.length ? active.reduce((s, d) => s + Number(d.score ?? 0), 0) / active.length : 0;
    return {
        kpis: [
            { label: 'Motoristas', value: NUM((drivers ?? []).length) },
            { label: 'Ativos', value: NUM(active.length) },
            { label: 'Viagens no período', value: NUM(totalTrips) },
            { label: 'Pontuação média', value: `${NUM(avgScore, 0)}/100` },
        ],
        columns: [
            { key: 'driver', label: 'Motorista' },
            { key: 'department', label: 'Secretaria' },
            { key: 'trips', label: 'Viagens', align: 'right' },
            { key: 'km', label: 'Km', align: 'right' },
            { key: 'score', label: 'Pontuação', align: 'right' },
        ],
        rows,
    };
}

// Agregação por secretaria (compartilhada por cost-analysis, department-usage, efficiency-report)
async function departmentAggregates(f?: ReportFilterInput) {
    const { from, to } = dateRange(f);
    const [deptsRes, vehiclesRes, fuelingsRes, tripsRes] = await Promise.all([
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('vehicles').select('id, department_id, status'),
        (() => {
            let q = supabase.from('fuelings').select('total_cost, created_at, vehicle_id');
            if (from) q = q.gte('created_at', from);
            if (to) q = q.lte('created_at', to);
            return q;
        })(),
        (() => {
            let q = supabase.from('trips').select('vehicle_id, distance_km, start_at');
            if (from) q = q.gte('start_at', from);
            if (to) q = q.lte('start_at', to);
            return q;
        })(),
    ]);
    if (deptsRes.error) throw deptsRes.error;
    let depts = deptsRes.data ?? [];
    if (f?.departmentId) depts = depts.filter((d) => d.id === f.departmentId);
    const vehicles = vehiclesRes.data ?? [];
    const fuelings = fuelingsRes.data ?? [];
    const trips = tripsRes.data ?? [];

    const vehDept = new Map<string, string | null>();
    for (const v of vehicles) vehDept.set(v.id, v.department_id);

    return depts.map((d) => {
        const deptVehicles = vehicles.filter((v) => v.department_id === d.id);
        const fuel = fuelings
            .filter((x) => x.vehicle_id && vehDept.get(x.vehicle_id) === d.id)
            .reduce((s, x) => s + Number(x.total_cost ?? 0), 0);
        const deptTrips = trips.filter((x) => x.vehicle_id && vehDept.get(x.vehicle_id) === d.id);
        const km = deptTrips.reduce((s, x) => s + Number(x.distance_km ?? 0), 0);
        return {
            name: d.name,
            vehicles: deptVehicles.length,
            available: deptVehicles.filter((v) => v.status === 'liberado').length,
            maintenance: deptVehicles.filter((v) => v.status === 'manutencao').length,
            trips: deptTrips.length,
            km,
            fuel,
        };
    });
}

async function costAnalysis(f?: ReportFilterInput): Promise<ReportDataset> {
    const agg = await departmentAggregates(f);
    const rows = agg.map((d) => ({
        department: d.name,
        fuel: Number(d.fuel.toFixed(0)),
        maintenance: 0,
        total: Number(d.fuel.toFixed(0)),
    }));
    const totalFuel = agg.reduce((s, d) => s + d.fuel, 0);
    return {
        kpis: [
            { label: 'Custo total', value: BRL(totalFuel) },
            { label: 'Combustível', value: BRL(totalFuel) },
            { label: 'Manutenção', value: BRL(0) },
            { label: 'Secretarias', value: NUM(agg.length) },
        ],
        columns: [
            { key: 'department', label: 'Secretaria' },
            { key: 'fuel', label: 'Combustível (R$)', align: 'right' },
            { key: 'maintenance', label: 'Manutenção (R$)', align: 'right' },
            { key: 'total', label: 'Total (R$)', align: 'right' },
        ],
        rows,
    };
}

async function departmentUsage(f?: ReportFilterInput): Promise<ReportDataset> {
    const agg = await departmentAggregates(f);
    const rows = agg.map((d) => ({
        department: d.name,
        vehicles: d.vehicles,
        trips: d.trips,
        cost: Number(d.fuel.toFixed(0)),
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
            { key: 'department', label: 'Secretaria' },
            { key: 'vehicles', label: 'Veículos', align: 'right' },
            { key: 'trips', label: 'Viagens', align: 'right' },
            { key: 'cost', label: 'Gasto (R$)', align: 'right' },
        ],
        rows,
    };
}

async function efficiencyReport(f?: ReportFilterInput): Promise<ReportDataset> {
    const agg = await departmentAggregates(f);
    const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '0%');
    const rows = agg.map((d) => ({
        department: d.name,
        availability: pct(d.available, d.vehicles),
        maintenance: pct(d.maintenance, d.vehicles),
        km: Number(d.km.toFixed(0)),
    }));
    const totalVeh = agg.reduce((s, d) => s + d.vehicles, 0);
    const totalAvail = agg.reduce((s, d) => s + d.available, 0);
    const totalMaint = agg.reduce((s, d) => s + d.maintenance, 0);
    const totalKm = agg.reduce((s, d) => s + d.km, 0);
    return {
        kpis: [
            { label: 'Disponibilidade', value: pct(totalAvail, totalVeh) },
            { label: 'Em manutenção', value: pct(totalMaint, totalVeh) },
            { label: 'Km/veículo', value: `${NUM(totalVeh > 0 ? totalKm / totalVeh : 0, 0)} km` },
            { label: 'Veículos', value: NUM(totalVeh) },
        ],
        columns: [
            { key: 'department', label: 'Secretaria' },
            { key: 'availability', label: 'Disponibilidade', align: 'right' },
            { key: 'maintenance', label: 'Em manutenção', align: 'right' },
            { key: 'km', label: 'Km percorridos', align: 'right' },
        ],
        rows,
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
        .select(`occurred_at, plate, description, location, amount, points, status, vehicle_id,
            vehicles(department_id),
            indicated:profiles!infractions_indicated_driver_id_fkey(full_name),
            suggested:profiles!infractions_suggested_driver_id_fkey(full_name)`)
        .order('occurred_at', { ascending: false });
    if (from) q = q.gte('occurred_at', from);
    if (to) q = q.lte('occurred_at', to);
    const { data, error } = await q;
    if (error) throw error;
    let list = data ?? [];
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
            { key: 'date', label: 'Data' },
            { key: 'plate', label: 'Placa' },
            { key: 'description', label: 'Infração' },
            { key: 'location', label: 'Local' },
            { key: 'driver', label: 'Condutor' },
            { key: 'amount', label: 'Valor (R$)', align: 'right' },
            { key: 'status', label: 'Status' },
        ],
        rows,
    };
}

async function fuelByStation(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let query = supabase
        .from('fuelings')
        .select('station_id, liters, total_cost, workflow_status, filled_at, fuel_stations(name), vehicles(department_id)')
        .not('station_id', 'is', null)
        .not('filled_at', 'is', null)
        .in('workflow_status', ['concluido', 'validado', 'rejeitado_admin']);
    if (from) query = query.gte('filled_at', from);
    if (to) query = query.lte('filled_at', to);
    const { data, error } = await query;
    if (error) throw error;

    type FuelRow = {
        station_id: string | null;
        liters: number | null;
        total_cost: number | null;
        workflow_status: string;
        fuel_stations: { name?: string | null } | null;
        vehicles: { department_id?: string | null } | null;
    };
    let list = (data ?? []) as unknown as FuelRow[];
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
            if (row.workflow_status === 'validado') current.validated += Number(row.total_cost ?? 0);
            if (row.workflow_status === 'concluido') current.pending += Number(row.total_cost ?? 0);
        }
        grouped.set(row.station_id, current);
    }

    const rows = [...grouped.values()]
        .sort((a, b) => b.presented - a.presented)
        .map((row) => ({
            station: row.station,
            fuelings: row.count,
            liters: Number(row.liters.toFixed(2)),
            presented: Number(row.presented.toFixed(2)),
            validated: Number(row.validated.toFixed(2)),
            pending: Number(row.pending.toFixed(2)),
            rejected: row.rejected,
        }));
    const total = rows.reduce((sum, row) => ({
        fuelings: sum.fuelings + row.fuelings,
        liters: sum.liters + row.liters,
        validated: sum.validated + row.validated,
    }), { fuelings: 0, liters: 0, validated: 0 });

    return {
        kpis: [
            { label: 'Postos com movimento', value: NUM(rows.length) },
            { label: 'Abastecimentos', value: NUM(total.fuelings) },
            { label: 'Litros apresentados', value: `${NUM(total.liters, 0)} L` },
            { label: 'Valor validado', value: BRL(total.validated) },
        ],
        columns: [
            { key: 'station', label: 'Posto' },
            { key: 'fuelings', label: 'Registros', align: 'right' },
            { key: 'liters', label: 'Litros', align: 'right' },
            { key: 'presented', label: 'Apresentado (R$)', align: 'right' },
            { key: 'validated', label: 'Validado (R$)', align: 'right' },
            { key: 'pending', label: 'Pendente (R$)', align: 'right' },
            { key: 'rejected', label: 'Rejeitados', align: 'right' },
        ],
        rows,
    };
}

async function maintenanceByShop(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let query = supabase
        .from('service_orders')
        .select('repair_shop_id, budget, cost, operational_status, financial_status, created_at, repair_shops(name), vehicles(department_id)')
        .not('repair_shop_id', 'is', null);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    const { data, error } = await query;
    if (error) throw error;

    type OrderRow = {
        repair_shop_id: string | null;
        budget: number | null;
        cost: number | null;
        operational_status: string;
        financial_status: string;
        repair_shops: { name?: string | null } | null;
        vehicles: { department_id?: string | null } | null;
    };
    let list = (data ?? []) as unknown as OrderRow[];
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
        current.cost += Number(row.cost ?? 0);
        if (['at_shop', 'awaiting_quote_approval', 'in_progress', 'ready'].includes(row.operational_status)) {
            current.execution += 1;
        }
        if (!['not_started', 'paid'].includes(row.financial_status)) current.openFinance += 1;
        if (row.financial_status === 'paid') current.paid += 1;
        grouped.set(row.repair_shop_id, current);
    }

    const rows = [...grouped.values()]
        .sort((a, b) => b.budget - a.budget)
        .map((row) => ({
            shop: row.shop,
            orders: row.orders,
            budget: Number(row.budget.toFixed(2)),
            cost: Number(row.cost.toFixed(2)),
            execution: row.execution,
            openFinance: row.openFinance,
            paid: row.paid,
        }));
    const totals = rows.reduce((sum, row) => ({
        orders: sum.orders + row.orders,
        budget: sum.budget + row.budget,
        cost: sum.cost + row.cost,
        openFinance: sum.openFinance + row.openFinance,
    }), { orders: 0, budget: 0, cost: 0, openFinance: 0 });

    return {
        kpis: [
            { label: 'Oficinas com movimento', value: NUM(rows.length) },
            { label: 'Ordens de serviço', value: NUM(totals.orders) },
            { label: 'Orçado', value: BRL(totals.budget) },
            { label: 'Processos financeiros abertos', value: NUM(totals.openFinance) },
        ],
        columns: [
            { key: 'shop', label: 'Oficina' },
            { key: 'orders', label: 'OS', align: 'right' },
            { key: 'budget', label: 'Orçado (R$)', align: 'right' },
            { key: 'cost', label: 'Custo final (R$)', align: 'right' },
            { key: 'execution', label: 'Em execução', align: 'right' },
            { key: 'openFinance', label: 'Financeiro aberto', align: 'right' },
            { key: 'paid', label: 'Pagas', align: 'right' },
        ],
        rows,
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
    const { data, error } = await supabase.from('departments').select('id, name').order('name');
    if (error) throw error;
    return [
        { value: '', label: 'Todas as secretarias' },
        ...(data ?? []).map((d) => ({ value: d.id, label: d.name })),
    ];
}

export { TRIP_STATUS_LABEL };
