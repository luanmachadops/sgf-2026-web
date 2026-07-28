# Edge Functions — SGF 2026

Código-fonte de todas as edge functions deployadas no projeto Supabase `kgxdrgbxpfoebzrphtqg`.

| Função | verify_jwt | Chamador | Notas |
|---|---|---|---|
| `vehicle-ai-extract` | ✅ | `web/src/lib/vehicleAI.ts` | Extração de dados do veículo/CRLV via OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`). |
| `driver-cnh-extract` | ✅ | `web/src/lib/driverAI.ts` | Extração de dados da CNH via OpenRouter. |
| `send-push` | ❌ | Trigger `tg_notifications_push` (pg_net) no INSERT de `notifications` | Protegida por segredo compartilhado (`PUSH_WEBHOOK_SECRET`, env ou `app_secrets`), obrigatório e fail-closed (2026-07-28: `secret` ausente agora retorna 500, antes pulava a checagem — auditoria `fix/auditoria-2026-07`). |
| `iopgps-sync` | ❌ (cron via `x-cron-secret`) | Cron + painel | Sincroniza rastreadores IOPGPS. |
| `iopgps-command` | ✅ | Admin | Envia comandos ao rastreador. |
| `iopgps-history` | ✅ | — | Histórico de posições IOPGPS. |

Resgatadas do deploy em 2026-07-07 (antes disso, `vehicle-ai-extract`, `driver-cnh-extract`, `send-push` e `notify-push` existiam apenas deployadas, sem versionamento).

Deploy: `supabase functions deploy <slug>` (para `send-push` e `iopgps-sync`, usar `--no-verify-jwt`).
