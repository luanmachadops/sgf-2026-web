// Relatórios operacionais e de controle interno (F4 do PLANO-RELATORIOS.md):
// boletim de tráfego, custo por veículo, vencimentos, abastecimentos com
// anomalia e checklists reprovados. Tudo via client Supabase (RLS por tenant).

import { supabase } from '../supabase';
import {
    BRL,
    NUM,
    TRIP_STATUS_LABEL,
    capitalize,
    dateRange,
    daysUntil,
    effectiveFuelingDateFilter,
    expiryStatus,
    fetchAllRows,
    fmtDate,
    groupCount,
    startOfToday,
    topChartData,
    vehicleLabel,
    withinRange,
    type Rel,
    type ReportFilterInput,
} from './datasetHelpers';
import type { ReportDataset } from './types';
import { departmentBudgetApi } from '../department-budget-api';

type VehicleRel = {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    department_id?: string | null;
    tank_capacity?: number | null;
    departments?: { name?: string | null } | null;
} | null;

const deptName = (vehicle: VehicleRel) => vehicle?.departments?.name ?? '—';
const sameDept = (vehicle: VehicleRel, f?: ReportFilterInput) =>
    !f?.departmentId || vehicle?.department_id === f.departmentId;

function fmtDateTime(iso?: string | null): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

const PURPOSE_LABEL: Record<string, string> = {
    administrativo: 'Administrativo',
    saude: 'Saúde',
    educacao: 'Educação',
    transporte_escolar: 'Transporte escolar',
    obras_servicos: 'Obras e serviços',
    agricultura: 'Agricultura',
    assistencia_social: 'Assistência social',
    seguranca: 'Segurança',
    outro: 'Outro',
};

function passengerNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object') {
                const record = item as Record<string, unknown>;
                const name = record.name ?? record.nome ?? record.full_name;
                return typeof name === 'string' ? name.trim() : '';
            }
            return '';
        })
        .filter(Boolean);
}

// ── Boletim de tráfego ──────────────────────────────────────────────────────

