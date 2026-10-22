import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const outfile = join(process.cwd(), 'out/test/isolatedBridge.mjs');
await build({ entryPoints: ['src/main/controlServer.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
const { ControlServer } = await import(pathToFileURL(outfile));
test('ponte de contêiner só aceita terminal isolado ativo com seu token', async () => {
  let isolated = true, permitted = true;
  const server = new ControlServer({ verify: (id, token) => id === 't' && token === 'token-de-teste' }, id => id === 't' ? { me: { id, title: 'Agente' }, linked: [], others: [] } : null, {
    isolatedSession: id => id === 't' && isolated,
    isolatedRequest: async () => { if (!permitted) throw new Error('Operação bloqueada'); },
  });
  const port = await server.listenContainers();
  const call = async (token = 'token-de-teste', id = 't') => fetch(`http://127.0.0.1:${port}/list`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-o-terminal': id, 'x-o-token': token }, body: '{}' });
  try {
    assert.equal((await call()).status, 200);
    assert.equal((await call('errado')).status, 403);
    assert.equal((await call('token-de-teste', 'outra-conta')).status, 403);
    permitted = false; assert.ok((await call()).status >= 400);
    permitted = true; isolated = false; assert.equal((await call()).status, 403);
  } finally { server.close(); }
});
