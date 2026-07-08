# Edge Functions — SGF 2026

Código-fonte de todas as edge functions deployadas no projeto Supabase `kgxdrgbxpfoebzrphtqg`.

| Função | verify_jwt | Chamador | Notas |
|---|---|---|---|
| `vehicle-ai-extract` | ✅ | `web/src/lib/vehicleAI.ts` | Extração de dados do veículo/CRLV via OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`). |
| `driver-cnh-extract` | ✅ | `web/src/lib/driverAI.ts` | Extração de dados da CNH via OpenRouter. |
| `send-push` | ❌ | Trigger `tg_notifications_push` (pg_net) no INSERT de `notifications` | **Endpoint aberto** — configurar o secret `PUSH_WEBHOOK_SECRET` na função e enviar o header `x-webhook-secret` no trigger. |
| `notify-push` | ✅ | **Ninguém** (órfã) | Duplicata mais nova de `send-push`, pensada para Database Webhook que nunca foi configurado. Consolidar: ou migrar o trigger para ela, ou removê-la. |
| `iopgps-sync` | ❌ (cron via `x-cron-secret`) | Cron + painel | Sincroniza rastreadores IOPGPS. |
| `iopgps-command` | ✅ | Admin | Envia comandos ao rastreador. |
| `iopgps-history` | ✅ | — | Histórico de posições IOPGPS. |

Resgatadas do deploy em 2026-07-07 (antes disso, `vehicle-ai-extract`, `driver-cnh-extract`, `send-push` e `notify-push` existiam apenas deployadas, sem versionamento).

Deploy: `supabase functions deploy <slug>` (para `send-push` e `iopgps-sync`, usar `--no-verify-jwt`).
