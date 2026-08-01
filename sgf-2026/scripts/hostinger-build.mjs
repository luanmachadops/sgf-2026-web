import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const surface = process.env.APP_SURFACE?.toLowerCase();

if (surface !== 'web' && surface !== 'admin') {
  console.log('APP_SURFACE não definido: build automático ignorado.');
  process.exit(0);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const prebuiltIndex = `${surface}/dist/index.html`;
if (!existsSync(prebuiltIndex)) {
  console.error(`Artefato pré-compilado ausente: ${prebuiltIndex}`);
  process.exit(1);
}

// A hospedagem possui limite de inodes compartilhado entre quatro apps. O
// pacote de ícones sozinho extrai mais de 23 mil arquivos; executar `npm ci`
// em cada subdomínio esgota o filesystem antes do Vite iniciar. Os artefatos
// versionados são produzidos e validados no CI/local, e a Hostinger só embute
// o HTML correspondente no servidor Express.
console.log(`Usando interface ${surface} pré-compilada em ${prebuiltIndex}.`);
run('npm', ['run', 'build:server']);
