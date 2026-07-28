import { build } from 'esbuild';

await build({
  entryPoints: ['server/server.ts'],
  outfile: 'dist-server/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['express'],
  sourcemap: true,
  minify: false,
});
