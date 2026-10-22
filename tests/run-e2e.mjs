import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'tests/e2e');
const scenarios = readdirSync(base).filter(name => name.endsWith('.check.cjs')).map(name => name.replace('.check.cjs', '')).sort();
const [name, ...args] = process.argv.slice(2);
if (!name || name === '--list') {
  console.log(scenarios.join('\n'));
} else if (!scenarios.includes(name)) {
  console.error('Cenário desconhecido. Use node tests/run-e2e.mjs --list.');
  process.exitCode = 1;
} else {
  const require = createRequire(import.meta.url);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [join(base, name + '.check.cjs'), ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