export async function trafficLog(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let q = supabase
        .from('trips')
        .select(`id, trip_number, start_at, end_at, start_odometer, end_odometer, distance_km, origin, destination,
            purpose, purpose_category, passenger_count, passengers, status, vehicle_id,
            odometer_gap_km, off_hours, is_retroactive,
            vehicles(plate, brand, model, unit_code, department_id, departments(name)),
            profiles!trips_driver_id_fkey(full_name, registration_number, cnh_number),
            trip_stops(seq, description)`)
        .order('start_at', { ascending: true })
        .order('id', { ascending: true });
    if (from) q = q.gte('start_at', from);
    if (to) q = q.lte('start_at', to);
    if (f?.driverId) q = q.eq('driver_id', f.driverId);
    if (f?.vehicleId) q = q.eq('vehicle_id', f.vehicleId);
    const list = (await fetchAllRows(q)).filter((trip) => sameDept(trip.vehicles as VehicleRel, f));

    const rows = list.map((trip) => {
        const vehicle = trip.vehicles as VehicleRel;
        const odometerKm = trip.start_odometer != null && trip.end_odometer != null
            ? Number(trip.end_odometer) - Number(trip.start_odometer)
            : null;
        const distance = odometerKm !== null && odometerKm >= 0 ? odometerKm : Number(trip.distance_km ?? 0);
        const purposeCategory = trip.purpose_category ? PURPOSE_LABEL[trip.purpose_category] ?? capitalize(trip.purpose_category) : '';
        const driver = trip.profiles as { full_name?: string | null; registration_number?: string | null; cnh_number?: string | null } | null;
        const stops = [...((trip.trip_stops ?? []) as { seq: number; description: string | null }[])]
            .sort((a, b) => a.seq - b.seq)
            .map((stop) => (stop.description ?? '').trim())
            .filter(Boolean)
            .join(' → ');
        const names = passengerNames(trip.passengers);
        const flags: string[] = [];
        if (trip.is_retroactive) flags.push('Retroativa');
        if (trip.off_hours) flags.push('Fora do expediente');
        if (Number(trip.odometer_gap_km ?? 0) > 0) flags.push(`Salto de km (+${NUM(Number(trip.odometer_gap_km), 0)} km)`);
        return {
            number: trip.trip_number ? String(trip.trip_number) : '—',
            plate: vehicle?.plate ?? '—',
            prefix: (vehicle as { unit_code?: string | null } | null)?.unit_code || '—',
            model: vehicleLabel(vehicle as Rel),
            department: deptName(vehicle),
            driver: driver?.full_name ?? '—',
            registration: driver?.registration_number || '—',
            cnh: driver?.cnh_number || '—',
            stops: stops || '—',
            passengerNames: names.length > 0 ? names.join('; ') : '—',
            remarks: flags.length > 0 ? flags.join('; ') : '—',
            departure: fmtDateTime(trip.start_at),
            arrival: fmtDateTime(trip.end_at),
            startOdometer: trip.start_odometer == null ? '—' : Number(trip.start_odometer),
            endOdometer: trip.end_odometer == null ? '—' : Number(trip.end_odometer),
            distance: trip.status === 'cancelada' ? 0 : Number(distance.toFixed(1)),
            origin: trip.origin || '—',
            destination: trip.destination || '—',
            purpose: [purposeCategory, trip.purpose].filter(Boolean).join(' — ') || '—',
            passengers: trip.passenger_count ?? '—',
            status: TRIP_STATUS_LABEL[trip.status as string] ?? capitalize(String(trip.status ?? '—')),
        };
    });
    const done = list.filter((trip) => ['concluida', 'problema'].includes(trip.status));
    const totalKm = rows
        .filter((_, index) => ['concluida', 'problema'].includes(list[index].status))
        .reduce((sum, row) => sum + Number(row.distance), 0);
    const vehicles = new Set(list.map((trip) => trip.vehicle_id).filter(Boolean));
    return {
        kpis: [
            { label: 'Viagens encerradas', value: NUM(done.length) },
            { label: 'Km percorridos', value: `${NUM(totalKm, 0)} km` },
            { label: 'Veículos utilizados', value: NUM(vehicles.size) },
            { label: 'Com anomalia', value: NUM(list.filter((trip) => trip.status === 'problema').length) },
            { label: 'Canceladas', value: NUM(list.filter((trip) => trip.status === 'cancelada').length) },
            { label: 'Com ressalva', value: NUM(rows.filter((row) => row.remarks !== '—').length) },
        ],
        columns: [
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90, priority: 1, anchor: true },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 150, stackUnder: 'plate', priority: 3 },
            { key: 'number', label: 'Nº', align: 'right', format: 'text', minWidth: 60, priority: 3 },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 170, priority: 3 },
            { key: 'prefix', label: 'Prefixo', defaultVisible: false, minWidth: 80, priority: 3 },
            { key: 'driver', label: 'Motorista', filterable: true, minWidth: 160, priority: 1 },
            { key: 'registration', label: 'Matrícula', defaultVisible: false, minWidth: 90, priority: 3 },
            { key: 'cnh', label: 'CNH', defaultVisible: false, minWidth: 110, priority: 3 },
            { key: 'departure', label: 'Saída', minWidth: 125, priority: 1 },
            { key: 'arrival', label: 'Chegada', minWidth: 125, stackUnder: 'departure' },
            { key: 'startOdometer', label: 'Km inicial', align: 'right', format: 'integer', minWidth: 95 },
            { key: 'endOdometer', label: 'Km final', align: 'right', format: 'integer', minWidth: 95 },
            { key: 'distance', label: 'Km rodados', align: 'right', format: 'decimal', minWidth: 95, priority: 1, total: 'sum' },
            { key: 'origin', label: 'Origem', filterable: true, minWidth: 150 },
            { key: 'stops', label: 'Paradas', defaultVisible: false, minWidth: 150, priority: 3 },
            { key: 'destination', label: 'Destino', filterable: true, minWidth: 160, priority: 1 },
            { key: 'purpose', label: 'Finalidade', filterable: true, minWidth: 200, priority: 1 },
            { key: 'passengers', label: 'Passageiros', align: 'right', format: 'integer', minWidth: 90, priority: 3 },
            { key: 'passengerNames', label: 'Nomes dos passageiros', defaultVisible: false, minWidth: 180, priority: 3 },
            { key: 'status', label: 'Situação', filterable: true, minWidth: 110 },
            { key: 'remarks', label: 'Ressalvas', filterable: true, minWidth: 150, priority: 3 },
        ],
        rows,
        charts: [{
            title: 'Km por veículo',
            description: 'Veículos com maior quilometragem em viagens encerradas no período.',
            type: 'bar',
            valueFormat: 'integer',
            data: topChartData([...rows.reduce((map, row, index) => {
                if (['concluida', 'problema'].includes(list[index].status)) {
                    map.set(String(row.plate), (map.get(String(row.plate)) ?? 0) + Number(row.distance));
                }
                return map;
            }, new Map<string, number>())].map(([label, value]) => ({ label, value: Math.round(value) }))),
        }, {
            title: 'Situação das viagens',
            description: 'Quantidade de viagens por situação no período.',
            type: 'donut',
            valueFormat: 'integer',
            data: groupCount(rows.map((row) => String(row.status))),
        }],
        notes: [
            'Controle de uso do veículo: cada linha é uma viagem registrada no aplicativo do motorista, em ordem cronológica.',
            'Km rodados vêm da diferença entre odômetro final e inicial; sem os dois, da distância registrada pelo rastreamento.',
            'Viagens canceladas aparecem para transparência, mas não somam quilometragem.',
            'Ressalvas: viagem lançada depois (retroativa), fora do expediente cadastrado ou com salto de odômetro em relação à viagem anterior.',
        ],
    };
}

// ── Custo por veículo ───────────────────────────────────────────────────────

