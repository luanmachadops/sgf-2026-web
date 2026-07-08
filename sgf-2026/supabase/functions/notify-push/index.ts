// ═══════════════════════════════════════════════════════════════════════════
// Edge Function: notify-push
//
// Recebe o payload de um Database Webhook (INSERT em public.notifications),
// busca os push_tokens do driver_id e envia via Expo Push API.
// Trata tokens inválidos (DeviceNotRegistered → remove do banco).
//
// Deploy: supabase functions deploy notify-push
// Webhook: Table notifications, evento INSERT → aponta para esta função.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

interface NotificationRow {
  id: string;
  driver_id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: NotificationRow | null;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as WebhookPayload;
    const row = payload.record;

    if (payload.type !== "INSERT" || !row || !row.driver_id) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Tokens de push do destinatário.
    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", row.driver_id);

    if (error) throw error;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_tokens" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const messages = tokens.map((t) => ({
      to: t.token,
      sound: "default",
      title: row.title ?? "Frota Municipal",
      body: row.body ?? "",
      data: {
        link: row.link,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
      },
    }));

    const invalidTokens: string[] = [];
    let sent = 0;

    for (const batch of chunk(messages, BATCH_SIZE)) {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        console.error("Expo push falhou:", res.status, await res.text());
        continue;
      }

      const json = await res.json();
      const receipts = Array.isArray(json?.data) ? json.data : [];

      receipts.forEach((r: any, i: number) => {
        if (r?.status === "ok") {
          sent += 1;
        } else if (r?.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(batch[i].to);
        } else {
          console.error("Recibo de erro:", JSON.stringify(r));
        }
      });
    }

    // Limpa tokens inválidos.
    if (invalidTokens.length > 0) {
      await supabase.from("push_tokens").delete().in("token", invalidTokens);
    }

    return new Response(
      JSON.stringify({ sent, removed: invalidTokens.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("notify-push erro:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
