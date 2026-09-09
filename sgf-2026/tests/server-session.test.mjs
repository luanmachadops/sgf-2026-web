import { test } from "node:test";
import assert from "node:assert/strict";
import { assertServerSession } from "../web/api/_lib/session-access.ts";
import { sessionAllowed } from "../supabase/functions/_shared/session-access.ts";
const user = "00000000-0000-4000-8000-000000000001",
  session = "00000000-0000-4000-8000-000000000002";
// Verifying the signature remains auth.getUser's job; these are claim-decoder fixtures.
const token = (claims) =>
  "header." +
  Buffer.from(JSON.stringify(claims)).toString("base64url") +
  ".signature";
test("backend consulta a sessão do JWT já verificado", async () => {
  let args;
  await assertServerSession(
    {
      rpc: async (name, payload) => {
        args = { name, payload };
        return { error: null };
      },
    },
    user,
    token({ session_id: session }),
  );
  assert.deepEqual(args, {
    name: "assert_server_session",
    payload: { p_user_id: user, p_session_id: session },
  });
});
test("backend recusa token sem sessão e não consulta o banco", async () => {
  await assert.rejects(
    assertServerSession(
      {
        rpc: () => {
          throw Error("não chamar");
        },
      },
      user,
      token({}),
    ),
    { status: 401 },
  );
});
test("backend falha fechado quando a verificação não está disponível", async () => {
  await assert.rejects(
    assertServerSession(
      { rpc: async () => ({ error: { code: "PGRST202" } }) },
      user,
      token({ session_id: session }),
    ),
    { status: 503 },
  );
});
test("Edge Function recusa sessão revogada ou erro do banco", async () => {
  assert.equal(
    await sessionAllowed(
      { rpc: async () => ({ error: { code: "42501" } }) },
      user,
      token({ session_id: session }),
    ),
    false,
  );
  assert.equal(
    await sessionAllowed(
      {
        rpc: async () => {
          throw Error("offline");
        },
      },
      user,
      token({ session_id: session }),
    ),
    false,
  );
  assert.equal(
    await sessionAllowed(
      { rpc: async () => ({ error: null }) },
      user,
      token({ session_id: session }),
    ),
    true,
  );
});
