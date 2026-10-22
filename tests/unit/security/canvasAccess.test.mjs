import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const outfile = join(process.cwd(), 'out/test/canvasAccess.mjs');
await build({ entryPoints: ['src/main/canvasAccess.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
const { CanvasAccess } = await import(pathToFileURL(outfile));
function fixture(mode = 'ask') {
  const root = mkdtempSync(join(tmpdir(), 'zenite-access-')), linked = join(root, 'ligada'), outside = join(root, 'fora');
  mkdirSync(linked); mkdirSync(outside); writeFileSync(join(linked, 'arquivo.txt'), 'canvas'); writeFileSync(join(outside, 'segredo.txt'), 'externo');
  const canvas = { nodes: [{ id: 'a', kind: 'terminal', terminal: { title: 'Agente A' } }, { id: 'b', kind: 'terminal', terminal: { title: 'Agente B' } }, { id: 'f', kind: 'folder', element: { path: linked } }], edges: [{ source: 'a', target: 'f' }] };
  const calls = [];
  const host = { canvas: () => canvas, permissions: () => mode, alive: () => true, confirm: async request => { calls.push(request); return { allow: false, remember: false }; } };
  const access = new CanvasAccess(host);
  return { root, linked, outside, canvas, calls, host, access };
}
test('pasta conectada permite o recurso exato, sem autorizar irmãos ou outro terminal', async () => {
  const f = fixture();
  assert.equal((await f.access.request('a', { operation: 'read', resource: join(f.linked, 'arquivo.txt') })).allowed, true);
  assert.equal((await f.access.request('a', { operation: 'write', resource: join(f.linked, 'novo.txt') })).allowed, true);
  assert.equal((await f.access.request('b', { operation: 'read', resource: join(f.linked, 'arquivo.txt') })).allowed, false);
  assert.equal((await f.access.request('a', { operation: 'read', resource: join(f.outside, 'segredo.txt') })).allowed, false);
  assert.equal(f.calls.length, 2);
});
test('Sandbox recusa acesso externo, comandos e rede sem mostrar permissão de escape', async () => {
  const f = fixture('sandbox');
  for (const request of [{ operation: 'read', resource: join(f.outside, 'segredo.txt') }, { operation: 'execute', resource: 'Get-ChildItem -Recurse', cwd: f.root }, { operation: 'network', resource: 'https://example.com/' }]) {
    const result = await f.access.request('a', request); assert.equal(result.allowed, false); assert.match(result.reason, /Sandbox/);
  }
  assert.equal(f.calls.length, 0);
});
test('Sempre perguntar exige nova decisão e não grava opção de lembrar', async () => {
  const f = fixture(); f.host.confirm = async request => { f.calls.push(request); return { allow: true, remember: true }; };
  const request = { operation: 'read', resource: join(f.outside, 'segredo.txt') };
  for (let i = 0; i < 2; i++) assert.equal((await f.access.request('a', request)).allowed, true);
  assert.equal(f.calls.length, 2); assert.equal(f.calls[0].rememberAllowed, false); assert.deepEqual(f.access.list(), []);
});
test('lembrar autorização limita terminal, operação e recurso e pode ser revogado', async () => {
  const f = fixture('full'); f.host.confirm = async request => { f.calls.push(request); return { allow: true, remember: true }; };
  const request = { operation: 'read', resource: join(f.outside, 'segredo.txt') };
  await f.access.request('a', request); await f.access.request('a', request);
  assert.equal(f.calls.length, 1); assert.equal(f.access.list().length, 1);
  await f.access.request('b', request); await f.access.request('a', { ...request, operation: 'write' });
  assert.equal(f.calls.length, 3);
  f.access.revoke(); await f.access.request('a', request); assert.equal(f.calls.length, 4);
  f.access.close('a'); assert.equal(f.access.list().some(g => g.terminalId === 'a'), false);
});
test('alteração de conexões/permissões durante diálogo invalida o clique Permitir', async () => {
  for (const mutation of ['edge', 'mode', 'close']) {
    const f = fixture('full');
    f.host.confirm = async () => {
      if (mutation === 'edge') f.canvas.edges = [];
      if (mutation === 'mode') f.host.permissions = () => 'sandbox';
      if (mutation === 'close') f.host.alive = () => false;
      return { allow: true, remember: true };
    };
    assert.equal((await f.access.request('a', { operation: 'read', resource: join(f.outside, 'segredo.txt') })).allowed, false);
    assert.deepEqual(f.access.list(), []);
  }
});
test('junctions não permitem sair da pasta conectada, inclusive para criar um arquivo', async () => {
  const f = fixture('sandbox'); symlinkSync(f.outside, join(f.linked, 'atalho'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const file of ['segredo.txt', 'novo.txt']) assert.equal((await f.access.request('a', { operation: 'write', resource: join(f.linked, 'atalho', file) })).allowed, false);
});
test('fechar, revogar ou cancelar enquanto há diálogo impede autorização', async () => {
  for (const action of ['close', 'revoke', 'signal']) {
    const f = fixture('full'), abort = new AbortController();
    f.host.confirm = async () => {
      if (action === 'close') f.access.close('a');
      if (action === 'revoke') f.access.revoke();
      if (action === 'signal') abort.abort();
      return { allow: true, remember: true };
    };
    assert.equal((await f.access.request('a', { operation: 'read', resource: join(f.outside, 'segredo.txt') }, abort.signal)).allowed, false);
  }
});
test('falhas de diálogo e pedidos inválidos são recusados', async () => {
  const f = fixture(); f.host.confirm = async () => { throw new Error('janela fechada'); };
  assert.equal((await f.access.request('a', { operation: 'read', resource: join(f.outside, 'segredo.txt') })).allowed, false);
  for (const request of [null, { operation: 'read', resource: '../relativo' }, { operation: 'execute', resource: 'comando' }, { operation: 'network', resource: 'file:///C:/a' }]) assert.equal((await f.access.request('a', request)).allowed, false);
});
test('operações concorrentes não compartilham uma aprovação nem cancelam o diálogo original', async () => {
  const f = fixture('full'); let finish;
  f.host.confirm = async () => new Promise(resolve => { finish = resolve; });
  const request = { operation: 'read', resource: join(f.outside, 'segredo.txt') };
  const pending = f.access.request('a', request);
  assert.equal((await f.access.request('a', request)).allowed, false);
  assert.equal((await f.access.request('a', request)).allowed, false);
  f.access.revoke(); finish({ allow: true, remember: true });
  assert.equal((await pending).allowed, false);
});
