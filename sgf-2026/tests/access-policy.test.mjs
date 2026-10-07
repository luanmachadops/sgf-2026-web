import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateTempPassword,
  assertStrongPassword,
} from "../web/api/_lib/password-policy.ts";
import { assertManagedTarget } from "../web/api/_lib/access-policy.ts";

test("todas as senhas provisórias respeitam a política e não se repetem", () => {
  const values = new Set();
  for (let i = 0; i < 1000; i++) {
    const password = generateTempPassword();
    assertStrongPassword(password);
    values.add(password);
  }
  assert.equal(values.size, 1000);
});
test("somente administrador e superadmin gerenciam acessos", () => {
  for (const actor of ["gestor", "secretario", "motorista", "posto", "oficina"]) {
    for (const role of ["admin", "gestor", "secretario", "motorista", "posto", "oficina"]) {
      assert.throws(
        () => assertManagedTarget({ id: "a", role: actor }, { id: "b", role }),
        { status: 403 },
      );
    }
  }
  for (const actor of ["admin", "superadmin"]) {
    for (const role of ["admin", "gestor", "secretario", "motorista", "posto", "oficina"]) {
      assert.doesNotThrow(() =>
        assertManagedTarget({ id: "a", role: actor }, { id: "b", role }),
      );
    }
  }
});
test("admin municipal não altera superadministrador", () => {
  assert.throws(
    () =>
      assertManagedTarget(
        { id: "a", role: "admin" },
        { id: "b", role: "superadmin" },
      ),
    { status: 403 },
  );
});