export async function vehicleCost(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    // Agregado no Postgres (get_report_vehicle_cost, SECURITY INVOKER: vale o RLS).
    const { data, error } = await supabase.rpc('get_report_vehicle_cost', {
        p_from: from,
        p_to: to,
        p_department: f?.departmentId,
    });
    if (error) throw error;
    const vehicles = data ?? [];

    const rows = vehicles.map((vehicle) => {
        const km = Number(vehicle.km ?? 0);
        const liters = Number(vehicle.liters ?? 0);
        const fuel = Number(vehicle.fuel ?? 0);
        const maintenance = Number(vehicle.maintenance ?? 0);
        const fines = Number(vehicle.fines ?? 0);
        const trips = Number(vehicle.trips ?? 0);
        const total = fuel + maintenance + fines;
        return {
            plate: vehicle.plate ?? '—',
            model: [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '—',
            department: vehicle.department ?? '—',
            usage: trips === 0 ? 'Sem viagem no período' : 'Em uso',
            trips,
            km: Math.round(km),
            liters: Number(liters.toFixed(2)),
            kmPerLiter: km > 0 && liters > 0 ? Number((km / liters).toFixed(2)) : '—',
            fuel: Number(fuel.toFixed(2)),
            maintenance: Number(maintenance.toFixed(2)),
            fines: Number(fines.toFixed(2)),
            total: Number(total.toFixed(2)),
            costPerKm: km > 0 ? Number((total / km).toFixed(2)) : '—',
        };
    }).sort((a, b) => b.total - a.total);

    const idle = rows.filter((row) => row.trips === 0);
    const totalCost = rows.reduce((sum, row) => sum + row.total, 0);
    const totalKm = rows.reduce((sum, row) => sum + row.km, 0);
    return {
        kpis: [
            { label: 'Custo total', value: BRL(totalCost) },
            { label: 'Km rodados', value: `${NUM(totalKm)} km` },
            { label: 'Custo por km', value: totalKm > 0 ? `R$ ${NUM(totalCost / totalKm, 2)}` : 'Sem km no período' },
            { label: 'Veículos sem viagem', value: `${NUM(idle.length)} de ${NUM(rows.length)}` },
        ],
        columns: [
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90, priority: 1, anchor: true },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 150, stackUnder: 'plate' },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 170 },
            { key: 'usage', label: 'Uso no período', filterable: true, minWidth: 140, priority: 3 },
            { key: 'trips', label: 'Viagens', align: 'right', format: 'integer', minWidth: 80, total: 'sum' },
            { key: 'km', label: 'Km rodados', align: 'right', format: 'integer', minWidth: 95, priority: 1, total: 'sum' },
            { key: 'liters', label: 'Litros', align: 'right', format: 'decimal', minWidth: 90, priority: 3, total: 'sum' },
            { key: 'kmPerLiter', label: 'Km/L', align: 'right', format: 'decimal', minWidth: 75 },
            { key: 'fuel', label: 'Combustível', align: 'right', format: 'currency', minWidth: 115, total: 'sum' },
            { key: 'maintenance', label: 'Manutenção', align: 'right', format: 'currency', minWidth: 115, total: 'sum' },
            { key: 'fines', label: 'Multas', align: 'right', format: 'currency', minWidth: 100, total: 'sum' },
            { key: 'total', label: 'Custo total', align: 'right', format: 'currency', minWidth: 120, priority: 1, total: 'sum' },
            { key: 'costPerKm', label: 'Custo por km', align: 'right', format: 'currency', minWidth: 110, priority: 1 },
        ],
        rows,
        charts: [{
            title: 'Veículos mais caros no período',
            description: 'Combustível, manutenção e multas somados.',
            type: 'bar',
            valueFormat: 'currency',
            data: topChartData(rows.map((row) => ({ label: String(row.plate), value: row.total }))),
        }, {
            title: 'Uso da frota no período',
            description: 'Veículos com e sem viagem encerrada (base para remanejar ou desfazer-se).',
            type: 'donut',
            valueFormat: 'integer',
            data: groupCount(rows.map((row) => String(row.usage))),
        }],
        notes: [
            'Combustível: abastecimentos efetivos; manutenção: custo final (ou orçamento, se ausente) das ordens recebidas/concluídas no período; multas: infrações ocorridas no período.',
            'Km/L usa os km das viagens encerradas e os litros abastecidos no período; abastecimento sem viagem registrada distorce o indicador.',
            '"Sem viagem no período" identifica veículos ociosos — filtre por essa coluna para a lista de ociosos.',
        ],
    };
}

// ── Vencimentos ─────────────────────────────────────────────────────────────

const EXPIRY_WINDOW_DAYS = 90;

