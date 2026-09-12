import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const skipTests = process.argv.includes('--skip-tests');
const skipBuild = process.argv.includes('--skip-build');
const warnings = [];
const errors = [];

if (strict && skipTests) {
  errors.push('Modo estrito exige a execução da suíte; remova --skip-tests.');
}
if (strict && skipBuild) {
  errors.push('Modo estrito exige os builds web, superadmin e servidor; remova --skip-build.');
}

const requiredMigrations = [
  '20260908235823_access_security_and_department_budgets.sql',
  '20260908235909_department_budget_control.sql',
  '20260909113403_active_sessions_and_legacy_access.sql',
  '20260909114100_parana_budget_reconciliation.sql',
  '20260910152227_procurement_registry.sql',
  '20260910211314_procurement_items_prices.sql',
  '20260911021152_instrument_budget_planning.sql',
  '20260911022956_procurement_preflight.sql',
  '20260911023848_procurement_fuel_reservations.sql',
  '20260911105457_procurement_fuel_classification.sql',
  '20260911105731_procurement_fuel_workflow.sql',
  '20260911164848_procurement_station_reservations.sql',
  '20260911170412_procurement_station_workflow.sql',
  '20260911215046_workshop_quote_classification.sql',
  '20260912034547_workshop_quote_procurement_links.sql',
  '20260912040123_workshop_quote_reservations.sql',
  '20260912041412_workshop_invoice_attestation.sql',
  '20260912042702_procurement_fiscal_reconciliation.sql',
  '20260912044001_procurement_legacy_reconciliation.sql',
  '20260912152713_procurement_legacy_ceiling_integrity.sql',
  '20260912225722_procurement_fiscal_workshop_usage_fix.sql',
];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run(label, command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    errors.push(`${label} falhou com código ${result.status ?? 'desconhecido'}.`);
  }
}

for (const migration of requiredMigrations) {
  const path = resolve(root, 'supabase', 'migrations', migration);
  if (!(await exists(path))) {
    errors.push(`Migration obrigatória ausente: ${migration}`);
    continue;
  }
  const source = await readFile(path, 'utf8');
  if (migration.includes('procurement_fuel_workflow') && !/enabled boolean not null default false/i.test(source)) {
    errors.push('A habilitação do fluxo de combustível precisa iniciar desativada.');
  }
  if (migration.includes('procurement_station_workflow') && !/enabled boolean not null default false/i.test(source)) {
    errors.push('A habilitação das operações complementares precisa iniciar desativada.');
  }
}

const migrationNames = requiredMigrations.map((name) => Number(name.slice(0, 14)));
if (new Set(migrationNames).size !== migrationNames.length) {
  errors.push('Há timestamps duplicados nas migrations obrigatórias.');
}
if (migrationNames.some((value, index) => index > 0 && value <= migrationNames[index - 1])) {
  errors.push('A ordem das migrations obrigatórias não é crescente.');
}

for (const artifact of ['web/dist/index.html', 'admin/dist/index.html']) {
  if (!(await exists(resolve(root, artifact)))) warnings.push(`Artefato ainda não compilado: ${artifact}`);
}

if (!skipTests) run('Suíte de segurança e orçamento', 'npm', ['run', 'test:security-budget']);
if (!skipBuild) {
  run('Build web', 'npm', ['run', 'build', '--prefix', 'web']);
  run('Build superadmin', 'npm', ['run', 'build', '--prefix', 'admin']);
  run('Build servidor', 'npm', ['run', 'build:server']);
}

if (process.env.SGF_PG_RUNTIME_DIR) {
  run('Concorrência PostgreSQL', 'node', ['scripts/test-budget-concurrency.mjs']);
  run('Concorrência oficinas e teto legado', 'node', ['scripts/test-workshop-legacy-concurrency.mjs']);
} else {
  warnings.push('Concorrência PostgreSQL real não executada: defina SGF_PG_RUNTIME_DIR para usar o runtime embarcado.');
}

if (warnings.length) {
  console.warn('\nAvisos do preflight:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}
if (errors.length) {
  console.error('\nFalhas do preflight:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
if (strict && warnings.length) {
  console.error('\nModo estrito bloqueado pelos avisos acima.');
  process.exitCode = 2;
}
if (!errors.length && !warnings.length) console.log('\nPreflight concluído sem pendências locais.');
