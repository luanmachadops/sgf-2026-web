import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

test('preflight estrito não aceita testes ou builds ignorados', () => {
  const root = resolve(import.meta.dirname, '..');
  const result = spawnSync(process.execPath, ['scripts/release-preflight.mjs', '--strict', '--skip-tests', '--skip-build'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Modo estrito exige a execução da suíte/);
  assert.match(output, /Modo estrito exige os builds/);
});