export async function expirations(f?: ReportFilterInput): Promise<ReportDataset> {
    let dq = supabase
        .from('profiles')
        .select('id, full_name, cnh_number, cnh_expiry, department_id, departments(name)')
        .eq('role', 'motorista')
        .is('archived_at', null)
        .not('cnh_expiry', 'is', null)
        .order('cnh_expiry', { ascending: true })
        .order('id', { ascending: true });
    if (f?.departmentId) dq = dq.eq('department_id', f.departmentId);
    let vq = supabase
        .from('vehicles')
        .select('id, plate, brand, model, insurance_expiry, department_id, departments(name)')
        .not('insurance_expiry', 'is', null)
        .order('insurance_expiry', { ascending: true })
        .order('id', { ascending: true });
    if (f?.departmentId) vq = vq.eq('department_id', f.departmentId);
    const docQuery = supabase
        .from('vehicle_documents')
        .select('id, title, doc_type, expires_at, vehicles(plate, brand, model, department_id, departments(name))')
        .not('expires_at', 'is', null)
        .order('expires_at', { ascending: true })
        .order('id', { ascending: true });
    const stationQuery = supabase
        .from('fuel_stations')
        .select('id, name, contract_number, contract_end')
        .not('contract_end', 'is', null)
        .order('contract_end', { ascending: true })
        .order('id', { ascending: true });
    const shopQuery = supabase
        .from('repair_shops')
        .select('id, name, contract_number, contract_end')
        .not('contract_end', 'is', null)
        .order('contract_end', { ascending: true })
        .order('id', { ascending: true });
    const [drivers, vehicles, documents, stations, shops] = await Promise.all([
        fetchAllRows(dq), fetchAllRows(vq), fetchAllRows(docQuery),
        // Contratos não pertencem a uma secretaria: somem quando há filtro de secretaria.
        f?.departmentId ? Promise.resolve([]) : fetchAllRows(stationQuery),
        f?.departmentId ? Promise.resolve([]) : fetchAllRows(shopQuery),
    ]);

    const today = startOfToday();
    type Row = { kind: string; item: string; reference: string; department: string; expires: string; days: number; status: string };
    const rows: Row[] = [];
    const push = (kind: string, item: string, reference: string, department: string, date: string | null) => {
        if (!date) return;
        const days = daysUntil(date, today);
        if (days > EXPIRY_WINDOW_DAYS) return;
        rows.push({
            kind,
            item,
            reference,
            department,
            expires: fmtDate(date.length === 10 ? `${date}T12:00:00` : date),
            days,
            status: expiryStatus(days),
        });
    };
    for (const driver of drivers) {
        push('CNH', driver.full_name ?? '—', driver.cnh_number ? `CNH ${driver.cnh_number}` : '—',
            (driver.departments as { name?: string } | null)?.name ?? '—', driver.cnh_expiry);
    }
    for (const vehicle of vehicles) {
        push('Seguro do veículo', vehicle.plate ?? '—', [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '—',
            (vehicle.departments as { name?: string } | null)?.name ?? '—', vehicle.insurance_expiry);
    }
    for (const doc of documents) {
        const vehicle = doc.vehicles as VehicleRel;
        if (!sameDept(vehicle, f)) continue;
        push('Documento do veículo', vehicle?.plate ?? '—', doc.title || capitalize(doc.doc_type ?? 'documento'),
            deptName(vehicle), doc.expires_at);
    }
    for (const station of stations) {
        push('Contrato de posto', station.name ?? '—', station.contract_number ? `Contrato ${station.contract_number}` : '—', '—', station.contract_end);
    }
    for (const shop of shops) {
        push('Contrato de oficina', shop.name ?? '—', shop.contract_number ? `Contrato ${shop.contract_number}` : '—', '—', shop.contract_end);
    }
    rows.sort((a, b) => a.days - b.days);
    const expired = rows.filter((row) => row.days < 0).length;
    const within30 = rows.filter((row) => row.days >= 0 && row.days <= 30).length;
    return {
        kpis: [
            { label: 'Vencidos', value: NUM(expired) },
            { label: 'Vencem em 30 dias', value: NUM(within30) },
            { label: 'Vencem em 31 a 90 dias', value: NUM(rows.length - expired - within30) },
            { label: 'Itens monitorados', value: NUM(drivers.length + vehicles.length + documents.length + stations.length + shops.length) },
        ],
        columns: [
            { key: 'days', label: 'Dias', align: 'right', format: 'integer', minWidth: 70, priority: 1, anchor: true },
            { key: 'expires', label: 'Vencimento', format: 'date', minWidth: 95, priority: 1 },
            { key: 'kind', label: 'Tipo', filterable: true, minWidth: 140, priority: 1 },
            { key: 'item', label: 'Motorista / veículo / fornecedor', filterable: true, minWidth: 190, priority: 1 },
            { key: 'reference', label: 'Referência', minWidth: 160, stackUnder: 'item' },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 170 },
            { key: 'status', label: 'Situação', filterable: true, minWidth: 140, priority: 1 },
        ],
        rows,
        charts: [{
            title: 'Vencimentos por tipo',
            description: `Itens vencidos ou que vencem em até ${EXPIRY_WINDOW_DAYS} dias.`,
            type: 'bar',
            valueFormat: 'integer',
            data: groupCount(rows.map((row) => row.kind)),
        }],
        notes: [
            `Lista o que já venceu e o que vence nos próximos ${EXPIRY_WINDOW_DAYS} dias, contados da data de emissão; o filtro de período não se aplica.`,
            'Dias negativos indicam há quantos dias o item está vencido.',
            'Contratos de postos e oficinas não pertencem a uma secretaria e não aparecem quando o relatório é filtrado por secretaria.',
        ],
    };
}

// ── Abastecimentos com anomalia ─────────────────────────────────────────────

const FUELING_STATUS_LABEL: Record<string, string> = {
    concluido: 'Aguardando validação',
    validado: 'Validado',
    lancado_direto: 'Lançado direto',
};

