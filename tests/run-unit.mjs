// Passa arquivos explícitos ao Node para funcionar também no Windows, sem glob do shell.
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'tests/unit');
const areas = readdirSync(base, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const args = process.argv.slice(2);
if (args[0] === '--list') {
  for (const area of areas) console.log(`${area}: ${readdirSync(join(base, area)).filter(name => name.endsWith('.test.mjs')).length} arquivos`);
} else {
  const area = args[0] && !args[0].startsWith('-') ? args.shift() : 'all';
  if (area !== 'all' && !areas.includes(area)) {
    console.error(`Área desconhecida. Escolha: all, ${areas.join(', ')}.`);
    process.exitCode = 1;
  } else {
    const files = (area === 'all' ? areas : [area]).flatMap(name => readdirSync(join(base, name)).filter(file => file.endsWith('.test.mjs')).sort().map(file => join(base, name, file)));
    const result = spawnSync(process.execPath, ['--test', ...args, ...files], { cwd: root, stdio: 'inherit' });
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
  }
}
