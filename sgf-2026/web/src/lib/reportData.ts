// Datasets dos relatórios — agora alimentados por dados REAIS do Supabase.
// Cada relatório agrega registros do banco em KPIs de resumo, colunas e linhas
// que abastecem tanto a pré-visualização na tela quanto as exportações (PDF/Excel).

import { procurementApi, type ProcurementContractUsage } from './procurement-api';
import { supabase } from './supabase';
import type { ReportDataset } from './reports/types';
import {
    checklistFailures,
    expirations,
    fuelAnomalies,
    trafficLog,
    vehicleCost,
} from './reports/operationalReports';

export type { ReportChart, ReportColumn, ReportDataset, ReportKpi } from './reports/types';
export { formatReportValue } from './reports/format';

import {
    BRL,
    EMPTY,
    NUM,
    SO_FINANCIAL_STATUS_LABEL,
    SO_OPERATIONAL_STATUS_LABEL,
    SO_STATUS_LABEL,
    TRIP_STATUS_LABEL,
    VEHICLE_STATUS_LABEL,
    dateRange,
    fetchAllRows,
    fmtDate,
    topChartData,
    vehicleLabel,
    withinRange,
    ORIGIN_LABEL,
    PRIORITY_LABEL,
    capitalize,
    daysUntil,
    effectiveFuelingDateFilter,
    expiryStatus,
    groupCount,
    safeUuid,
    startOfToday,
} from './reports/datasetHelpers';
import type { Rel, ReportFilterInput } from './reports/datasetHelpers';

export type { ReportFilterInput } from './reports/datasetHelpers';

// ── Relatórios ───────────────────────────────────────────────────────────────

async function fleetSummary(f?: ReportFilterInput): Promise<ReportDataset> {
    let q = supabase
        .from('vehicles')
        .select(`id, plate, brand, model, year, vehicle_type, fuel_type, renavam, unit_code, insurance_expiry,
            current_odometer, status, department_id, departments(name)`)
        .order('plate', { ascending: true })
        .order('id', { ascending: true });
    if (f?.departmentId) q = q.eq('department_id', f.departmentId);
    const data = await fetchAllRows(q);
    const today = startOfToday();
    const rows = data.map((v) => ({
        plate: v.plate ?? '—',
        unitCode: v.unit_code || '—',
        model: [v.brand, v.model].filter(Boolean).join(' ') || '—',
        year: v.year ? String(v.year) : '—',
        type: v.vehicle_type ? capitalize(v.vehicle_type) : '—',
        fuelType: v.fuel_type ? String(v.fuel_type).toUpperCase() : '—',
        department: (v.departments as { name?: string } | null)?.name ?? '—',
        odometer: Number(v.current_odometer ?? 0),
        insurance: fmtDate(v.insurance_expiry ? `${v.insurance_expiry}T12:00:00` : null),
        renavam: v.renavam || '—',
        status: VEHICLE_STATUS_LABEL[v.status as string] ?? (v.status as string) ?? '—',
    }));
    const depts = new Set(data.map((v) => v.department_id).filter(Boolean));
    const insuranceExpired = data.filter((v) => v.insurance_expiry && daysUntil(v.insurance_expiry, today) < 0).length;
    const statusCounts = Object.entries(VEHICLE_STATUS_LABEL).map(([status, label]) => ({
        label,
        value: data.filter((vehicle) => vehicle.status === status).length,
    }));
    const byDepartment = new Map<string, number>();
    for (const row of rows) byDepartment.set(row.department, (byDepartment.get(row.department) ?? 0) + 1);
    return {
        kpis: [
            { label: 'Total de veículos', value: NUM(rows.length) },
            { label: 'Disponíveis agora', value: NUM(data.filter((v) => v.status === 'liberado').length) },
            { label: 'Em manutenção agora', value: NUM(data.filter((v) => v.status === 'manutencao').length) },
            { label: 'Seguro vencido', value: NUM(insuranceExpired) },
            { label: 'Secretarias', value: NUM(depts.size) },
        ],
        columns: [
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90, priority: 1, anchor: true },
            { key: 'unitCode', label: 'Código interno', filterable: true, minWidth: 110, priority: 3, stackUnder: 'plate' },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 160, stackUnder: 'plate' },
            { key: 'year', label: 'Ano', align: 'right', format: 'text', minWidth: 60 },
            { key: 'type', label: 'Tipo', filterable: true, minWidth: 90, priority: 3 },
            { key: 'fuelType', label: 'Combustível', filterable: true, minWidth: 105 },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180, priority: 1 },
            { key: 'odometer', label: 'Odômetro (km)', align: 'right', format: 'integer', minWidth: 120 },
            { key: 'insurance', label: 'Seguro até', format: 'date', minWidth: 95 },
            { key: 'renavam', label: 'RENAVAM', defaultVisible: false, minWidth: 120, priority: 3 },
            { key: 'status', label: 'Status atual', filterable: true, minWidth: 120, priority: 1 },
        ],
        rows,
        charts: [{
            title: 'Situação atual da frota',
            description: 'Distribuição dos veículos conforme o estado registrado no momento da emissão.',
            type: 'donut',
            valueFormat: 'integer',
            data: statusCounts,
        }, {
            title: 'Veículos por secretaria',
            description: 'Alocação atual da frota.',
            type: 'bar',
            valueFormat: 'integer',
            data: topChartData([...byDepartment].map(([label, value]) => ({ label, value }))),
        }],
        notes: ['Cadastro e situação são a fotografia da frota na data de emissão; o filtro de período não se aplica.'],
    };
}