/** Desvio de consumo (km/L) a partir do qual o abastecimento é sinalizado. */
const CONSUMPTION_DEVIATION = 0.3;

export async function fuelAnomalies(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let q = supabase
        .from('fuelings')
        .select(`id, filled_at, created_at, liters, total_cost, km_per_liter, has_anomaly, anomaly_type,
            workflow_status, station, vehicle_id,
            vehicles(plate, brand, model, tank_capacity, department_id, departments(name)),
            profiles!fuelings_driver_id_fkey(full_name)`)
        // Concluídos (aguardando validação) e efetivos; rejeitados e só autorizados ficam fora.
        .in('workflow_status', ['concluido', 'validado', 'lancado_direto'])
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
    const dateFilter = effectiveFuelingDateFilter(from, to);
    if (dateFilter) q = q.or(dateFilter);
    const list = (await fetchAllRows(q))
        .filter((item) => withinRange(item.filled_at ?? item.created_at, from, to))
        .filter((item) => sameDept(item.vehicles as VehicleRel, f));

    // Consumo típico de cada veículo = mediana dos km/L válidos no período.
    const byVehicle = new Map<string, number[]>();
    for (const item of list) {
        const value = Number(item.km_per_liter ?? 0);
        if (item.vehicle_id && value > 0) byVehicle.set(item.vehicle_id, [...(byVehicle.get(item.vehicle_id) ?? []), value]);
    }
    const median = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const typical = new Map([...byVehicle].filter(([, values]) => values.length >= 3).map(([id, values]) => [id, median(values)]));

    const rows = list.flatMap((item) => {
        const vehicle = item.vehicles as VehicleRel;
        const reasons: string[] = [];
        if (item.has_anomaly) reasons.push(item.anomaly_type || 'Sinalizado no registro');
        const liters = Number(item.liters ?? 0);
        const tank = Number(vehicle?.tank_capacity ?? 0);
        if (tank > 0 && liters > tank && !(item.anomaly_type ?? '').toLowerCase().includes('capacidade')) {
            reasons.push('Litros acima da capacidade do tanque');
        }
        const kmPerLiter = Number(item.km_per_liter ?? 0);
        const reference = item.vehicle_id ? typical.get(item.vehicle_id) : undefined;
        let deviation: number | string = '—';
        if (reference && kmPerLiter > 0) {
            deviation = ((kmPerLiter - reference) / reference) * 100;
            if (Math.abs(deviation) >= CONSUMPTION_DEVIATION * 100) {
                reasons.push(deviation < 0 ? 'Consumo muito abaixo do habitual' : 'Consumo muito acima do habitual');
            }
        }
        if (reasons.length === 0) return [];
        return [{
            date: fmtDate(item.filled_at ?? item.created_at),
            plate: vehicle?.plate ?? '—',
            model: vehicleLabel(vehicle as Rel),
            department: deptName(vehicle),
            driver: (item.profiles as { full_name?: string } | null)?.full_name ?? '—',
            liters,
            tank: tank > 0 ? tank : '—',
            kmPerLiter: kmPerLiter > 0 ? kmPerLiter : '—',
            typical: reference ? Number(reference.toFixed(2)) : '—',
            deviation: typeof deviation === 'number' ? Number(deviation.toFixed(1)) : deviation,
            cost: Number(item.total_cost ?? 0),
            station: item.station || '—',
            reasons: reasons.join('; '),
            status: FUELING_STATUS_LABEL[item.workflow_status as string] ?? capitalize(String(item.workflow_status ?? '—')),
        }];
    });
    return {
        kpis: [
            { label: 'Abastecimentos analisados', value: NUM(list.length) },
            { label: 'Com anomalia', value: NUM(rows.length) },
            { label: 'Valor envolvido', value: BRL(rows.reduce((sum, row) => sum + row.cost, 0)) },
            { label: 'Veículos envolvidos', value: NUM(new Set(rows.map((row) => row.plate)).size) },
        ],
        columns: [
            { key: 'date', label: 'Data', format: 'date', minWidth: 90, priority: 1, anchor: true },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90, priority: 1, anchor: true },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 150, stackUnder: 'plate' },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 170, priority: 3 },
            { key: 'driver', label: 'Motorista', filterable: true, minWidth: 150 },
            { key: 'liters', label: 'Litros', align: 'right', format: 'decimal', minWidth: 80, total: 'sum' },
            { key: 'tank', label: 'Tanque (L)', align: 'right', format: 'decimal', minWidth: 85 },
            { key: 'kmPerLiter', label: 'Km/L', align: 'right', format: 'decimal', minWidth: 70 },
            { key: 'typical', label: 'Km/L habitual', align: 'right', format: 'decimal', minWidth: 95 },
            { key: 'deviation', label: 'Desvio', align: 'right', format: 'percent', minWidth: 75 },
            { key: 'cost', label: 'Valor', align: 'right', format: 'currency', minWidth: 105, total: 'sum' },
            { key: 'station', label: 'Posto', filterable: true, minWidth: 150, priority: 3 },
            { key: 'reasons', label: 'Motivo', filterable: true, minWidth: 220, priority: 1 },
            { key: 'status', label: 'Situação', filterable: true, minWidth: 110, priority: 3 },
        ],
        rows,
        charts: [{
            title: 'Anomalias por motivo',
            type: 'bar',
            valueFormat: 'integer',
            data: groupCount(rows.flatMap((row) => String(row.reasons).split('; '))),
        }],
        notes: [
            'Entram: abastecimentos sinalizados no registro, litros acima da capacidade do tanque e consumo (km/L) com desvio de 30% ou mais em relação à mediana do próprio veículo no período.',
            'O consumo habitual só é calculado para veículos com pelo menos 3 medições no período.',
            'Anomalia é indício para conferência, não conclusão de irregularidade.',
        ],
    };
}

