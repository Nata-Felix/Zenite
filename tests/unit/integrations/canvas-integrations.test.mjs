import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import fixture from '../../fixtures/integrations.fixture.cjs';

const out = join(process.cwd(), 'out/test/canvas-integrations.mjs');
await build({ stdin: { contents: 'export * from "./src/main/canvasIntegrations";export * from "./src/main/workspaceStore";export * from "./src/main/canvasGraph";export * from "./src/main/controlServer";export * from "./src/main/canvasArchive";export * from "./src/main/flowRunner";export * from "./src/shared/canvasOps";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const { CanvasIntegrations, WorkspaceStore, readCanvasSkill, validateService, neighborhoodFromStore, ControlServer, writeCanvasArchive, readCanvasArchive, applyCanvasOps, runFlow } = await import(pathToFileURL(out));
const cli = join(process.cwd(), 'out/test/integrations-cli.cjs');
await build({ entryPoints: ['src/cli/index.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: cli, logLevel: 'silent' });

function setup(url) {
  const dir = mkdtempSync(join(tmpdir(), 'zn-integrations-'));
  const project = join(dir, 'project'), skill = join(project, 'skill');
  mkdirSync(join(skill, 'references'), { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: teste\ndescription: revisão\n---\n# Skill do canvas\nLeia references/guia.md');
  writeFileSync(join(skill, 'references/guia.md'), 'Guia de apoio da skill');
  writeFileSync(join(project, '.env'), 'QA_SERVICE_TOKEN=token-ficticio-para-teste\n');
  const store = new WorkspaceStore(dir), ws = store.list().workspaces[0].id;
  store.update(ws, { dir: project }); store.setSettings({ agentPermissions: 'full' });
  const nodes = [
    { id: 'agent', kind: 'terminal', terminal: { id: 'agent', title: 'Agente', command: '', cwd: project, sun: true } },
    { id: 'other', kind: 'terminal', terminal: { id: 'other', title: 'Sem ligação', command: '', cwd: project } },
    { id: 'skill', kind: 'skill', element: { id: 'skill', kind: 'skill', title: 'Revisão', path: skill } },
    { id: 'api', kind: 'service', element: { id: 'api', kind: 'service', title: 'API', service: { transport: 'http', endpoint: url + '/api', tokenEnv: 'QA_SERVICE_TOKEN' } } },
    { id: 'mcp', kind: 'service', element: { id: 'mcp', kind: 'service', title: 'MCP', service: { transport: 'mcp', endpoint: url + '/mcp' } } },
    { id: 'sat', kind: 'flow', element: { id: 'sat', kind: 'flow', title: 'Satélite', flow: { type: 'satellite', permission: 'full' } } },
  ].map((n, i) => ({ ...n, x: i * 300, y: 0, width: 280, height: 300 }));
  let canvas = { version: 1, nodes, edges: ['skill', 'api', 'mcp'].flatMap(id => ['agent', 'sat'].map(target => ({ id: id + target, source: id, target }))), viewport: { x: 0, y: 0, zoom: 1 } };
  store.saveCanvas(ws, canvas);
  let approved = true, count = 0, onConfirm;
  const svc = new CanvasIntegrations(store, async () => { count++; if (onConfirm) onConfirm(); return approved; });
  return { dir, project, skill, store, ws, svc, get confirmations() { return count; }, approve(value) { approved = value; }, onConfirm(fn) { onConfirm = fn; }, update(id, patch) { canvas = store.loadCanvas(ws); Object.assign(canvas.nodes.find(n => n.id === id).element, patch); store.saveCanvas(ws, canvas); }, disconnect(id = 'agent') { canvas = store.loadCanvas(ws); canvas.edges = canvas.edges.filter(e => e.source !== id && e.target !== id); store.saveCanvas(ws, canvas); } };
}

test('skill: instruções, recursos, ligação direta, path traversal e junctions', () => {
  const s = setup('http://localhost');
  assert.match(s.svc.skill('skill', undefined, 'agent').data.content, /Skill do canvas/);
  assert.equal(s.svc.skill('skill', 'references/guia.md', 'agent').data.content, 'Guia de apoio da skill');
  assert.equal(s.svc.skill('skill', undefined, 'other').ok, false);
  assert.equal(s.svc.skill('skill', '../.env', 'agent').ok, false);
  const outside = join(s.dir, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'private.md'), 'privado');
  symlinkSync(outside, join(s.skill, 'escape'), 'junction');
  assert.throws(() => readCanvasSkill(s.skill, 'escape/private.md'), /dentro/);
  writeFileSync(join(s.skill, 'large.md'), 'x'.repeat(1_000_001));
  assert.throws(() => readCanvasSkill(s.skill, 'large.md'), /1 MB/);
  s.disconnect(); assert.equal(s.svc.skill('skill', undefined, 'agent').ok, false);
});

test('HTTP: GET, envio autorizado, credencial do .env e redaction da resposta', async () => {
  const f = await fixture(); try {
    const s = setup(f.url);
    const get = await s.svc.service('api', { action: 'test' }, 'agent');
    assert.equal(get.ok, true); assert.equal(get.data.status, 200);
    assert.equal(f.calls.at(-1).auth, 'Bearer token-ficticio-para-teste');
    assert.ok(!JSON.stringify(get).includes('token-ficticio-para-teste'));
    assert.equal(s.confirmations, 0);
    assert.equal((await s.svc.service('api', { action: 'request', method: 'POST', path: 'clientes', body: { name: 'Zênite' } }, 'agent')).ok, false);
    s.update('api', { service: { ...s.store.loadCanvas(s.ws).nodes.find(n => n.id === 'api').element.service, allowWrites: true } });
    const post = await s.svc.service('api', { action: 'request', method: 'POST', path: 'clientes', body: { name: 'Zênite' } }, 'agent');
    assert.equal(post.ok, true); assert.deepEqual(post.data.body.body, { name: 'Zênite' });
    assert.equal(f.calls.at(-1).url, '/api/clientes');
    assert.ok(!readFileSync(join(s.dir, 'workspaces', s.ws + '.json'), 'utf8').includes('token-ficticio-para-teste'));
    writeFileSync(join(s.project, '.env'), 'QA_SERVICE_TOKEN=\'qa"\\token-especial\'\n');
    const special = await s.svc.service('api', { action: 'test' }, 'agent');
    assert.equal(special.data.body.auth, 'Bearer [credencial ocultada]');
  } finally { await f.close(); }
});

test('permissões: perguntar por chamada, cancelar, sandbox e revogação durante confirmação', async () => {
  const f = await fixture(); try {
    const s = setup(f.url); s.store.setSettings({ agentPermissions: 'ask' });
    for (let i = 0; i < 2; i++) assert.equal((await s.svc.service('api', { action: 'test' }, 'agent')).ok, true);
    assert.equal(s.confirmations, 2);
    s.approve(false); const count = f.calls.length;
    assert.match((await s.svc.service('api', { action: 'test' }, 'agent')).error, /cancelado/);
    assert.equal(f.calls.length, count);
    s.store.setSettings({ agentPermissions: 'sandbox' });
    assert.match((await s.svc.service('api', { action: 'test' }, 'agent')).error, /Sandbox/);
    assert.equal(f.calls.length, count); assert.equal(s.confirmations, 3);
    s.store.setSettings({ agentPermissions: 'ask' }); s.approve(true); s.onConfirm(() => s.disconnect());
    assert.match((await s.svc.service('api', { action: 'test' }, 'agent')).error, /ligado/);
    assert.equal(f.calls.length, count);
  } finally { await f.close(); }
});

test('serviço: limita destino, HTTPS, redirecionamentos, tamanho, erro e mudanças de configuração/permissão', async () => {
  const f = await fixture(); try {
    const s = setup(f.url), req = path => s.svc.service('api', { action: 'request', path }, 'agent');
    for (const path of ['https://outro.com', '../segredo', '//outro.com']) assert.equal((await req(path)).ok, false);
    assert.equal(f.calls.length, 0);
    assert.throws(() => validateService({ transport: 'http', endpoint: 'http://example.com' }), /HTTPS/);
    assert.throws(() => validateService({ transport: 'http', endpoint: 'https://user:secret@example.com' }), /senha/);
    assert.throws(() => validateService({ transport: 'http', endpoint: 'https://example.com?token=secret' }), /senha/);
    assert.match((await req('redirect')).error, /redirecionou/);
    assert.match((await req('large')).error, /1 MB/);
    assert.match((await req('fail')).error, /503/);
    s.store.setSettings({ agentPermissions: 'ask' });
    s.onConfirm(() => s.store.setSettings({ agentPermissions: 'full' }));
    const count = f.calls.length;
    assert.match((await req('')).error, /permissões mudaram/); assert.equal(f.calls.length, count);
    s.store.setSettings({ agentPermissions: 'ask' });
    s.onConfirm(() => s.update('api', { service: { transport: 'http', endpoint: f.url + '/other' } }));
    assert.match((await req('')).error, /configuração mudou/); assert.equal(f.calls.length, count);
  } finally { await f.close(); }
});

test('MCP real: inicialização, sessão, SSE aberto, paginação e chamada permitida', async () => {
  const f = await fixture(); try {
    const s = setup(f.url);
    const list = await s.svc.service('mcp', { action: 'tools' }, 'agent');
    assert.equal(list.ok, true); assert.deepEqual(list.data.tools.map(t => t.name), ['echo', 'status']);
    const count = f.calls.length;
    assert.equal((await s.svc.service('mcp', { action: 'call', tool: 'echo', arguments: {} }, 'agent')).ok, false);
    assert.equal(f.calls.length, count);
    s.update('mcp', { service: { transport: 'mcp', endpoint: f.url + '/mcp', allowWrites: true, tools: ['echo'] } });
    assert.equal((await s.svc.service('mcp', { action: 'call', tool: 'not_allowed' }, 'agent')).ok, false);
    const result = await s.svc.service('mcp', { action: 'call', tool: 'echo', arguments: { message: 'Olá canvas' } }, 'agent');
    assert.match(result.data.content[0].text, /Olá canvas/);
    assert.equal(f.calls.at(-1).method, 'DELETE');
    s.update('sat', { flow: { type: 'satellite', permission: 'sandbox' } });
    assert.match((await s.svc.service('mcp', { action: 'tools' }, 'sat')).error, /Sandbox/);
    s.update('sat', { flow: { type: 'satellite', permission: 'read' } });
    assert.match((await s.svc.service('mcp', { action: 'call', tool: 'echo' }, 'sat')).error, /somente leitura/);
    assert.equal(s.svc.skill('skill', undefined, 'sat').ok, true);
  } finally { await f.close(); }
});

test('novos elementos: operações do Sol e exportação/importação preservam configuração e ligações', () => {
  const s = setup('http://localhost'), canvas = s.store.loadCanvas(s.ws);
  const state = applyCanvasOps(canvas, [{ op: 'create', kind: 'skill', title: 'Outra skill', element: { path: s.skill }, links: ['Agente'] }, { op: 'create', kind: 'service', title: 'Outro serviço', element: { service: { transport: 'http', endpoint: 'https://example.com' } }, links: ['Agente'] }], { newId: (() => { let i = 0; return () => 'new' + ++i; })(), seed: () => 1 }).state;
  assert.equal(state.nodes.length, canvas.nodes.length + 2);
  const archive = join(s.dir, 'canvas.zenite');
  writeCanvasArchive(archive, state, ['skill', 'service', 'terminal'], {});
  const imported = readCanvasArchive(archive, () => '');
  assert.equal(imported.nodes.filter(n => n.kind === 'skill').length, 2);
  assert.equal(imported.nodes.filter(n => n.kind === 'service').length, 3);
  assert.ok(imported.edges.length >= 5);
});

test('Satélite e Torre identificam o próprio astro ao executar; integração ligada não vira passo de fluxo', async () => {
  const s = setup('http://localhost'), seen = [];
  const canvas = s.store.loadCanvas(s.ws);
  canvas.nodes.find(n => n.id === 'sat').element.flow.prompt = 'Revisar {{entrada}}';
  canvas.edges = canvas.edges.map(e => e.target === 'sat' ? { ...e, source: 'sat', target: e.source } : e);
  const deps = { runAgent: async (_spec, _prompt, id) => { seen.push(id); return { ok: true, text: 'OK' }; }, hasQuota: () => true, status() {}, deliver: async () => {}, runScript: async () => ({ ok: true, text: '' }) };
  await runFlow(canvas, 'sat', deps, 'teste');
  assert.deepEqual(seen, ['sat']);
  const satellite = canvas.nodes.find(n => n.id === 'sat');
  satellite.element.flow = { type: 'tower', decide: 'agent', routes: [{ id: 'r1', label: 'OK' }] };
  seen.length = 0; await runFlow(canvas, 'sat', deps, 'teste');
  assert.deepEqual(seen, ['sat']);
});

test('CLI e servidor: autenticação real, isolamento do Sol, uso conectado e sessão limitada de Satélite', async () => {
  const f = await fixture(), s = setup(f.url);
  const server = new ControlServer({ verify: (id, token) => id === 'agent' && token === 'qa', has: () => true }, id => neighborhoodFromStore(s.store, id, caller => caller === 'agent'), { integrationSkill: (id, file, caller) => s.svc.skill(id, file, caller), integrationService: (id, req, caller) => s.svc.service(id, req, caller) });
  const address = process.platform === 'win32' ? `\\\\.\\pipe\\zn-integration-${process.pid}` : join(s.dir, 'test.sock');
  await server.listen(address);
  const run = (args, id = 'agent', token = 'qa') => new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args, '--json'], { env: { ...process.env, O_PIPE: address, O_TERMINAL_ID: id, O_TOKEN: token }, windowsHide: true });
    let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
    child.on('close', code => resolve({ code, output }));
  });
  try {
    assert.equal((await run(['skill', 'read', 'Revisão'])).code, 0);
    assert.match((await run(['skill', 'read', 'Revisão', '--resource', 'references/guia.md'])).output, /Guia de apoio/);
    assert.equal((await run(['service', 'request', 'API', 'GET', 'clientes'])).code, 0);
    assert.equal((await run(['service', 'tools', 'MCP'])).code, 0);
    const session = server.integrationSession('sat');
    assert.equal((await run(['skill', 'read', 'Revisão'], 'sat', session.token)).code, 0);
    assert.match((await run(['note', 'read', 'Qualquer'], 'sat', session.token)).output, /só acessa/);
    session.close(); assert.notEqual((await run(['skill', 'read', 'Revisão'], 'sat', session.token)).code, 0);
    s.disconnect();
    assert.match((await run(['skill', 'read', 'Revisão'])).output, /não está ligado/);
    assert.match((await run(['service', 'test', 'API'])).output, /não está ligado/);
  } finally { server.close(); await f.close(); }
});
