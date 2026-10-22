import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const outfile = join(process.cwd(), 'out/test/black-holes.mjs');
await build({ stdin: { contents: 'export * from "./src/shared/blackHoles";export * from "./src/main/canvasClipboard";export * from "./src/main/canvasArchive";export * from "./src/main/workspaceStore";export * from "./src/main/elements";export * from "./src/main/canvasGraph";export * from "./src/main/controlServer";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
const { blackHoleOwners, projectBlackHoleEdges, withBlackHoleContents, remapBlackHoleMembers, CanvasClipboard, WorkspaceStore, ElementService, writeCanvasArchive, readCanvasArchive, neighborhoodFromStore, ControlServer } = await import(pathToFileURL(outfile));
const node = (id, kind = 'note', extra = {}) => ({ id, kind, x: 20, y: 30, width: 300, height: 200, ...(kind === 'terminal' ? { terminal: { id, title: id, cwd: '', command: '' } } : { element: { id, kind, title: id, ...extra } }) });
const group = (id, members, collapsed = true) => node(id, 'blackhole', { blackHole: { members, collapsed } });
const edge = (id, source, target, sourceHandle) => ({ id, source, target, ...(sourceHandle ? { sourceHandle } : {}) });

test('agrupamento ignora órfãos, duplicatas, desenhos e grupos aninhados', () => {
  const nodes = [node('a'), node('b'), node('draw', 'draw'), group('g', ['a', 'a', 'draw', 'h', 'missing']), group('h', ['a', 'b'], false)];
  assert.deepEqual([...blackHoleOwners(nodes)], [['a', 'g'], ['b', 'h']]);
  assert.deepEqual([...blackHoleOwners(nodes, true)], [['a', 'g']]);
  nodes[3].element.blackHole.members = null;
  assert.deepEqual([...blackHoleOwners(nodes)], [['a', 'h'], ['b', 'h']]);
});

test('projeção mantém IDs e rotas; abrir liga a porta aos elementos internos', () => {
  const nodes = [node('a'), node('b'), node('out'), group('g', ['a', 'b'])];
  const edges = [edge('internal', 'a', 'b', 'rota-a'), edge('external', 'a', 'out', 'rota-b'), edge('reverse', 'out', 'b')];
  const original = structuredClone(edges);
  const projected = projectBlackHoleEdges(nodes, edges);
  assert.equal(projected[0].hidden, true);
  assert.equal(projected[1].source, 'g'); assert.equal(projected[1].sourceHandle, null);
  assert.deepEqual(projected[1].data, { originalSource: 'a', originalTarget: 'out', logicalEdgeId: 'external' });
  assert.equal(projected[2].target, 'g');
  assert.deepEqual(edges, original);
  nodes[3].element.blackHole.collapsed = false;
  const opened = projectBlackHoleEdges(nodes, edges);
  assert.equal(opened.length, 5);
  assert.equal(opened.find(e => e.id === 'external').source, 'g');
  assert.equal(opened.find(e => e.id === 'external::black-hole-source').source, 'a');
  assert.equal(opened.find(e => e.id === 'external::black-hole-source').target, 'g');
  assert.equal(opened.find(e => e.id === 'external::black-hole-source').sourceHandle, 'rota-b');
  assert.equal(opened.find(e => e.id === 'reverse::black-hole-target').source, 'g');
  assert.equal(opened.find(e => e.id === 'reverse::black-hole-target').target, 'b');
  assert.deepEqual(edges, original);
});

test('portas de duas pastas abertas preservam as rotas e a seleção da ligação original', () => {
  const nodes = [node('a'), node('b'), group('g', ['a'], false), group('h', ['b'], false)];
  const original = { ...edge('ab', 'a', 'b', 'rota'), selected: true };
  const result = projectBlackHoleEdges(nodes, [original]);
  assert.deepEqual(result.map(e => [e.source, e.target]), [['g', 'h'], ['a', 'g'], ['h', 'b']]);
  assert.ok(result.every(e => e.selected && e.data.logicalEdgeId === 'ab'));
  nodes[2].element.blackHole.collapsed = true;
  assert.deepEqual(projectBlackHoleEdges(nodes, [original]).map(e => [e.source, e.target]), [['g', 'h'], ['h', 'b']]);
});

test('grupos diferentes projetam a ligação externa sem perder a identidade', () => {
  const nodes = [node('a'), node('b'), group('g', ['a']), group('h', ['b'])];
  const result = projectBlackHoleEdges(nodes, [edge('ab', 'a', 'b')]);
  assert.equal(result[0].source, 'g'); assert.equal(result[0].target, 'h'); assert.equal(result[0].hidden, false);
  assert.deepEqual([...withBlackHoleContents(nodes, ['g'])], ['g', 'a']);
  const copy = structuredClone(nodes); remapBlackHoleMembers(copy, new Map([['a', 'A']]));
  assert.deepEqual(copy[2].element.blackHole.members, ['A']);
  assert.deepEqual(copy[3].element.blackHole.members, []);
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'zn-black-hole-'));
  const store = new WorkspaceStore(dir), a = store.list().activeId, b = store.create('Destino', '').activeId;
  const elements = new ElementService(dir, store, { noteChanged() {}, tableChanged() {}, patch() {} });
  const nodes = [node('agent', 'terminal'), node('a'), node('b'), node('out'), group('g', ['a', 'b'])];
  const state = { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges: [edge('internal', 'a', 'b'), edge('external', 'agent', 'a')] };
  store.saveCanvas(a, state); store.saveCanvas(b, { ...state, nodes: [], edges: [] });
  elements.writeNote('a', 'Texto original', false);
  return { dir, store, a, b, elements, state, clipboard: new CanvasClipboard(dir, store, elements) };
}

test('copiar grupo leva membros e linha interna com IDs novos e conteúdo independente', () => {
  const s = setup();
  for (const [i, n] of s.state.nodes.entries()) n.summary = { x: i * 100, y: 100 };
  s.clipboard.capture(s.a, s.state, ['g'], 'copy');
  const result = s.clipboard.paste(s.b, s.store.loadCanvas(s.b), { x: 500, y: 500 });
  assert.equal(result.inserted.length, 3);
  const nodes = result.state.nodes, hole = nodes.find(n => n.kind === 'blackhole');
  assert.equal(hole.element.blackHole.members.length, 2);
  assert.ok(hole.element.blackHole.members.every(id => result.inserted.includes(id) && !['a', 'b'].includes(id)));
  assert.equal(result.state.edges.length, 1);
  const original = s.state.nodes.find(n => n.id === 'g');
  assert.notDeepEqual(hole.summary, original.summary);
  const originalA = s.state.nodes.find(n => n.id === 'a'), copiedA = nodes.find(n => n.element.title === 'a - cópia');
  assert.equal(copiedA.summary.x - hole.summary.x, originalA.summary.x - original.summary.x);
  const note = nodes.find(n => n.element.title === 'a - cópia');
  assert.equal(s.elements.readNote(note.id), 'Texto original');
  s.elements.writeNote(note.id, 'Nova cópia', false); assert.equal(s.elements.readNote('a'), 'Texto original');
});

test('exportar e importar grupo remapeia membros e mantém conexões reais', () => {
  const s = setup(), file = join(s.dir, 'grupo.zenite');
  writeCanvasArchive(file, s.state, ['note', 'terminal', 'blackhole'], s.elements);
  const batch = readCanvasArchive(file, name => s.elements.mediaPath(name));
  const result = s.clipboard.insert(s.b, s.store.loadCanvas(s.b), batch, { x: 100, y: 100 });
  const hole = result.state.nodes.find(n => n.kind === 'blackhole');
  assert.ok(hole.element.blackHole.members.every(id => result.inserted.includes(id) && !['a', 'b'].includes(id)));
  assert.equal(result.state.edges.length, 2);
  assert.equal(projectBlackHoleEdges(result.state.nodes, result.state.edges).filter(e => e.hidden).length, 1);
});

test('recolher não concede ligação nova aos agentes nem remove a original', () => {
  const s = setup();
  assert.ok(neighborhoodFromStore(s.store, 'agent').linked.some(n => n.id === 'a'));
  assert.ok(!neighborhoodFromStore(s.store, 'agent').linked.some(n => n.id === 'b'));
  assert.ok(!neighborhoodFromStore(s.store, 'agent').linked.some(n => n.id === 'g'));
});

test('CLI do Sol cria, abre e desagrupa sem apagar membros nem conexões', async () => {
  const s = setup(), cli = join(process.cwd(), 'out/test/black-hole-cli.cjs');
  await build({ entryPoints: ['src/cli/index.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: cli, logLevel: 'silent' });
  const address = process.platform === 'win32' ? `\\\\.\\pipe\\zn-black-hole-${process.pid}` : join(s.dir, 'control.sock');
  const control = new ControlServer({ verify: (id, token) => id === 'agent' && token === 'test' }, id => neighborhoodFromStore(s.store, id, () => true), { canvasOf: id => s.elements.canvasOf(id), canvasOps: (canvasId, ops, callerId) => s.elements.canvasOps(canvasId, ops, callerId) });
  await control.listen(address);
  const run = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { windowsHide: true, env: { ...process.env, O_PIPE: address, O_TOKEN: 'test', O_TERMINAL_ID: 'agent' } });
    let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
    child.once('error', reject); child.once('close', code => code === 0 ? resolve(output) : reject(Error(output)));
  });
  try {
    await run(['node','create','buraco-negro','Novo grupo','--config','{"members":["out"],"collapsed":true}']);
    const hole = s.store.loadCanvas(s.a).nodes.find(n => n.element?.title === 'Novo grupo');
    assert.deepEqual(hole.element.blackHole.members, ['out']);
    await run(['node','edit','Novo grupo','--black-hole-config','{"collapsed":false}']);
    assert.equal(s.store.loadCanvas(s.a).nodes.find(n => n.id === hole.id).element.blackHole.collapsed, false);
    await run(['node','delete','Novo grupo']);
    const after = s.store.loadCanvas(s.a); assert.ok(after.nodes.some(n => n.id === 'out')); assert.deepEqual(after.edges, s.state.edges);
  } finally { control.close(); }
});