// ── Checklists reprovados ───────────────────────────────────────────────────

export async function checklistFailures(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let cq = supabase
        .from('checklists')
        .select(`id, created_at, vehicle_id,
            vehicles(plate, brand, model, department_id, departments(name)),
            profiles!checklists_driver_id_fkey(full_name),
            checklist_items(item_key, label, state, damage_description)`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
    if (from) cq = cq.gte('created_at', from);
    if (to) cq = cq.lte('created_at', to);
    const checklists = (await fetchAllRows(cq)).filter((item) => sameDept(item.vehicles as VehicleRel, f));
    const checklistIds = checklists.map((item) => item.id);
    const orders = checklistIds.length
        ? await fetchAllRows(supabase
            .from('service_orders')
            .select('id, checklist_id, operational_status, status')
            .in('checklist_id', checklistIds)
            .order('id'))
        : [];
    const orderByChecklist = new Map(orders.map((order) => [order.checklist_id, order]));

    type Item = { item_key: string; label: string | null; state: string; damage_description: string | null };
    const failures = checklists.flatMap((checklist) =>
        ((checklist.checklist_items ?? []) as Item[])
            .filter((item) => item.state === 'atencao')
            .map((item) => ({ checklist, item })));
    const perVehicle = new Map<string, number>();
    for (const { checklist } of failures) {
        if (checklist.vehicle_id) perVehicle.set(checklist.vehicle_id, (perVehicle.get(checklist.vehicle_id) ?? 0) + 1);
    }
    const critical = new Set(['freios', 'pneus', 'luzes']);
    const rows = failures.map(({ checklist, item }) => {
        const vehicle = checklist.vehicles as VehicleRel;
        const order = orderByChecklist.get(checklist.id);
        return {
            date: fmtDate(checklist.created_at),
            plate: vehicle?.plate ?? '—',
            model: vehicleLabel(vehicle as Rel),
            department: deptName(vehicle),
            driver: (checklist.profiles as { full_name?: string } | null)?.full_name ?? '—',
            item: item.label || capitalize(item.item_key),
            critical: critical.has(item.item_key) ? 'Crítico' : 'Comum',
            description: item.damage_description || '—',
            recurrence: checklist.vehicle_id ? perVehicle.get(checklist.vehicle_id) ?? 1 : 1,
            serviceOrder: order ? `Gerada — ${capitalize(String(order.operational_status ?? order.status ?? ''))}` : 'Não gerada',
        };
    });
    return {
        kpis: [
            { label: 'Checklists no período', value: NUM(checklists.length) },
            { label: 'Itens reprovados', value: NUM(rows.length) },
            { label: 'Itens críticos', value: NUM(rows.filter((row) => row.critical === 'Crítico').length) },
            { label: 'Veículos com reincidência', value: NUM([...perVehicle.values()].filter((count) => count > 1).length) },
        ],
        columns: [
            { key: 'date', label: 'Data', format: 'date', minWidth: 90, priority: 1, anchor: true },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90, priority: 1, anchor: true },
            { key: 'model', label: 'Modelo', filterable: true, minWidth: 150, stackUnder: 'plate' },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 170, priority: 3 },
            { key: 'driver', label: 'Motorista', filterable: true, minWidth: 150 },
            { key: 'item', label: 'Item', filterable: true, minWidth: 110, priority: 1 },
            { key: 'critical', label: 'Gravidade', filterable: true, minWidth: 85, stackUnder: 'item' },
            { key: 'description', label: 'Descrição do problema', minWidth: 220, priority: 1 },
            { key: 'recurrence', label: 'Ocorrências do veículo', align: 'right', format: 'integer', minWidth: 120 },
            { key: 'serviceOrder', label: 'Ordem de serviço', filterable: true, minWidth: 150, priority: 1 },
        ],
        rows,
        charts: [{
            title: 'Itens mais reprovados',
            type: 'bar',
            valueFormat: 'integer',
            data: groupCount(rows.map((row) => String(row.item))),
        }, {
            title: 'Veículos com mais reprovações',
            type: 'bar',
            valueFormat: 'integer',
            data: topChartData(groupCount(rows.map((row) => String(row.plate)))),
        }],
        notes: [
            'Itens marcados como "atenção" no checklist pré-viagem do aplicativo do motorista.',
            'Freios, pneus e luzes são críticos: bloqueiam a viagem e geram ordem de serviço automaticamente.',
            'Ocorrências do veículo = total de itens reprovados do mesmo veículo no período (reincidência).',
        ],
    };
}

