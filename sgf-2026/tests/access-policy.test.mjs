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
test("gestor não altera administradores, gestores, superadmin nem parceiros pela rota genérica", () => {
  for (const role of ["admin", "gestor", "superadmin", "posto", "oficina"]) {
    assert.throws(
      () => assertManagedTarget({ id: "a", role: "gestor" }, { id: "b", role }),
      { status: 403 },
    );
  }
  assert.doesNotThrow(() =>
    assertManagedTarget(
      { id: "a", role: "gestor" },
      { id: "b", role: "motorista" },
    ),
  );
  assert.doesNotThrow(() =>
    assertManagedTarget(
      { id: "a", role: "gestor" },
      { id: "b", role: "secretario" },
    ),
  );
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