async function fuelConsumption(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let q = supabase
        .from('fuelings')
        .select(`id, liters, total_cost, price_per_liter, km_per_liter, station, station_id,
            created_at, filled_at, fuel_type, odometer, vehicle_id, workflow_status,
            vehicles(plate, brand, model, department_id, departments(name))`)
        .in('workflow_status', ['validado', 'lancado_direto'])
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
    if (f?.driverId) q = q.eq('driver_id', f.driverId);
    if (f?.vehicleId) q = q.eq('vehicle_id', f.vehicleId);
    const dateFilter = effectiveFuelingDateFilter(from, to);
    let list = await fetchAllRows(dateFilter ? q.or(dateFilter) : q);
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
            { key: 'date', label: 'Data', format: 'date', minWidth: 90, priority: 1, anchor: true },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90, priority: 1, anchor: true },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 150, stackUnder: 'plate' },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'fuelType', label: 'Combustível', filterable: true, minWidth: 105 },
            { key: 'liters', label: 'Litros', align: 'right', format: 'decimal', minWidth: 85, priority: 1, total: 'sum' },
            { key: 'unitPrice', label: 'Preço unitário', align: 'right', format: 'currency', minWidth: 115 },
            { key: 'cost', label: 'Valor total', align: 'right', format: 'currency', minWidth: 115, priority: 1, total: 'sum' },
            { key: 'avg', label: 'Média (km/L)', align: 'right', format: 'decimal', minWidth: 110 },
            { key: 'odometer', label: 'Odômetro', align: 'right', format: 'integer', defaultVisible: false, minWidth: 100, priority: 3 },
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
        .select(`id, created_at, received_at, completed_at, at_shop_at, category, description, status, priority,
            origin, budget, cost, odometer, operational_status, financial_status, commitment_number, nad_number,
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
    const now = Date.now();
    const shopDays = (order: (typeof list)[number]): number | null => {
        if (!order.at_shop_at) return null;
        const start = new Date(order.at_shop_at).getTime();
        const end = new Date(order.completed_at ?? order.received_at ?? now).getTime();
        if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
        return Math.max(0, Math.round((end - start) / 86_400_000));
    };
    const rows = list.map((r) => {
        const days = shopDays(r);
        return {
            openedAt: fmtDate(r.created_at),
            receivedAt: fmtDate(r.received_at),
            model: vehicleLabel(r.vehicles as Rel),
            plate: (r.vehicles as Rel)?.plate ?? '—',
            department: (r.vehicles as { departments?: { name?: string } | null } | null)?.departments?.name ?? '—',
            category: r.category ?? '—',
            description: r.description ?? '—',
            origin: r.origin ? ORIGIN_LABEL[r.origin] ?? capitalize(r.origin) : '—',
            priority: r.priority ? PRIORITY_LABEL[r.priority] ?? capitalize(r.priority) : '—',
            shop: (r.repair_shops as { name?: string } | null)?.name ?? '—',
            days: days ?? '—',
            budget: Number(r.budget ?? 0),
            cost: Number(r.cost ?? 0),
            operationalStatus: SO_OPERATIONAL_STATUS_LABEL[r.operational_status as string]
                ?? SO_STATUS_LABEL[r.status as string]
                ?? String(r.operational_status ?? r.status ?? '—'),
            financialStatus: SO_FINANCIAL_STATUS_LABEL[r.financial_status as string]
                ?? String(r.financial_status ?? '—'),
            commitment: r.commitment_number ?? '—',
            nad: r.nad_number ?? '—',
        };
    });
    const registeredCost = list.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
    const approvedBudget = list.reduce((sum, row) => sum + Number(row.budget ?? 0), 0);
    const measured = list.map(shopDays).filter((value): value is number => value !== null);
    const avgDays = measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null;
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
            { label: 'Média na oficina', value: avgDays === null ? 'Sem medição' : `${NUM(avgDays, 1)} dias` },
        ],
        columns: [
            { key: 'openedAt', label: 'Abertura', format: 'date', minWidth: 90, priority: 1, anchor: true },
            { key: 'receivedAt', label: 'Recebimento', format: 'date', defaultVisible: false, minWidth: 100, priority: 3 },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90, priority: 1, anchor: true },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 150, stackUnder: 'plate' },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180 },
            { key: 'category', label: 'Categoria', filterable: true, minWidth: 120, stackUnder: 'description' },
            { key: 'description', label: 'Descrição', minWidth: 220, priority: 1 },
            { key: 'origin', label: 'Origem', filterable: true, defaultVisible: false, minWidth: 120, priority: 3 },
            { key: 'priority', label: 'Prioridade', filterable: true, minWidth: 95, priority: 3 },
            { key: 'shop', label: 'Oficina', filterable: true, minWidth: 160 },
            { key: 'days', label: 'Dias na oficina', align: 'right', format: 'integer', minWidth: 105 },
            { key: 'budget', label: 'Orçado', align: 'right', format: 'currency', minWidth: 110, total: 'sum' },
            { key: 'cost', label: 'Custo final', align: 'right', format: 'currency', minWidth: 110, priority: 1, total: 'sum' },
            { key: 'operationalStatus', label: 'Situação operacional', filterable: true, minWidth: 145, priority: 1 },
            { key: 'financialStatus', label: 'Situação financeira', filterable: true, minWidth: 145, stackUnder: 'operationalStatus' },
            { key: 'commitment', label: 'Empenho', defaultVisible: false, minWidth: 115, priority: 3 },
            { key: 'nad', label: 'NAD', defaultVisible: false, minWidth: 100, priority: 3, stackUnder: 'commitment' },
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
            'Dias na oficina contam da entrada na oficina até a conclusão (ou recebimento); ordens ainda abertas contam até a emissão.',
            'Custo final registrado não significa, por si só, valor liquidado ou pago; a situação financeira deve ser conferida.',
        ],
    };
}

async function driversActivity(f?: ReportFilterInput): Promise<ReportDataset> {
    let dq = supabase
        .from('profiles')
        .select('id, full_name, cnh_category, cnh_expiry, driver_status, department_id, departments(name)')
        .eq('role', 'motorista')
        .is('archived_at', null)
        .order('full_name', { ascending: true })
        .order('id', { ascending: true });
    if (f?.departmentId) dq = dq.eq('department_id', f.departmentId);
    if (f?.driverId) dq = dq.eq('id', f.driverId);
    const { from, to } = dateRange(f);
    let tq = supabase
        .from('trips')
        .select('id, driver_id, distance_km, start_at')
        .in('status', ['concluida', 'problema'])
        .order('start_at', { ascending: false })
        .order('id', { ascending: true });
    if (from) tq = tq.gte('start_at', from);
    if (to) tq = tq.lte('start_at', to);
    if (f?.driverId) tq = tq.eq('driver_id', f.driverId);
    let iq = supabase
        .from('infractions')
        .select('id, amount, points, occurred_at, indicated_driver_id')
        .not('indicated_driver_id', 'is', null)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: true });
    if (from) iq = iq.gte('occurred_at', from);
    if (to) iq = iq.lte('occurred_at', to);
    if (f?.driverId) iq = iq.eq('indicated_driver_id', f.driverId);
    const [drivers, trips, infractions] = await Promise.all([fetchAllRows(dq), fetchAllRows(tq), fetchAllRows(iq)]);

    const tripStats = new Map<string, { trips: number; km: number }>();
    for (const t of trips) {
        if (!t.driver_id) continue;
        const cur = tripStats.get(t.driver_id) ?? { trips: 0, km: 0 };
        cur.trips += 1;
        cur.km += Number(t.distance_km ?? 0);
        tripStats.set(t.driver_id, cur);
    }
    const infractionStats = new Map<string, { count: number; points: number; amount: number }>();
    for (const item of infractions) {
        if (!item.indicated_driver_id) continue;
        const cur = infractionStats.get(item.indicated_driver_id) ?? { count: 0, points: 0, amount: 0 };
        cur.count += 1;
        cur.points += Number(item.points ?? 0);
        cur.amount += Number(item.amount ?? 0);
        infractionStats.set(item.indicated_driver_id, cur);
    }

    const today = startOfToday();
    let expired = 0;
    let expiring = 0;
    const rows = drivers.map((d) => {
        const st = tripStats.get(d.id) ?? { trips: 0, km: 0 };
        const inf = infractionStats.get(d.id) ?? { count: 0, points: 0, amount: 0 };
        const days = d.cnh_expiry ? daysUntil(d.cnh_expiry, today) : null;
        if (days !== null && days < 0) expired += 1;
        else if (days !== null && days <= 30) expiring += 1;
        return {
            driver: d.full_name ?? '—',
            department: (d.departments as { name?: string } | null)?.name ?? '—',
            cnhCategory: d.cnh_category || '—',
            cnhExpiry: fmtDate(d.cnh_expiry ? `${d.cnh_expiry}T12:00:00` : null),
            cnhStatus: expiryStatus(days),
            trips: st.trips,
            km: Math.round(st.km),
            infractions: inf.count,
            points: inf.points,
            fines: Number(inf.amount.toFixed(2)),
            status: d.driver_status ? capitalize(d.driver_status) : '—',
        };
    });
    return {
        kpis: [
            { label: 'Motoristas', value: NUM(drivers.length) },
            { label: 'CNH vencida', value: NUM(expired) },
            { label: 'CNH vence em 30 dias', value: NUM(expiring) },
            { label: 'Viagens no período', value: NUM(rows.reduce((s, r) => s + r.trips, 0)) },
        ],
        columns: [
            { key: 'driver', label: 'Motorista', filterable: true, minWidth: 170, priority: 1, anchor: true },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180, stackUnder: 'driver' },
            { key: 'cnhCategory', label: 'Categoria CNH', filterable: true, minWidth: 100 },
            { key: 'cnhExpiry', label: 'CNH válida até', format: 'date', minWidth: 105 },
            { key: 'cnhStatus', label: 'Situação da CNH', filterable: true, minWidth: 130, priority: 1 },
            { key: 'trips', label: 'Viagens encerradas', align: 'right', format: 'integer', minWidth: 130, total: 'sum' },
            { key: 'km', label: 'Km encerrados', align: 'right', format: 'integer', minWidth: 110, total: 'sum' },
            { key: 'infractions', label: 'Infrações', align: 'right', format: 'integer', minWidth: 90, total: 'sum' },
            { key: 'points', label: 'Pontos', align: 'right', format: 'integer', minWidth: 80, total: 'sum' },
            { key: 'fines', label: 'Multas', align: 'right', format: 'currency', minWidth: 110, priority: 3, total: 'sum' },
            { key: 'status', label: 'Cadastro', filterable: true, minWidth: 90, priority: 3 },
        ],
        rows,
        charts: [{
            title: 'Quilometragem por motorista',
            description: 'Motoristas com maior distância em viagens encerradas no período.',
            type: 'bar',
            valueFormat: 'integer',
            data: topChartData(rows.map((row) => ({ label: String(row.driver), value: Number(row.km) }))),
        }, {
            title: 'Situação das CNHs',
            description: 'Validade das habilitações na data de emissão.',
            type: 'donut',
            valueFormat: 'integer',
            data: groupCount(rows.map((row) => String(row.cnhStatus).startsWith('Vence em') ? 'Vence em até 90 dias' : String(row.cnhStatus))),
        }],
        notes: [
            'Viagens e quilômetros consideram viagens encerradas, inclusive as encerradas com anomalia.',
            'Infrações, pontos e multas consideram somente infrações com condutor indicado, pela data da infração.',
            'A situação da CNH é calculada na data de emissão; motoristas arquivados não aparecem.',
        ],
    };
}

// Agregação por secretaria (Consolidado por secretaria), feita no Postgres
// (get_report_department_consolidated, SECURITY INVOKER: vale o RLS).
async function departmentAggregates(f?: ReportFilterInput) {
    const { from, to } = dateRange(f);
    const { data, error } = await supabase.rpc('get_report_department_consolidated', {
        p_from: from,
        p_to: to,
        p_department: f?.departmentId,
    });
    if (error) throw error;
    return (data ?? []).map((row) => {
        const fuel = Number(row.fuel ?? 0);
        const maintenanceCost = Number(row.maintenance ?? 0);
        const fines = Number(row.fines ?? 0);
        return {
            name: row.department,
            vehicles: Number(row.vehicles ?? 0),
            available: Number(row.available ?? 0),
            trips: Number(row.trips ?? 0),
            km: Number(row.km ?? 0),
            fuel,
            maintenanceCost,
            fines,
            totalCost: fuel + maintenanceCost + fines,
        };
    });
}

async function departmentConsolidated(f?: ReportFilterInput): Promise<ReportDataset> {
    const agg = await departmentAggregates(f);
    const rows = agg.map((d) => ({
        department: d.name,
        vehicles: d.vehicles,
        availability: d.vehicles > 0 ? (d.available / d.vehicles) * 100 : '—',
        trips: d.trips,
        km: Math.round(d.km),
        fuel: Number(d.fuel.toFixed(2)),
        maintenance: Number(d.maintenanceCost.toFixed(2)),
        fines: Number(d.fines.toFixed(2)),
        total: Number(d.totalCost.toFixed(2)),
        costPerKm: d.km > 0 ? Number((d.totalCost / d.km).toFixed(2)) : '—',
    }));
    const sum = (key: 'fuel' | 'maintenanceCost' | 'fines' | 'totalCost' | 'km') =>
        agg.reduce((s, d) => s + d[key], 0);
    const totalKm = sum('km');
    return {
        kpis: [
            { label: 'Custo total', value: BRL(sum('totalCost')) },
            { label: 'Combustível', value: BRL(sum('fuel')) },
            { label: 'Manutenção', value: BRL(sum('maintenanceCost')) },
            { label: 'Multas', value: BRL(sum('fines')) },
            { label: 'Custo por km', value: totalKm > 0 ? `R$ ${NUM(sum('totalCost') / totalKm, 2)}` : 'Sem km no período' },
        ],
        columns: [
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 180, priority: 1, anchor: true },
            { key: 'vehicles', label: 'Veículos', align: 'right', format: 'integer', minWidth: 85, total: 'sum' },
            { key: 'availability', label: 'Disponíveis na emissão', align: 'right', format: 'percent', minWidth: 140, priority: 3 },
            { key: 'trips', label: 'Viagens', align: 'right', format: 'integer', minWidth: 85, total: 'sum' },
            { key: 'km', label: 'Km rodados', align: 'right', format: 'integer', minWidth: 100, total: 'sum' },
            { key: 'fuel', label: 'Combustível', align: 'right', format: 'currency', minWidth: 120, total: 'sum' },
            { key: 'maintenance', label: 'Manutenção', align: 'right', format: 'currency', minWidth: 120, total: 'sum' },
            { key: 'fines', label: 'Multas', align: 'right', format: 'currency', minWidth: 110, total: 'sum' },
            { key: 'total', label: 'Custo total', align: 'right', format: 'currency', minWidth: 130, priority: 1, total: 'sum' },
            { key: 'costPerKm', label: 'Custo por km', align: 'right', format: 'currency', minWidth: 110, priority: 1 },
        ],
        rows,
        charts: [{
            title: 'Custo total por secretaria',
            description: 'Combustível efetivo, manutenções concluídas e multas no período.',
            type: 'bar',
            valueFormat: 'currency',
            data: topChartData(rows.map((row) => ({ label: String(row.department), value: Number(row.total) }))),
        }, {
            title: 'Quilometragem por secretaria',
            description: 'Km de viagens encerradas no período.',
            type: 'bar',
            valueFormat: 'integer',
            data: topChartData(rows.map((row) => ({ label: String(row.department), value: Number(row.km) }))),
        }],
        notes: [
            'Substitui os antigos relatórios Análise de Custos, Uso por Secretaria e Relatório de Eficiência.',
            'Combustível considera somente abastecimentos efetivos; manutenção, o custo final (ou orçamento, se ausente) das ordens recebidas/concluídas no período; multas, o valor das infrações ocorridas no período.',
            'Veículos e disponibilidade são a situação na emissão; viagens, km e custos obedecem ao período.',
            'Os valores são operacionais e devem ser conciliados com empenhos, notas e pagamentos nos relatórios fiscais.',
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
            ait, code, indication_deadline, due_date,
            vehicles(department_id),
            indicated:profiles!infractions_indicated_driver_id_fkey(full_name),
            suggested:profiles!infractions_suggested_driver_id_fkey(full_name)`)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: true });
    if (from) q = q.gte('occurred_at', from);
    if (to) q = q.lte('occurred_at', to);
    const driverId = safeUuid(f?.driverId);
    if (driverId) q = q.or(`indicated_driver_id.eq.${driverId},suggested_driver_id.eq.${driverId}`);
    let list = await fetchAllRows(q);
    if (f?.departmentId) {
        list = list.filter((r) => (r.vehicles as { department_id?: string } | null)?.department_id === f.departmentId);
    }

    const today = startOfToday();
    const indicationOverdue = (r: (typeof list)[number]) => r.status === 'pendente'
        && Boolean(r.indication_deadline) && daysUntil(String(r.indication_deadline), today) < 0;
    const rows = list.map((r) => ({
        date: fmtDate(r.occurred_at),
        plate: r.plate ?? '—',
        ait: r.ait || '—',
        code: r.code || '—',
        description: r.description ?? '—',
        deadline: r.indication_deadline
            ? `${fmtDate(String(r.indication_deadline).length === 10 ? `${r.indication_deadline}T12:00:00` : r.indication_deadline)}${indicationOverdue(r) ? ' (vencido)' : ''}`
            : '—',
        dueDate: fmtDate(r.due_date ? (String(r.due_date).length === 10 ? `${r.due_date}T12:00:00` : r.due_date) : null),
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
            { label: 'Indicação vencida', value: NUM(list.filter(indicationOverdue).length) },
            { label: 'Valor total', value: BRL(totalAmount) },
            { label: 'Pontos acumulados', value: NUM(totalPoints) },
        ],
        columns: [
            { key: 'date', label: 'Data', format: 'date', minWidth: 90, priority: 1, anchor: true },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90, priority: 1, anchor: true },
            { key: 'ait', label: 'AIT', filterable: true, minWidth: 110, stackUnder: 'plate' },
            { key: 'code', label: 'Código', filterable: true, minWidth: 80, priority: 3, stackUnder: 'description' },
            { key: 'description', label: 'Infração', filterable: true, minWidth: 190, priority: 1 },
            { key: 'location', label: 'Local', filterable: true, minWidth: 170, stackUnder: 'description' },
            { key: 'driver', label: 'Condutor', filterable: true, minWidth: 160 },
            { key: 'amount', label: 'Valor', align: 'right', format: 'currency', minWidth: 105, priority: 1, total: 'sum' },
            { key: 'points', label: 'Pontos', align: 'right', format: 'integer', defaultVisible: false, minWidth: 80, priority: 3, total: 'sum' },
            { key: 'deadline', label: 'Prazo de indicação', minWidth: 120 },
            { key: 'dueDate', label: 'Vencimento', format: 'date', minWidth: 95, priority: 3 },
            { key: 'status', label: 'Situação', filterable: true, minWidth: 110, priority: 1 },
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
    let query = supabase
        .from('fuelings')
        .select('id, station_id, liters, total_cost, workflow_status, created_at, filled_at, fuel_stations(name), vehicles(department_id)')
        .not('station_id', 'is', null)
        .in('workflow_status', ['concluido', 'validado', 'lancado_direto', 'rejeitado_admin'])
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
    if (f?.driverId) query = query.eq('driver_id', f.driverId);

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
            { key: 'station', label: 'Posto', filterable: true, minWidth: 180, priority: 1, anchor: true },
            { key: 'fuelings', label: 'Registros', align: 'right', format: 'integer', minWidth: 90, total: 'sum' },
            { key: 'liters', label: 'Litros', align: 'right', format: 'decimal', minWidth: 90, total: 'sum' },
            { key: 'presented', label: 'Apresentado', align: 'right', format: 'currency', minWidth: 125, total: 'sum' },
            { key: 'validated', label: 'Validado', align: 'right', format: 'currency', minWidth: 115, priority: 1, total: 'sum' },
            { key: 'pending', label: 'Pendente', align: 'right', format: 'currency', minWidth: 115, total: 'sum' },
            { key: 'rejected', label: 'Rejeitados', align: 'right', format: 'integer', minWidth: 95, total: 'sum' },
            { key: 'contractValue', label: 'Contratado', align: 'right', format: 'currency', minWidth: 120, total: 'sum' },
            { key: 'reserved', label: 'Reservado', align: 'right', format: 'currency', minWidth: 110, total: 'sum' },
            { key: 'realized', label: 'Realizado acumulado', align: 'right', format: 'currency', minWidth: 145, total: 'sum' },
            { key: 'disputed', label: 'Em contestação', align: 'right', format: 'currency', defaultVisible: false, minWidth: 125, priority: 3, total: 'sum' },
            { key: 'remaining', label: 'Saldo disponível', align: 'right', format: 'currency', minWidth: 130, priority: 1, total: 'sum' },
            { key: 'consumedPercent', label: '% consumido', align: 'right', format: 'percent', minWidth: 105 },
            { key: 'invoiced', label: 'Faturado', defaultVisible: false, minWidth: 145, priority: 3 },
            { key: 'paid', label: 'Pago', defaultVisible: false, minWidth: 145, priority: 3 },
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
            'Os marcos faturado e pago são controlados no fechamento fiscal mensal por protocolo.',
            'Consulte o relatório Fechamento Fiscal dos Postos para a fotografia congelada, empenho, nota, ateste e pagamento.',
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
            { key: 'shop', label: 'Oficina', filterable: true, minWidth: 180, priority: 1, anchor: true },
            { key: 'orders', label: 'OS', align: 'right', format: 'integer', minWidth: 70, total: 'sum' },
            { key: 'budget', label: 'Orçado', align: 'right', format: 'currency', minWidth: 115, total: 'sum' },
            { key: 'cost', label: 'Custo final', align: 'right', format: 'currency', minWidth: 115, priority: 1, total: 'sum' },
            { key: 'execution', label: 'Em execução', align: 'right', format: 'integer', minWidth: 105, total: 'sum' },
            { key: 'openFinance', label: 'Financeiro aberto', align: 'right', format: 'integer', minWidth: 130, total: 'sum' },
            { key: 'paidOrders', label: 'OS pagas', align: 'right', format: 'integer', defaultVisible: false, minWidth: 85, priority: 3, total: 'sum' },
            { key: 'contractValue', label: 'Contratado', align: 'right', format: 'currency', minWidth: 120, total: 'sum' },
            { key: 'reserved', label: 'Reservado', align: 'right', format: 'currency', minWidth: 110, total: 'sum' },
            { key: 'realized', label: 'Realizado acumulado', align: 'right', format: 'currency', minWidth: 145, total: 'sum' },
            { key: 'invoiced', label: 'Faturado', align: 'right', format: 'currency', minWidth: 110, total: 'sum' },
            { key: 'paid', label: 'Pago', align: 'right', format: 'currency', minWidth: 110, total: 'sum' },
            { key: 'remaining', label: 'Saldo disponível', align: 'right', format: 'currency', minWidth: 130, priority: 1, total: 'sum' },
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
    'traffic-log': trafficLog,
    'vehicle-cost': vehicleCost,
    expirations,
    'fuel-anomalies': fuelAnomalies,
    'checklist-failures': checklistFailures,
    'drivers-activity': driversActivity,
    'department-consolidated': departmentConsolidated,
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

/** Condutores (motoristas) para o filtro por condutor. */
export async function fetchDriverOptions(): Promise<{ value: string; label: string }[]> {
    const data = await fetchAllRows(
        supabase
            .from('profiles')
            .select('id, full_name')
            .eq('role', 'motorista')
            .order('full_name')
            .order('id'),
    );
    return [
        { value: '', label: 'Todos os condutores' },
        ...data.map((driver) => ({ value: driver.id, label: driver.full_name ?? '—' })),
    ];
}

/** Veículos (opcionalmente de uma secretaria) para o filtro por veículo. */
export async function fetchVehicleOptions(
    departmentId?: string,
): Promise<{ value: string; label: string }[]> {
    let query = supabase
        .from('vehicles')
        .select('id, plate, brand, model, unit_code, department_id')
        .order('plate')
        .order('id');
    if (departmentId) query = query.eq('department_id', departmentId);
    const data = await fetchAllRows(query);
    return [
        { value: '', label: departmentId ? 'Todos os veículos da secretaria' : 'Todos os veículos' },
        ...data.map((vehicle) => ({
            value: vehicle.id,
            label: [vehicle.plate ?? vehicle.unit_code, [vehicle.brand, vehicle.model].filter(Boolean).join(' ')]
                .filter(Boolean)
                .join(' — '),
        })),
    ];
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