// ── Extrato por fornecedor ──────────────────────────────────────────────────

/**
 * Cada abastecimento validado e cada OS recebida no período, por fornecedor:
 * a comprovação que a contabilidade usa para conferir a nota fiscal antes de
 * liquidar a despesa (Lei 4.320/64, art. 63).
 */
export async function supplierStatement(f?: ReportFilterInput): Promise<ReportDataset> {
    const { from, to } = dateRange(f);
    let fq = supabase
        .from('fuelings')
        .select(`id, liters, total_cost, fuel_type, odometer, workflow_status, invoice_number, created_at, filled_at, station_id,
            fuel_stations(name), vehicles(plate, brand, model, department_id, departments(name)),
            profiles!fuelings_driver_id_fkey(full_name)`)
        .not('station_id', 'is', null)
        .in('workflow_status', ['validado', 'lancado_direto'])
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
    if (f?.driverId) fq = fq.eq('driver_id', f.driverId);
    if (f?.vehicleId) fq = fq.eq('vehicle_id', f.vehicleId);
    let oq = supabase
        .from('service_orders')
        .select(`id, budget, cost, category, description, received_at, repair_shop_id,
            repair_shops(name), vehicles(plate, brand, model, department_id, departments(name)),
            profiles!service_orders_driver_id_fkey(full_name)`)
        .eq('operational_status', 'received')
        .not('repair_shop_id', 'is', null)
        .order('received_at', { ascending: true })
        .order('id', { ascending: true });
    if (f?.vehicleId) oq = oq.eq('vehicle_id', f.vehicleId);
    if (from) oq = oq.gte('received_at', from);
    if (to) oq = oq.lte('received_at', to);
    const [fuelings, orders] = await Promise.all([
        fetchAllRows(fq),
        f?.driverId ? Promise.resolve([]) : fetchAllRows(oq),
    ]);

    const fuelRows = fuelings
        .filter((row) => withinRange(row.filled_at ?? row.created_at, from, to) && sameDept(row.vehicles as VehicleRel, f))
        .map((row) => {
            const vehicle = row.vehicles as VehicleRel;
            return {
                supplier: (row.fuel_stations as { name?: string } | null)?.name ?? 'Posto não identificado',
                kind: 'Abastecimento',
                date: fmtDateTime(row.filled_at ?? row.created_at),
                department: deptName(vehicle),
                plate: vehicle?.plate ?? '—',
                vehicle: vehicleLabel(vehicle as Rel),
                driver: (row.profiles as { full_name?: string } | null)?.full_name ?? '—',
                detail: `${row.fuel_type ?? 'Combustível'} · ${NUM(Number(row.liters ?? 0), 2)} L${row.odometer ? ` · ${NUM(Number(row.odometer), 0)} km` : ''}`,
                document: row.invoice_number || '—',
                amount: Number(Number(row.total_cost ?? 0).toFixed(2)),
            };
        });
    const orderRows = orders
        .filter((row) => sameDept(row.vehicles as VehicleRel, f))
        .map((row) => {
            const vehicle = row.vehicles as VehicleRel;
            const value = Number(row.cost ?? 0) > 0 ? Number(row.cost) : Number(row.budget ?? 0);
            return {
                supplier: (row.repair_shops as { name?: string } | null)?.name ?? 'Oficina não identificada',
                kind: 'Ordem de serviço',
                date: fmtDateTime(row.received_at),
                department: deptName(vehicle),
                plate: vehicle?.plate ?? '—',
                vehicle: vehicleLabel(vehicle as Rel),
                driver: (row.profiles as { full_name?: string } | null)?.full_name ?? '—',
                detail: [row.category, row.description].filter(Boolean).join(' · ').slice(0, 160) || 'Serviço de manutenção',
                document: '—',
                amount: Number(value.toFixed(2)),
            };
        });
    const rows = [...fuelRows, ...orderRows].sort((a, b) =>
        String(a.supplier).localeCompare(String(b.supplier), 'pt-BR'));
    const totalFuel = fuelRows.reduce((sum, row) => sum + row.amount, 0);
    const totalOrders = orderRows.reduce((sum, row) => sum + row.amount, 0);
    const suppliers = new Set(rows.map((row) => row.supplier));

    return {
        kpis: [
            { label: 'Fornecedores', value: NUM(suppliers.size) },
            { label: 'Abastecimentos validados', value: `${NUM(fuelRows.length)} · ${BRL(totalFuel)}` },
            { label: 'Serviços recebidos', value: `${NUM(orderRows.length)} · ${BRL(totalOrders)}` },
            { label: 'Total do período', value: BRL(totalFuel + totalOrders) },
        ],
        columns: [
            { key: 'supplier', label: 'Fornecedor', filterable: true, minWidth: 170, priority: 1, anchor: true },
            { key: 'kind', label: 'Tipo', filterable: true, minWidth: 120, priority: 3 },
            { key: 'date', label: 'Data', minWidth: 125, priority: 1 },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 150, priority: 1 },
            { key: 'plate', label: 'Placa', filterable: true, minWidth: 90, priority: 1 },
            { key: 'vehicle', label: 'Veículo', minWidth: 150, stackUnder: 'plate', priority: 3 },
            { key: 'driver', label: 'Motorista', filterable: true, minWidth: 150 },
            { key: 'detail', label: 'Detalhe', minWidth: 200, priority: 1 },
            { key: 'document', label: 'Cupom/NF', minWidth: 100, priority: 3 },
            { key: 'amount', label: 'Valor', align: 'right', format: 'currency', minWidth: 110, priority: 1, total: 'sum' },
        ],
        rows,
        charts: [{
            title: 'Valor por fornecedor',
            description: 'Soma dos abastecimentos validados e serviços recebidos no período.',
            type: 'bar',
            valueFormat: 'currency',
            data: topChartData([...rows.reduce((map, row) => map.set(String(row.supplier), (map.get(String(row.supplier)) ?? 0) + Number(row.amount)), new Map<string, number>())]
                .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))),
        }],
        notes: [
            'Comprovação da execução para a liquidação: abastecimentos validados pelo gestor e ordens de serviço com o veículo recebido.',
            'Abastecimentos ainda não validados e OS não recebidas não entram no extrato.',
            'Agrupe por fornecedor para conferir cada nota fiscal; o valor da OS é o custo final ou, sem ele, o orçamento aprovado.',
        ],
    };
}

