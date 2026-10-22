const { buildSync } = require('esbuild');
const { join } = require('node:path');
const root = process.cwd(), bundle = join(root, 'out/test/isolated-runtime.cjs');
buildSync({ entryPoints: ['src/main/isolatedRuntime.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
const { IsolatedRuntime } = require(bundle);
const runtime = new IsolatedRuntime(join(root, 'out/isolation-qa'), join(root, 'out/cli/index.js'), () => 'http://host.docker.internal:1');
runtime.prepare(line => process.stdout.write(line)).then(result => { if (!result.ok) { console.error(result.error); process.exitCode = 1; } });
