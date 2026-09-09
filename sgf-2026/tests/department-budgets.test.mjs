import { test } from "node:test";
import assert from "node:assert/strict";

import { id, admin, secretary, outsider, tenant, department, otherDepartment, station, workshop, vehicle, year, basePayload, setup, save, fueling, balance } from "./department-budget-fixture.mjs";

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