// ── Consumo por secretaria × empenho ────────────────────────────────────────

/**
 * Saldo do valor empenhado por secretaria em cada licitação (Limites por
 * secretaria), na situação de hoje. O exercício segue a data inicial do filtro.
 */
export async function departmentCommitments(f?: ReportFilterInput): Promise<ReportDataset> {
    const year = f?.dateFrom ? Number(f.dateFrom.slice(0, 4)) : new Date().getFullYear();
    const contracts = await departmentBudgetApi.list(year);
    const category = { fuel: 'Combustível', maintenance: 'Manutenção' } as const;
    const rows = contracts.flatMap((contract) => contract.allocations
        .filter((a) => !f?.departmentId || a.department_id === f.departmentId)
        .map((a) => {
            const used = a.spending_limit - a.available;
            return {
                licitacao: contract.reference,
                category: category[contract.category],
                department: a.department_name,
                commitment: contract.reporting?.empenhos?.[a.department_id] || '—',
                limit: a.spending_limit,
                reserved: a.reserved,
                realized: a.realized,
                available: a.available,
                usage: a.spending_limit > 0 ? Number(((used / a.spending_limit) * 100).toFixed(1)) : 0,
            };
        }));
    const totals = rows.reduce((sum, row) => ({
        limit: sum.limit + row.limit,
        used: sum.used + row.reserved + row.realized,
        available: sum.available + row.available,
    }), { limit: 0, used: 0, available: 0 });
    const attention = rows.filter((row) => row.usage >= 80).length;

    return {
        kpis: [
            { label: 'Valor empenhado', value: BRL(totals.limit) },
            { label: 'Consumido (reservado + realizado)', value: BRL(totals.used) },
            { label: 'Saldo disponível', value: BRL(totals.available) },
            { label: 'Secretarias acima de 80%', value: NUM(attention) },
        ],
        columns: [
            { key: 'licitacao', label: 'Licitação', filterable: true, minWidth: 160, priority: 1, anchor: true },
            { key: 'category', label: 'Tipo', filterable: true, minWidth: 110, priority: 3 },
            { key: 'department', label: 'Secretaria', filterable: true, minWidth: 160, priority: 1 },
            { key: 'commitment', label: 'Empenho(s)', minWidth: 120 },
            { key: 'limit', label: 'Empenhado', align: 'right', format: 'currency', minWidth: 120, priority: 1, total: 'sum' },
            { key: 'reserved', label: 'Reservado', align: 'right', format: 'currency', minWidth: 110, total: 'sum' },
            { key: 'realized', label: 'Realizado', align: 'right', format: 'currency', minWidth: 110, total: 'sum' },
            { key: 'available', label: 'Disponível', align: 'right', format: 'currency', minWidth: 115, priority: 1, total: 'sum' },
            { key: 'usage', label: 'Consumo', align: 'right', format: 'percent', minWidth: 90, priority: 1 },
        ],
        rows,
        charts: [{
            title: 'Consumo do empenho por secretaria',
            description: 'Percentual do valor empenhado já reservado ou realizado; a faixa de atenção começa em 80%.',
            type: 'gauge',
            valueFormat: 'percent',
            data: topChartData(rows.map((row) => ({ label: `${row.department} · ${row.licitacao}`, value: row.usage }))),
        }],
        notes: [
            `Exercício ${year}, situação na data de emissão. O valor empenhado é o informado em Limites por secretaria, conforme a contabilidade.`,
            'Reservado: autorizações e OS aprovadas ainda não concluídas. Realizado: abastecimentos concluídos/validados e OS recebidas.',
            'Acima de 80%, avise a contabilidade sobre reforço de empenho; ao atingir 100%, novas despesas da secretaria são bloqueadas.',
        ],
    };
}
