import { test } from "node:test";
import assert from "node:assert/strict";
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

async function setup(withSessions = false) {
  const db = new PGlite();
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

await test("PostgreSQL: cotas e fronteiras de acesso", async (t) => {
  const db = await setup();
  async function scenario(name, fn) {
    await t.test(name, async () => {
      await db.exec("begin");
      try {
        await fn();
      } finally {
        await db.exec("rollback");
      }
    });
  }
  await scenario("referências TCE-PR são preservadas e auditadas", async () => {
    const reporting = {
      idPessoa: "0000123",
      nrLicitacao: "024",
      nrAnoLicitacao: String(year),
      dotacoes: { [department]: "0".repeat(28) },
    };
    const cid = await save(db, { ...basePayload(), reporting });
    const result = await db.query(
      "select reporting from public.budget_contracts where id=$1",
      [cid],
    );
    assert.deepEqual(result.rows[0].reporting, reporting);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.budget_events where event_type='reporting_references'",
        )
      ).rows[0].n,
      1,
    );
  });
  await scenario(
    "dotação SIM-AM incompleta impede cadastro parcial",
    async () => {
      await assert.rejects(
        save(db, {
          ...basePayload(),
          reporting: { dotacoes: { [department]: "339030" } },
        }),
        /28 dígitos/,
      );
    },
  );
  await scenario(
    "cliente não contorna validação SIM-AM pelo núcleo privado",
    async () => {
      await db.exec("set local role authenticated");
      await assert.rejects(
        db.query("select sgf_private.save_department_budget_core($1)", [
          basePayload(),
        ]),
        /permission denied/,
      );
    },
  );
  await scenario(
    "recusa soma de cotas acima do contrato sem criar configuração parcial",
    async () => {
      await assert.rejects(
        save(db, { ...basePayload(), total_limit: 999 }),
        /soma das cotas/,
      );
    },
  );
  await scenario("fornecedor de outra prefeitura é recusado", async () => {
    await assert.rejects(
      save(db, { ...basePayload(), partner_ids: [id(22)] }),
      /fora da prefeitura/,
    );
  });
  await scenario(
    "reserva, realização e repetição não duplicam o gasto",
    async () => {
      await save(db);
      await fueling(db);
      assert.equal((await balance(db))[0].reserved, "400.00");
      await db.query(
        `update public.fuelings set workflow_status='concluido',total_cost=300,filled_at=now() where id=$1`,
        [id(30)],
      );
      await db.query(
        `update public.fuelings set workflow_status='validado' where id=$1`,
        [id(30)],
      );
      const e = (await balance(db))[0];
      assert.equal(e.reserved, "0.00");
      assert.equal(e.realized, "300.00");
    },
  );
  await scenario(
    "saldo da secretaria prevalece sobre saldo global e outro fornecedor",
    async () => {
      await save(db, { ...basePayload(), partner_ids: [station, id(7)] });
      await fueling(db, 30, 100);
      await assert.rejects(
        fueling(db, 31, 21, vehicle, id(7)),
        /Saldo insuficiente/,
      );
    },
  );
  await scenario(
    "aumento de autorização passa novamente pelo limite",
    async () => {
      await save(db);
      await fueling(db);
      await assert.rejects(
        db.query("update public.fuelings set max_liters=121 where id=$1", [
          id(30),
        ]),
        /Saldo insuficiente/,
      );
    },
  );
  await scenario(
    "revisão do catálogo não reprecifica reservas existentes",
    async () => {
      await save(db);
      await fueling(db);
      await db.query(
        `update public.fuel_stations set fuel_prices='{"Diesel":10}' where id=$1`,
        [station],
      );
      await db.query("update public.fuelings set max_liters=90 where id=$1", [
        id(30),
      ]);
      assert.equal((await balance(db))[0].reserved, "450.00");
    },
  );
  await scenario(
    "validação de exercício antigo não consome cota atual",
    async () => {
      await db.query(
        `insert into public.fuelings(id,tenant_id,station_id,vehicle_id,workflow_status,total_cost,filled_at,authorized_at,created_at) values($1,$2,$3,$4,'concluido',300,$5,$5,$5)`,
        [id(30), tenant, station, vehicle, `${year - 1}-06-01T12:00:00Z`],
      );
      await save(db);
      await db.query(
        `update public.fuelings set workflow_status='validado' where id=$1`,
        [id(30)],
      );
      assert.equal((await balance(db)).length, 0);
      await assert.rejects(
        db.query("update public.fuelings set total_cost=350 where id=$1", [
          id(30),
        ]),
        /exercício de origem/,
      );
    },
  );
  await scenario("secretaria sem cota não autoriza despesa", async () => {
    const p = basePayload();
    p.allocations = p.allocations.slice(0, 1);
    await save(db, p);
    await assert.rejects(fueling(db, 30, 20, id(8)), /não possui cota/);
  });
  await scenario("cancelamento de reserva libera saldo", async () => {
    await save(db);
    await fueling(db);
    await db.query(
      `update public.fuelings set workflow_status='cancelado',cancelled_at=now() where id=$1`,
      [id(30)],
    );
    assert.equal((await balance(db))[0].reserved, "0.00");
    await fueling(db, 31, 120);
  });
  await scenario(
    "contestação mantém despesa e cancelamento de execução é recusado",
    async () => {
      await save(db);
      await fueling(db);
      await db.query(
        `update public.fuelings set workflow_status='rejeitado_admin',total_cost=300,filled_at=now() where id=$1`,
        [id(30)],
      );
      assert.equal((await balance(db))[0].disputed, "300.00");
      await assert.rejects(
        db.query(
          `update public.fuelings set workflow_status='cancelado' where id=$1`,
          [id(30)],
        ),
        /executada/,
      );
    },
  );
  await scenario(
    "transferir veículo preserva a secretaria original",
    async () => {
      await save(db);
      await fueling(db);
      await db.query(
        "update public.vehicles set department_id=$1 where id=$2",
        [otherDepartment, vehicle],
      );
      await db.query(
        `update public.fuelings set workflow_status='validado',total_cost=300 where id=$1`,
        [id(30)],
      );
      assert.equal((await balance(db))[0].department_id, department);
    },
  );
  await scenario("redução abaixo do comprometido é recusada", async () => {
    const cid = await save(db);
    await fueling(db);
    const p = basePayload();
    p.allocations[0].spending_limit = 399;
    await assert.rejects(
      save(db, { ...p, id: cid, version: 1 }),
      /menor que o valor/,
    );
  });
  await scenario(
    "remanejamento é atômico e revisão obsoleta é recusada",
    async () => {
      const cid = await save(db);
      const p = basePayload();
      p.allocations[0].spending_limit = 500;
      p.allocations[1].spending_limit = 500;
      await save(db, { ...p, id: cid, version: 1 });
      const { rows } = await db.query(
        "select event_type,before_value from public.budget_events where contract_id=$1 order by id",
        [cid],
      );
      assert.equal(rows[1].event_type, "reallocated");
      assert.ok(rows[1].before_value);
      await assert.rejects(
        save(db, { ...p, id: cid, version: 1 }),
        /foi alterado/,
      );
    },
  );
  await scenario("despesas anteriores são conciliadas na criação", async () => {
    await fueling(db);
    await save(db);
    assert.equal((await balance(db))[0].reserved, "400.00");
  });
  await scenario(
    "manutenção reserva na aprovação e realiza no recebimento",
    async () => {
      await save(db, {
        ...basePayload(),
        category: "maintenance",
        partner_ids: [workshop],
      });
      await db.query(
        `insert into public.service_orders(id,tenant_id,repair_shop_id,vehicle_id,operational_status,financial_status,budget) values($1,$2,$3,$4,'awaiting_quote_approval','awaiting_commitment',500)`,
        [id(40), tenant, workshop, vehicle],
      );
      assert.equal((await balance(db))[0].reserved, "500.00");
      await db.query(
        `update public.service_orders set operational_status='received',cost=0 where id=$1`,
        [id(40)],
      );
      assert.equal((await balance(db))[0].realized, "500.00");
    },
  );
  await scenario(
    "operações complementares do posto também consomem a cota",
    async () => {
      await save(db);
      await fueling(db);
      await assert.rejects(
        db.query(
          `insert into public.station_operations(id,tenant_id,station_id,vehicle_id,status,authorized_quantity,unit_price) values($1,$2,$3,$4,'autorizado',41,5)`,
          [id(50), tenant, station, vehicle],
        ),
        /Saldo insuficiente/,
      );
    },
  );
  await scenario("não permite excluir registros com histórico", async () => {
    await save(db);
    await fueling(db);
    await assert.rejects(
      db.query("delete from public.fuelings where id=$1", [id(30)]),
      /não pode ser excluído/,
    );
  });
  await scenario("secretário consulta apenas sua cota", async () => {
    await save(db);
    await db.query(`select set_config('app.uid',$1,false)`, [secretary]);
    await db.exec("set local role authenticated");
    const { rows } = await db.query(
      "select public.get_department_budgets($1) data",
      [year],
    );
    assert.equal(rows[0].data[0].allocations.length, 1);
    assert.equal(rows[0].data[0].allocations[0].department_id, department);
    const raw = await db.query("select * from public.budget_allocations");
    assert.equal(raw.rows.length, 0);
  });
  await scenario(
    "prefeitura distinta não enxerga nem altera cotas",
    async () => {
      const cid = await save(db);
      await db.query(`select set_config('app.uid',$1,false)`, [outsider]);
      await db.exec("set local role authenticated");
      assert.deepEqual(
        (
          await db.query("select public.get_department_budgets($1) data", [
            year,
          ])
        ).rows[0].data,
        [],
      );
      await assert.rejects(
        save(db, { ...basePayload(), id: cid, version: 1 }),
        /não encontrado/,
      );
    },
  );
  await scenario(
    "escrita direta nas cotas é negada até para admin autenticado",
    async () => {
      await save(db);
      await db.exec("set local role authenticated");
      await assert.rejects(
        db.exec("update public.budget_allocations set spending_limit=999999"),
        /permission denied/,
      );
    },
  );
  await scenario("usuário bloqueado não consulta cotas", async () => {
    await save(db);
    await db.query(
      "update public.profiles set access_blocked=true where id=$1",
      [admin],
    );
    await assert.rejects(
      db.query("select public.get_department_budgets($1)", [year]),
      /Sem permissão/,
    );
  });
  await scenario("usuário não altera as próprias abas permitidas", async () => {
    await assert.rejects(
      db.query(
        `update public.profiles set allowed_modules=array['dashboard'] where id=$1`,
        [admin],
      ),
      /Outro administrador/,
    );
  });
  await scenario(
    "signup com tenant forjado em user_metadata é recusado",
    async () => {
      await assert.rejects(
        db.query("insert into auth.users values($1,$2,$3)", [
          id(70),
          {},
          { tenant_id: tenant, full_name: "Forjado" },
        ]),
        /Cadastro permitido apenas/,
      );
    },
  );
  await scenario(
    "criação administrativa usa apenas app_metadata confiável",
    async () => {
      await db.exec(`select set_config('app.uid','',false)`);
      await db.query("insert into auth.users values($1,$2,$3)", [
        id(71),
        { tenant_id: tenant },
        { tenant_id: id(20), full_name: "Criado" },
      ]);
      assert.equal(
        (
          await db.query("select tenant_id from public.profiles where id=$1", [
            id(71),
          ])
        ).rows[0].tenant_id,
        tenant,
      );
    },
  );
  await scenario(
    "anônimo não chama mutações nem helpers privados",
    async () => {
      await db.exec("set local role anon");
      await assert.rejects(
        db.query("select public.save_department_budget($1)", [basePayload()]),
        /permission denied/,
      );
    },
  );
  await db.close();
});

await test("integração das quatro migrations: cota, conferência e revogação", async () => {
  const db = await setup(true);
  try {
    await save(db, { ...basePayload(), reporting: { idPessoa: "0000123" } });
    const result = await db.query("select get_department_budgets($1) data", [
      year,
    ]);
    assert.equal(result.rows[0].data[0].reporting.idPessoa, "0000123");
    await db.query(
      "update public.profiles set access_blocked=true where id=$1",
      [admin],
    );
    await assert.rejects(
      db.query("select get_department_budgets($1)", [year]),
      /revogada/,
    );
  } finally {
    await db.close();
  }
});
