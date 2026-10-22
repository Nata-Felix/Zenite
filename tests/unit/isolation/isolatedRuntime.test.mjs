import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
const outfile = join(process.cwd(), 'out/test/isolation.mjs');
await build({ stdin: { contents: 'export * from "./src/main/isolatedRuntime";export * from "./src/main/isolatedFiles";export * from "./src/main/canvasAccess";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
const { containerArgs, profileVolume, exchangeVolume, isolatedFile, CanvasAccess } = await import(pathToFileURL(outfile));

test('qualquer comando fica após a imagem e não pode acrescentar montagens ou privilégios', () => {
  const command = 'qualquer-agente --privileged --mount /:/host';
  const args = containerArgs({ name: 'zenite-terminal-' + 'a'.repeat(24), profile: profileVolume('conta', 'custom'), image: 'zenite-agents:2', cli: 'C:\\projeto\\out\\cli\\index.js', token: 'token-test', terminalId: 'agent', endpoint: 'http://host.docker.internal:1234', command, providerEnv: { PRIVATE_HOST_KEY: 'nao-copiar', ANTHROPIC_API_KEY: 'token-explicito' } });
  const index = args.indexOf('zenite-agents:2');
  assert.ok(index > 0); assert.ok(args.at(-1).includes(command));
  assert.ok(args.includes('--read-only')); assert.ok(args.includes('--cap-drop=ALL')); assert.ok(args.includes('--security-opt=no-new-privileges'));
  assert.equal(args.filter(a => a === '--mount').length, 2);
  const mounts = args.filter((a, i) => args[i - 1] === '--mount');
  assert.ok(mounts.every(m => !m.includes('/var/run/docker.sock')));
  assert.equal(mounts.filter(m => m.startsWith('type=bind')).length, 1);
  assert.match(mounts.find(m => m.startsWith('type=bind')), /target=\/opt\/zenite\/cli.cjs,readonly$/);
  assert.ok(!args.join(' ').includes('nao-copiar')); assert.ok(args.includes('ANTHROPIC_API_KEY=token-explicito'));
});
test('área de troca da galáxia vira volume nomeado, recursos comportam render', () => {
  const base = { name: 'zenite-terminal-' + 'a'.repeat(24), profile: profileVolume('conta', 'codex'), image: 'zenite-agents:3', cli: 'C:\\cli.js', token: 't', terminalId: 'x', endpoint: 'http://h:1', command: '' };
  const args = containerArgs({ ...base, exchange: exchangeVolume('galaxia') });
  assert.ok(args.includes(`type=volume,source=${exchangeVolume('galaxia')},target=/exchange`));
  assert.equal(exchangeVolume('galaxia'), exchangeVolume('galaxia')); assert.notEqual(exchangeVolume('galaxia'), exchangeVolume('outra'));
  assert.throws(() => containerArgs({ ...base, exchange: '/:/host' }));
  assert.ok(args.includes('--pids-limit=4096')); assert.ok(args.includes('--shm-size=1g'));
});
test('perfil é persistente por conta/agente, nomes não viram caminhos ou argumentos', () => {
  assert.equal(profileVolume('conta', 'agy'), profileVolume('conta', 'antigravity'));
  assert.equal(profileVolume('conta', 'codex'), profileVolume('conta', 'codex'));
  assert.notEqual(profileVolume('conta', 'codex'), profileVolume('outra', 'codex'));
  assert.notEqual(profileVolume('conta', 'codex'), profileVolume('conta', 'claude'));
  assert.match(profileVolume('../../other --privileged', 'custom'), /^zenite-profile-[a-f0-9]{32}$/);
});
test('ponte só transfere arquivos autorizados e não reutiliza leitura para autorizar escrita', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zn-isolated-files-')), linked = join(root, 'linked'), outside = join(root, 'outside');
  mkdirSync(linked); mkdirSync(outside); writeFileSync(join(linked, 'a.txt'), 'ligado'); writeFileSync(join(outside, 'b.txt'), 'externo');
  const canvas = { nodes: [{ id: 't', terminal: { title: 'Agente' } }, { id: 'f', kind: 'folder', element: { path: linked } }], edges: [{ source: 't', target: 'f' }] };
  let count = 0, allow = false, mode = 'full';
  const access = new CanvasAccess({ canvas: () => canvas, alive: () => true, permissions: () => mode, confirm: async () => { count++; return { allow, remember: true }; } });
  assert.equal((await isolatedFile(access, 't', { action: 'read', path: join(linked, 'a.txt') })).content, 'ligado');
  await assert.rejects(isolatedFile(access, 't', { action: 'read', path: join(outside, 'b.txt') }), /cancelado/);
  allow = true; await isolatedFile(access, 't', { action: 'read', path: join(outside, 'b.txt') }); assert.equal(count, 2);
  allow = false; await assert.rejects(isolatedFile(access, 't', { action: 'write', path: join(outside, 'b.txt'), content: 'alterado' }), /cancelado/); assert.equal(count, 3);
  assert.equal(readFileSync(join(outside, 'b.txt'), 'utf8'), 'externo');
  mode = 'sandbox'; await assert.rejects(isolatedFile(access, 't', { action: 'read', path: join(outside, 'b.txt') }), /Sandbox/);
  await isolatedFile(access, 't', { action: 'write', path: join(linked, 'novo.txt'), content: 'novo' }); assert.equal(readFileSync(join(linked, 'novo.txt'), 'utf8'), 'novo');
  symlinkSync(outside, join(linked, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(isolatedFile(access, 't', { action: 'read', path: join(linked, 'escape/b.txt') }), /Sandbox/);
});
