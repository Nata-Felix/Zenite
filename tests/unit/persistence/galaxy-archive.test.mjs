import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(process.cwd(), 'out/test/galaxy-archive.mjs');
await build({ stdin: { contents: 'export * from "./src/main/galaxyArchive";export * from "./src/main/workspaceStore";export * from "./src/main/elements";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const { exportGalaxy, inspectGalaxy, importGalaxy, WorkspaceStore, ElementService } = await import(pathToFileURL(out));
const all = { contents: true, media: true, env: true };

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'zn-galaxy-'));
  const data = join(dir, 'data'), project = join(dir, 'project'), universe = join(dir, 'universe'), external = join(dir, 'external');
  for (const folder of [project, universe, external]) mkdirSync(folder, { recursive: true });
  for (const folder of [project, universe]) {
    mkdirSync(join(folder, 'nested')); writeFileSync(join(folder, '.env'), 'TOKEN_ENV=segredo-qa-galaxia');
    mkdirSync(join(folder, 'vazia'));
    writeFileSync(join(folder, 'nested/.env.local'), 'TOKEN_NESTED=segredo-aninhado');
    writeFileSync(join(folder, 'app.js'), `console.log(${JSON.stringify(folder === project ? 'origem' : 'universo')})`);
    writeFileSync(join(folder, 'logo.png'), 'imagem-projeto');
    mkdirSync(join(folder, 'node_modules')); writeFileSync(join(folder, 'node_modules/ignore.js'), 'dependência');
    mkdirSync(join(folder, '.git')); writeFileSync(join(folder, '.git/ignore'), 'histórico');
  }
  writeFileSync(join(external, 'doc.txt'), 'Arquivo externo completo');
  mkdirSync(join(external, 'skill/references'), { recursive: true });
  writeFileSync(join(external, 'skill/SKILL.md'), '# Skill exportada');
  writeFileSync(join(external, 'skill/references/guia.md'), 'Apoio da skill');
  writeFileSync(join(external, 'image.png'), 'imagem-canvas-qa');
  const store = new WorkspaceStore(data), ws = store.list().activeId;
  store.update(ws, { name: 'Minha galáxia', dir: project });
  store.addUniverse(ws, { id: 'universe', name: 'Experimento', path: universe, worktree: universe, branch: 'codex/experimento', isolated: true }, false);
  const elements = new ElementService(data, store, { patch() {}, noteChanged() {}, tableChanged() {} });
  const image = elements.importMedia(join(external, 'image.png'));
  const node = (id, kind, extra = {}) => ({ id, kind, x: 20, y: 20, width: 300, height: 200, element: { id, kind, title: id, ...extra } });
  const nodes = [
    { id: 'terminal', kind: 'terminal', x: 20, y: 20, width: 300, height: 200, terminal: { id: 'terminal', title: 'Codex', command: 'codex', cwd: project, account: 'conta-privada', provider: 'openrouter', sun: true } },
    node('nota', 'note'), node('tabela', 'table'), node('imagem', 'image', { file: image.file }),
    node('arquivo', 'file', { path: join(external, 'doc.txt') }), node('skill', 'skill', { path: join(external, 'skill') }),
    node('pasta', 'folder', { path: project }),
    node('servico', 'service', { service: { transport: 'http', endpoint: 'https://api.exemplo.com', tokenEnv: 'TOKEN_ENV' } }),
    node('cron', 'flow', { flow: { type: 'ignition', schedule: 'daily', at: '09:00' } }),
    node('buraco', 'blackhole', { blackHole: { members: ['nota', 'tabela'], collapsed: true } }),
  ];
  elements.writeNote('nota', '# Conteúdo da nota', false);
  elements.writeTable('tabela', [['Nome', 'Valor'], ['QA', '42']], false);
  store.saveCanvas(ws, { version: 1, nodes, edges: [{ id: 'linha', source: 'terminal', target: 'nota' }], viewport: { x: 10, y: 20, zoom: .6 } });
  store.saveCanvas('universe', { version: 1, nodes: [node('nota-universo', 'note')], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
  elements.writeNote('nota-universo', 'Nota no universo', false);
  return { dir, data, project, universe, external, store, ws, elements, file: join(dir, 'galaxia.zenite-galaxia') };
}

function readPackage(file) {
  const data = readFileSync(file), magic = Buffer.byteLength('ZENITE-GALAXY-1\n'), size = data.readUInt32LE(magic);
  return { data, h: JSON.parse(data.subarray(magic + 4, magic + 4 + size)), body: data.subarray(magic + 4 + size) };
}
function rewrite(file, header, body) {
  const magic = Buffer.from('ZENITE-GALAXY-1\n'), json = Buffer.from(JSON.stringify(header)), size = Buffer.alloc(4); size.writeUInt32LE(json.length);
  writeFileSync(file, Buffer.concat([magic, size, json, body]));
}

test('galáxia completa: Origem, universos, conteúdos, mídia, .env, ids e pastas independentes', () => {
  const s = setup(), before = s.store.list().activeId;
  const info = exportGalaxy(s.file, s.ws, all, s.store, s.elements);
  assert.equal(info.canvases, 2); assert.equal(info.elements, 11); assert.equal(inspectGalaxy(s.file).files, info.files);
  const result = importGalaxy(s.file, all, s.data, s.store, s.elements);
  assert.equal(result.index.activeId, before, 'importação não ativa a galáxia nem abre terminais');
  const ws = result.index.workspaces.find(w => w.id === result.workspaceId);
  assert.equal(ws.name, 'Minha galáxia (2)'); assert.notEqual(ws.dir, s.project);
  assert.equal(ws.universes[0].isolated, false); assert.equal(ws.universes[0].branch, '');
  assert.match(readFileSync(join(ws.dir, '.env'), 'utf8'), /segredo-qa/);
  assert.match(readFileSync(join(ws.universes[0].path, '.env'), 'utf8'), /segredo-qa/);
  assert.ok(existsSync(join(ws.dir, 'nested/.env.local')));
  assert.ok(!existsSync(join(ws.dir, '.git'))); assert.ok(!existsSync(join(ws.dir, 'node_modules')));
  const canvas = s.store.loadCanvas(ws.id), byKind = kind => canvas.nodes.find(n => n.kind === kind);
  assert.equal(s.elements.readNote(byKind('note').id), '# Conteúdo da nota');
  assert.equal(s.elements.readTable(byKind('table').id)[1][1], '42');
  assert.equal(readFileSync(byKind('file').element.path, 'utf8'), 'Arquivo externo completo');
  assert.equal(byKind('folder').element.path, ws.dir, 'elemento da pasta do projeto continua apontando ao projeto importado');
  assert.ok(existsSync(join(ws.dir, 'vazia')), 'pastas vazias são preservadas');
  assert.match(readFileSync(join(byKind('skill').element.path, 'references/guia.md'), 'utf8'), /Apoio/);
  assert.equal(readFileSync(s.elements.mediaPath(byKind('image').element.file), 'utf8'), 'imagem-canvas-qa');
  assert.equal(byKind('terminal').terminal.command, 'codex'); assert.equal(byKind('terminal').terminal.cwd, ws.dir);
  for (const field of ['account', 'provider', 'sun']) assert.equal(byKind('terminal').terminal[field], undefined);
  assert.equal(byKind('flow').element.flow.paused, true);
  assert.equal(canvas.edges[0].target, byKind('note').id);
  assert.deepEqual(byKind('blackhole').element.blackHole.members, [byKind('note').id, byKind('table').id]);
  const universe = s.store.loadCanvas(ws.universes[0].id);
  assert.equal(s.elements.readNote(universe.nodes[0].id), 'Nota no universo');
  assert.equal(readFileSync(join(s.project, '.env'), 'utf8'), 'TOKEN_ENV=segredo-qa-galaxia');
});

test('opções independentes: template sem conteúdo/mídia/env e exportação somente .env', () => {
  const s = setup();
  exportGalaxy(s.file, s.ws, { contents: false, media: false, env: false }, s.store, s.elements);
  assert.equal(inspectGalaxy(s.file).files, 0);
  assert.ok(!readFileSync(s.file).includes(Buffer.from('segredo-qa-galaxia')));
  const result = importGalaxy(s.file, all, s.data, s.store, s.elements);
  const canvas = s.store.loadCanvas(result.workspaceId);
  assert.equal(canvas.nodes.length, 10); assert.equal(canvas.edges.length, 1);
  assert.equal(s.elements.readNote(canvas.nodes.find(n => n.kind === 'note').id), '');
  for (const n of canvas.nodes) { if (n.element) { assert.equal(n.element.file, undefined); assert.equal(n.element.path, undefined); } }
  exportGalaxy(s.file, s.ws, { contents: false, media: false, env: true }, s.store, s.elements);
  const pkg = readPackage(s.file); assert.ok(pkg.h.files.length >= 4); assert.ok(pkg.h.files.every(f => f.category === 'env'));
});

test('desmarcar mídia e .env remove os arquivos também das pastas do projeto', () => {
  const s = setup();
  exportGalaxy(s.file, s.ws, { contents: true, media: false, env: false }, s.store, s.elements);
  const pkg = readPackage(s.file);
  assert.ok(!pkg.h.files.some(f => /\.env|\.png/.test(f.path)));
  assert.ok(!readFileSync(s.file).includes(Buffer.from('segredo-aninhado')));
  assert.ok(pkg.h.files.some(f => f.path.endsWith('app.js')));
});

test('importação exige nova escolha de .env, mesmo se estiver incluído; conteúdo e mídia também podem ser removidos', () => {
  const s = setup(); exportGalaxy(s.file, s.ws, all, s.store, s.elements);
  const result = importGalaxy(s.file, { contents: false, media: false, env: false }, s.data, s.store, s.elements);
  const ws = result.index.workspaces.find(w => w.id === result.workspaceId);
  assert.deepEqual(readdirSync(ws.dir), []);
  const canvas = s.store.loadCanvas(ws.id);
  assert.ok(canvas.nodes.every(n => !n.element?.path && !n.element?.file));
});

test('arquivo danificado, caminhos maliciosos e .env disfarçado são recusados sem criar galáxia', () => {
  const s = setup(); exportGalaxy(s.file, s.ws, all, s.store, s.elements);
  const original = readPackage(s.file), count = s.store.list().workspaces.length;
  const broken = Buffer.from(original.data); broken[broken.length - 1] ^= 1; writeFileSync(s.file, broken);
  assert.throws(() => importGalaxy(s.file, all, s.data, s.store, s.elements), /danificado/);
  assert.equal(s.store.list().workspaces.length, count);
  assert.equal(readdirSync(join(s.data, 'galaxias-importadas')).length, 0);
  for (const path of ['projects/0/../escape', 'projects/0/C:stream', 'projects/0/CON', '/outside', 'projects/0/trailing.']) {
    const h = structuredClone(original.h); h.files[0].path = path; rewrite(s.file, h, original.body);
    assert.throws(() => inspectGalaxy(s.file), /inválid/);
  }
  const h = structuredClone(original.h); h.files.find(f => f.category === 'env').category = 'contents'; rewrite(s.file, h, original.body);
  assert.throws(() => inspectGalaxy(s.file), /classificação/);
  writeFileSync(s.file, original.data.subarray(0, original.data.length - 1)); assert.throws(() => inspectGalaxy(s.file), /tamanho/);
});

test('exportação ignora junctions e não inclui sua própria saída; fontes permanecem intactas', () => {
  const s = setup(); symlinkSync(s.external, join(s.project, 'atalho'), 'junction');
  exportGalaxy(s.file, s.ws, all, s.store, s.elements);
  assert.ok(!readPackage(s.file).h.files.some(f => f.path.includes('/atalho/')));
  assert.throws(() => exportGalaxy(join(s.project, 'pacote.zenite-galaxia'), s.ws, all, s.store, s.elements), /fora da pasta/);
  assert.ok(existsSync(join(s.project, 'app.js')));
});

test('Cronos importado fica pausado e novas ações remapeiam referências e caminhos', () => {
  const s = setup(), state = s.store.loadCanvas(s.ws);
  const node = (id, flow) => ({ id, kind: 'flow', x: 0, y: 0, width: 280, height: 160, element: { id, kind: 'flow', title: id, flow } });
  state.nodes.push(node('cronos', { type: 'chronos', chronos: { mode: 'startup' } }), node('http', { type: 'request', http: { serviceId: 'servico' } }), node('app', { type: 'launch', launch: { mode: 'open', targetId: 'arquivo', path: join(s.project, 'app.js') } }));
  s.store.saveCanvas(s.ws, state);
  exportGalaxy(s.file, s.ws, all, s.store, s.elements);
  const result = importGalaxy(s.file, all, s.data, s.store, s.elements);
  const imported = s.store.loadCanvas(result.workspaceId), find = title => imported.nodes.find(n => n.element?.title === title);
  assert.equal(find('cronos').element.flow.paused, true);
  assert.equal(find('http').element.flow.http.serviceId, find('servico').id);
  assert.equal(find('app').element.flow.launch.targetId, find('arquivo').id);
  assert.notEqual(find('app').element.flow.launch.path, join(s.project, 'app.js'));
  assert.ok(existsSync(find('app').element.flow.launch.path));
});
