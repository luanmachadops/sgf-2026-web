import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const uid = "00000000-0000-4000-8000-000000000001",
  sid = "00000000-0000-4000-8000-000000000002",
  tid = "00000000-0000-4000-8000-000000000003";
test("sessões, módulos, RPC e arquivos", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator;
 create schema auth;create schema storage;create schema sgf_private;grant usage on schema sgf_private to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now(),not_after timestamptz);
 create table public.tenants(id uuid primary key,status text);
 create table public.profiles(id uuid primary key,tenant_id uuid,role text,driver_status text,access_blocked boolean default false,department_id uuid,allowed_modules text[]);
 create table public.fuelings(id int primary key,total_cost numeric);
 create table storage.objects(id int primary key,name text);
 insert into tenants values('${tid}','active');insert into profiles values('${uid}','${tid}','admin','ativo',false,null,array['refuelings']);
 insert into auth.sessions values('${sid}','${uid}',now()-interval '1 hour',null);
 insert into fuelings values(1,100);insert into storage.objects values(1,'privado');
 grant usage on schema public,storage,auth to authenticated;
 grant select,update on public.profiles,public.tenants,public.fuelings,storage.objects to authenticated;
 create policy legacy_read on public.fuelings for all to authenticated using(true) with check(true);
 create policy legacy_objects on storage.objects for all to authenticated using(true) with check(true);
 create policy legacy_profile on public.profiles for all to authenticated using(true) with check(true);
 create policy legacy_tenant on public.tenants for all to authenticated using(true) with check(true);
 create function public.manager_review_fueling() returns integer language sql security definer as $$select count(*)::int from public.fuelings$$;
 create function public.get_station_history(p_limit integer default 2) returns table(id integer) language sql security definer as $$select id from public.fuelings limit p_limit$$;
 create function public.manager_review_fueling(p_id integer) returns void language sql security definer as $$update public.fuelings set total_cost=total_cost where id=p_id$$;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260909113403_active_sessions_and_legacy_access.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const login = async (
    claims = { role: "authenticated", sub: uid, session_id: sid },
  ) => {
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify(claims),
    ]);
  };
  async function scenario(name, fn) {
    await t.test(name, async () => {
      await db.exec("begin");
      try {
        await login();
        await fn();
      } finally {
        await db.exec("rollback");
      }
    });
  }
  const gate = async (path = "rpc/manager_review_fueling") => {
    await db.query("select set_config('request.path',$1,false)", [path]);
    await db.exec(
      "select set_config('request.method','POST',false);select sgf_private.check_api_access()",
    );
  };
  await scenario("sessão válida preserva RLS e RPC", async () => {
    await db.exec("set local role authenticated");
    assert.equal((await db.query("select * from fuelings")).rows.length, 1);
    await gate();
    assert.equal(
      (await db.query("select manager_review_fueling() count")).rows[0].count,
      1,
    );
  });
  await scenario("wrappers preservam retorno tabular, padrão, sobrecarga e void", async () => {
    await db.exec("set local role authenticated");
    assert.deepEqual((await db.query("select * from get_station_history()")).rows, [{id: 1}]);
    assert.equal((await db.query("select * from get_station_history(0)")).rows.length, 0);
    await db.query("select manager_review_fueling(1)");
  });
  await scenario("bloqueado não lê nem executa RPC", async () => {
    await db.exec(
      "update profiles set access_blocked=true;set local role authenticated",
    );
    assert.equal((await db.query("select * from fuelings")).rows.length, 0);
    await assert.rejects(gate(), /revogada/);
  });
  await scenario("RPC definer é protegida mesmo sem pre-request", async () => {
    await db.exec(
      "update profiles set access_blocked=true;set local role authenticated",
    );
    await assert.rejects(
      db.query("select manager_review_fueling()"),
      /revogada/,
    );
  });
  await scenario("implementação original da RPC não é pública", async () => {
    await db.exec("set local role authenticated");
    await assert.rejects(
      db.query("select sgf_private.rpc_original__manager_review_fueling()"),
      /permission denied/,
    );
  });
  await scenario("bloqueado não lê arquivos", async () => {
    await db.exec(
      "update profiles set access_blocked=true;set local role authenticated",
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
  });
  await scenario("desbloqueio não reativa token antigo", async () => {
    await db.exec(
      "update profiles set access_blocked=true;update profiles set access_blocked=false",
    );
    await assert.rejects(gate(), /revogada/);
  });
  await scenario("novo login após desbloqueio funciona", async () => {
    await db.exec(
      "update profiles set access_blocked=true;update profiles set access_blocked=false;update auth.sessions set created_at=clock_timestamp()+interval '1 second'",
    );
    await gate();
  });
  await scenario("reativação da prefeitura exige novo login", async () => {
    await db.exec(
      "update tenants set status='suspended';update tenants set status='active'",
    );
    await assert.rejects(gate(), /revogada/);
  });
  await scenario("sessão expirada é recusada", async () => {
    await db.exec(
      "update auth.sessions set not_after=now()-interval '1 minute'",
    );
    await assert.rejects(gate(), /revogada/);
  });
  await scenario("logout invalida token", async () => {
    await db.exec("delete from auth.sessions");
    await assert.rejects(gate(), /revogada/);
  });
  await scenario("sessão de outro usuário é recusada", async () => {
    await db.exec(`update auth.sessions set user_id='${tid}'`);
    await assert.rejects(gate(), /revogada/);
  });
  await scenario("JWT sem sessão é recusado", async () => {
    await login({ role: "authenticated", sub: uid });
    await assert.rejects(gate(), /revogada/);
  });
  await scenario("módulo é exigido em RLS e RPC", async () => {
    await db.exec(
      "update profiles set allowed_modules=array['fleet'];update auth.sessions set created_at=clock_timestamp()+interval '1 second';set local role authenticated",
    );
    assert.equal((await db.query("select * from fuelings")).rows.length, 0);
    await assert.rejects(gate(), /Módulo não autorizado/);
  });
  await scenario("cliente não remove revogação", async () => {
    await assert.rejects(
      db.exec("update profiles set session_revoked_at=now()"),
      /controlada pelo sistema/,
    );
  });
  await scenario("backend também recusa sessão bloqueada", async () => {
    await db.exec(
      "update profiles set access_blocked=true;set local role service_role",
    );
    await assert.rejects(
      db.query("select assert_server_session($1,$2)", [uid, sid]),
      /revogada/,
    );
  });
  await scenario("cliente não consulta sessão de terceiros", async () => {
    await db.exec("set local role authenticated");
    await assert.rejects(
      db.query("select assert_server_session($1,$2)", [uid, sid]),
      /permission denied/,
    );
  });
  await scenario("branding anônimo continua permitido", async () => {
    await login({ role: "anon" });
    await db.exec("set local role anon");
    await gate("rpc/get_tenant_branding");
  });
  await scenario("serviço interno não exige sessão de pessoa", async () => {
    await login({ role: "service_role" });
    await db.exec("set local role service_role");
    await gate();
  });
  await db.close();
});
