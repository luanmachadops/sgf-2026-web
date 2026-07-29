import { spawnSync } from 'node:child_process';

const surface = process.env.APP_SURFACE?.toLowerCase();

if (surface !== 'web' && surface !== 'admin') {
  console.log('APP_SURFACE não definido: build automático ignorado.');
  process.exit(0);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Preparando somente a interface ${surface} para esta hospedagem.`);
run('npm', ['ci', '--prefix', surface]);
run('npm', ['run', 'build', '--prefix', surface]);
run('npm', ['run', 'build:server']);
