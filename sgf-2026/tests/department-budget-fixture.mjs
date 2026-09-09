import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(10),
  secretary = id(11),
  outsider = id(12),
  tenant = id(1),
  department = id(2),
  otherDepartment = id(3),
  station = id(4),
  workshop = id(5),
  vehicle = id(6);
const year = new Date().getUTCFullYear();
const basePayload = () => ({
  category: "fuel",
  reference: "Pregão 1/2026",
  fiscal_year: year,
  starts_on: `${year}-01-01`,
  ends_on: `${year}-12-31`,
  total_limit: 1000,
  partner_ids: [station],
  reason: "Distribuição inicial conforme ato 001",
  allocations: [
    {
      department_id: department,
      spending_limit: 600,
      appropriation: "3.3.90.30",
      funding_source: "1500",
    },
    {
      department_id: otherDepartment,
      spending_limit: 400,
      appropriation: "3.3.90.30",
      funding_source: "1500",
    },
  ],
});

async function setup(withSessions = false, db = new PGlite()) {
  await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
 create table public.tenants(id uuid primary key,status text);
 create table public.departments(id uuid primary key,tenant_id uuid,name text);
 create table public.profiles(id uuid primary key,tenant_id uuid,role text default 'motorista',full_name text,access_blocked boolean default false,department_id uuid,allowed_modules text[] default array['departments'],constraint profiles_allowed_modules_check check(allowed_modules <@ array['departments','dashboard','budgets']));
 create function public.is_admin() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
 create function public.is_superadmin() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=auth.uid() and role='superadmin')$$;
 create function public.trip_last_activity_at(uuid,timestamptz) returns timestamptz language sql as $$select $2$$;
 create function public.tf_trip_insert_guard() returns trigger language plpgsql as $$begin return new;end$$;
 create function public.create_service_order_from_issue() returns trigger language plpgsql as $$begin return new;end$$;
 create function public.activity_log_ignored_cols() returns text[] language sql as $$select array[]::text[]$$;
 create table auth.users(id uuid primary key,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
 create table public.vehicles(id uuid primary key,tenant_id uuid,department_id uuid,tank_capacity numeric);
 create table public.fuel_stations(id uuid primary key,tenant_id uuid,fuel_prices jsonb);
 create table public.repair_shops(id uuid primary key,tenant_id uuid);
 create table public.fuelings(id uuid primary key,tenant_id uuid,station_id uuid,vehicle_id uuid,workflow_status text,liters numeric,price_per_liter numeric,total_cost numeric,max_liters numeric,fuel_type text,cancelled_at timestamptz,filled_at timestamptz,authorized_at timestamptz default now(),created_at timestamptz default now(),expires_at timestamptz);
 create table public.service_orders(id uuid primary key,tenant_id uuid,repair_shop_id uuid,vehicle_id uuid,operational_status text,financial_status text,budget numeric,cost numeric,received_at timestamptz,approved_at timestamptz,created_at timestamptz default now());
 create table public.station_operations(id uuid primary key,tenant_id uuid,station_id uuid,vehicle_id uuid,department_id uuid,status text,authorized_quantity numeric,unit_price numeric,total_cost numeric,executed_at timestamptz,authorized_at timestamptz default now(),expires_at timestamptz);
 insert into public.tenants values('${tenant}','active'),('${id(20)}','active');
 insert into public.departments values('${department}','${tenant}','Obras'),('${otherDepartment}','${tenant}','Saúde'),('${id(21)}','${id(20)}','Outra prefeitura');
 insert into public.profiles(id,tenant_id,role,full_name,department_id) values('${admin}','${tenant}','admin','Admin',null),('${secretary}','${tenant}','secretario','Secretário','${department}'),('${outsider}','${id(20)}','admin','Outro',null);
 insert into public.fuel_stations values('${station}','${tenant}','{"Diesel":5}'),('${id(7)}','${tenant}','{"Diesel":5}'),('${id(22)}','${id(20)}','{"Diesel":5}');
 insert into public.repair_shops values('${workshop}','${tenant}');
 insert into public.vehicles values('${vehicle}','${tenant}','${department}',100),('${id(8)}','${tenant}','${otherDepartment}',100);
 `);
  if (withSessions) {
    await db.exec(`create role authenticator; create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz,not_after timestamptz);
      alter table public.profiles add column driver_status text default 'ativo';
      insert into auth.sessions values('${id(99)}','${admin}',now(),null);`);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role: "authenticated", sub: admin, session_id: id(99) }),
    ]);
  }
  for (const name of [
    "20260908235823_access_security_and_department_budgets.sql",
    "20260908235909_department_budget_control.sql",
    ...(withSessions
      ? ["20260909113403_active_sessions_and_legacy_access.sql"]
      : []),
    "20260909114100_parana_budget_reconciliation.sql",
  ]) {
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  }
  await db.exec(
    `create trigger auth_profile after insert on auth.users for each row execute function public.handle_new_user();`,
  );
  await db.query(`select set_config('app.uid',$1,false)`, [admin]);
  return db;
}
async function save(db, payload = basePayload()) {
  return (
    await db.query("select public.save_department_budget($1::jsonb) id", [
      JSON.stringify(payload),
    ])
  ).rows[0].id;
}
async function fueling(db, n = 30, max = 80, veh = vehicle, st = station) {
  await db.query(
    `insert into public.fuelings(id,tenant_id,station_id,vehicle_id,workflow_status,max_liters,fuel_type) values($1,$2,$3,$4,'autorizado',$5,'Diesel')`,
    [id(n), tenant, st, veh, max],
  );
}
async function balance(db) {
  return (
    await db.query("select * from public.budget_entries order by source_id")
  ).rows;
}


export { id, admin, secretary, outsider, tenant, department, otherDepartment, station, workshop, vehicle, year, basePayload, setup, save, fueling, balance };
