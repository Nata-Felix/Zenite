// Testa os superpoderes do Sol de ponta a ponta: o zn de verdade, o servidor de controle e o
// canvas aberto na tela (cada comando entra no Ctrl+Z do usuário).
const { app, BrowserWindow, ipcMain } = require('electron');
const { buildSync } = require('esbuild');
const { execFile } = require('node:child_process');
const { join } = require('node:path');
const { existsSync, mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd();
const output = join(root, 'out', 'canvas-sol-qa');
mkdirSync(output, { recursive: true });
const data = mkdtempSync(join(output, 'profile-'));
app.setPath('userData', data);
app.commandLine.appendSwitch('disable-gpu');
const bundle = join(root, 'out/test/sol-qa-main.cjs');
buildSync({ stdin: { contents: 'export * from "./src/main/ptyManager"; export * from "./src/main/workspaceStore"; export * from "./src/main/elements"; export * from "./src/main/controlServer"; export * from "./src/main/canvasGraph"; export * from "./src/main/solTools"; export * from "./src/main/canvasArchive"; export * from "./src/main/sunAuthority";', resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['@lydell/node-pty'], outfile: bundle, logLevel: 'silent' });
const cli = join(root, 'out/test/sol-qa-cli.cjs');
buildSync({ entryPoints: [join(root, 'src/cli/index.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: cli, logLevel: 'silent' });
const { PtyManager, WorkspaceStore, ElementService, ControlServer, neighborhoodFromStore, RoleStore, SolLog, writeCanvasArchive, SunAuthority } = require(bundle);
const suns = new SunAuthority();
const store = new WorkspaceStore(data, (id, state) => suns.present(id, state));
const a = store.list().activeId;
// O dono do cenário concede a função na sessão; o JSON não concede autoridade.
suns.set(a, 'sol', true);
store.update(a, { name: 'Projeto A', dir: root });
store.saveCanvas(a, { version: 1, viewport: { x: 0, y: 0, zoom: 0.6 }, nodes: [
  { id: 'sol', kind: 'terminal', x: 50, y: 100, width: 520, height: 300, terminal: { id: 'sol', title: 'Sol', command: '', cwd: root, sun: true } },
  { id: 'plano', kind: 'note', x: 900, y: 100, width: 340, height: 240, element: { id: 'plano', kind: 'note', title: 'Plano' } },
  { id: 'ign', kind: 'flow', x: 50, y: 700, width: 280, height: 132, element: { id: 'ign', kind: 'flow', title: 'Relógio', flow: { type: 'ignition', schedule: 'interval', everyMinutes: 30 } } },
], edges: [] });
// Outra galáxia, fechada: o Sol não está nela, mas o main aplica lotes direto no arquivo.
const b = store.create('Projeto B', root).activeId;
store.setActive(a);
let win;
const send = (event, ...args) => { if (win && !win.isDestroyed()) win.webContents.send(event, ...args); };
const tokens = new Map();
const ptys = new PtyManager({ onData: (id, text) => send('pty:data', id, text), onExit: (id, code) => send('pty:exit', id, code) }, (id, token) => { tokens.set(id, token); return {}; });
const elements = new ElementService(data, store, {
  noteChanged: (id, value) => send('note:changed', id, value), tableChanged: (id, rows) => send('table:changed', id, rows), patch: (p) => send('canvas:patch', p),
  ops: (request) => send('canvas:ops', request), ui: (request) => send('canvas:ui', request), killTerminal: (id) => ptys.kill(id),
  startTerminal: (t) => { started.push(t.id); ptys.create({ id: t.id, command: t.command, cwd: t.cwd, cols: 120, rows: 32 }); },
});
const started = [];
let savedTasks = {};
const roles = new RoleStore(join(data, 'papeis'));
const solLog = new SolLog(join(data, 'registro'));
const control = new ControlServer(ptys, (id) => neighborhoodFromStore(store, id, (terminalId, canvasId) => suns.has(terminalId, canvasId)), {
  readNote: (id) => elements.readNote(id), writeNote: (id, c, f) => elements.writeNote(id, c, f), mediaPath: (f) => elements.mediaPath(f),
  importMedia: (p) => elements.importMedia(p), cleanup: (n) => elements.cleanup(n), addLinkedElement: (c, k, t, e) => elements.addLinkedElement(c, k, t, e),
  updateElement: (id, ch) => elements.updateElement(id, ch), readTable: (id) => elements.readTable(id), writeTable: (id, r, f) => elements.writeTable(id, r, f),
  web: () => null, runFlow: () => ({ ok: false }),
  canvasOf: (id) => elements.canvasOf(id), canvasOps: (c, ops, caller) => elements.canvasOps(c, ops, caller), accounts: () => [],
  ui: (c, action, target, value) => elements.ui(c, action, target, value),
  screenshot: async (c, target) => {
    const ready = await elements.ui(c, 'shot', target);
    if (!ready.ok) throw new Error(ready.error);
    const file = join(output, `print-${Date.now()}.png`);
    writeFileSync(file, (await win.webContents.capturePage()).toPNG());
    return file;
  },
  exportCanvas: (state, path, kinds) => writeCanvasArchive(path, state, kinds, elements),
  stopTerminal: (id) => { if (!ptys.has(id)) return false; ptys.kill(id); return true; },
  restartTerminal: () => false,
  roles, solLog, duplicateMedia: (f) => elements.duplicateMedia(f),
  // Para o teste, a outra galáxia faz o papel de um universo chamado "Outro".
  universeCanvas: (_caller, name) => (name.toLowerCase() === 'outro' ? { canvasId: b, dir: root } : null),
  savedTasks: () => savedTasks,
  tasksChanged: (all) => { savedTasks = all; send('tasks:changed', all); },
});
const pipe = `\\\\.\\pipe\\zenite-sol-qa-${process.pid}`;
let kills = 0;
const handlers = {
  'workspaces:list': () => store.list(),
  'workspaces:setActive': (_e, id) => store.setActive(id),
  'universes:setActive': (_e, id, uid) => store.setActiveUniverse(id, uid),
  'git:version': () => '2.0', 'git:state': () => ({ installed: true, isRepo: true, hasCommits: true, top: root, pending: 0 }),
  'attention:get': () => ({}), 'update:get': () => ({ status: 'dev' }),
  'canvas:load': (_e, id) => store.loadCanvas(id),
  'canvas:save': (_e, id, state) => store.saveCanvas(id, state),
  'canvas-clipboard:get': () => null,
  'note:read': (_e, id) => elements.readNote(id), 'table:read': (_e, id) => elements.readTable(id),
  'pty:cliTheme': () => null, 'pty:create': (_e, req) => ptys.create(req), 'pty:restart': (_e, req) => { restarts++; return ptys.restart(req); },
  'tasks:get': () => control.allTasks(),
};
let restarts = 0;
for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
ipcMain.on('canvas:saveNow', (e, id, state) => { store.saveCanvas(id, state); e.returnValue = true; });
ipcMain.on('canvas:mounted', (_e, id) => elements.setMounted(id));
ipcMain.on('canvas:opsResult', (_e, requestId, reply) => elements.opsReply(requestId, reply));
ipcMain.on('canvas:uiResult', (_e, requestId, reply) => elements.uiReply(requestId, reply));
ipcMain.on('note:write', (_e, id, value) => elements.writeNote(id, value, false));
ipcMain.on('element:removed', (_e, n) => elements.trash(n));
ipcMain.on('element:restored', (_e, n) => elements.untrash(n));
ipcMain.on('pty:write', (_e, id, text) => ptys.write(id, text));
ipcMain.on('pty:resize', (_e, id, cols, rows) => ptys.resize(id, cols, rows));
ipcMain.on('pty:kill', (_e, id) => { kills++; ptys.kill(id); });
ipcMain.on('table:write', (_e, id, rows) => elements.writeTable(id, rows, false));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (code) => win.webContents.executeJavaScript(code, true);
async function waitFor(code, label) {
  const end = Date.now() + 8000;
  while (Date.now() < end) { if (await js(code)) { console.log('OK: ' + label); return; } await delay(60); }
  throw Error('Timeout: ' + label);
}
/** Roda o zn como o terminal `as` (o Sol, por padrão). */
function zn(args, as = 'sol') {
  return new Promise((resolve) => {
    execFile(process.execPath, [cli, ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', O_PIPE: pipe, O_TERMINAL_ID: as, O_TOKEN: tokens.get(as) ?? '' } }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, out: stdout.trim(), err: stderr.trim() });
    });
  });
}
async function ok(args, as) {
  const r = await zn(args, as);
  if (r.code !== 0) throw Error(`zn ${args.join(' ')} falhou: ${r.err || r.out}`);
  console.log(`OK: zn ${args.join(' ')}`);
  return r.out;
}
const count = (sel) => js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const titleId = (title) => js(`(() => { const t=[...document.querySelectorAll('.react-flow__node')].find(n => n.querySelector('.node-title, .element-header input, .element-header span')?.textContent===${JSON.stringify(title)} || n.querySelector('.element-header input')?.value===${JSON.stringify(title)}); return t?.dataset.id ?? null; })()`);
async function snapshot(name) {
  win.webContents.invalidate(); await delay(250);
  writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
app.whenReady().then(async () => {
  try {
    await control.listen(pipe);
    const visible = process.argv.includes('--visible');
    win = new BrowserWindow({ width: 1400, height: 900, show: visible, webPreferences: { preload: join(root, 'out/preload/index.js'), contextIsolation: true, sandbox: false, webviewTag: true, backgroundThrottling: false, offscreen: !visible } });
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await waitFor("document.querySelectorAll('.react-flow__node').length===3 && !!document.querySelector('.xterm')", 'canvas carregado');
    const end = Date.now() + 5000;
    while (!tokens.has('sol') && Date.now() < end) await delay(50);

    let out = await ok(['canvas']);
    assert.match(out, /"Sol" \[terminal\]/);
    assert.match(out, /"Plano" \[nota\]/);

    out = await ok(['recruit', 'Revisor', '--agent', 'shell']);
    assert.match(out, /Criado: terminal "Revisor"/);
    await waitFor("document.querySelectorAll('.react-flow__node .xterm').length===2", 'Revisor aberto na tela');
    await waitFor("document.querySelectorAll('.react-flow__edge').length===1", 'Revisor ligado ao Sol');

    await ok(['node', 'create', 'nota', 'Ideias', '--near', 'Plano', '--side', 'abaixo', '--text', 'uma ideia']);
    await waitFor("[...document.querySelectorAll('.react-flow__node textarea')].some(t => t.value==='uma ideia')", 'nota nova com o texto');
    await ok(['connect', 'Ideias', 'Revisor']);
    await ok(['flow', 'create', 'gemeos', 'Decide', '--near', 'Ideias', '--config', '{"condition":{"op":"contains","value":"OK"}}']);
    const refused = await zn(['connect', 'Decide', 'Plano']);
    assert.match(refused.err, /várias saídas/, 'astro com duas saídas pede --output');
    await ok(['connect', 'Decide', 'Plano', '--output', 'a']);
    await waitFor("document.querySelectorAll('.react-flow__edge').length===3", 'três ligações na tela');
    await ok(['draw', 'seta', '--from', 'Sol', '--to', 'Plano', '--stroke', '#1971c2']);
    await ok(['draw', 'quadro', 'Equipe', '--around', 'Sol;Revisor']);
    await ok(['draw', 'texto', 'Sprint 1', '--near', 'Plano', '--side', 'acima', '--font-size', '36']);
    await waitFor("document.querySelectorAll('.react-flow__node-draw').length===3", 'seta, quadro e texto desenhados');
    out = await ok(['canvas', 'show', 'Decide']);
    assert.equal(JSON.parse(out).node.element.flow.condition.value, 'OK');
    await snapshot('01-montado');

    // Mover um elemento leva a seta presa nele
    await ok(['node', 'move', 'Plano', '--by', '0,200']);
    const saved = store.loadCanvas(a);
    const arrow = saved.nodes.find((n) => n.draw?.shape === 'arrow');
    const plano = saved.nodes.find((n) => n.id === 'plano');
    const tip = { x: arrow.x + arrow.draw.points[1][0] * arrow.width, y: arrow.y + arrow.draw.points[1][1] * arrow.height };
    assert.ok(tip.y >= plano.y - 30 && tip.y <= plano.y + plano.height + 30, 'a ponta da seta acompanhou a nota');
    console.log('OK: a seta acompanhou a nota');

    // Ctrl+Z desfaz o que o Sol fez, um comando por vez
    const before = await count('.react-flow__node');
    await ok(['node', 'delete', 'Ideias']);
    await waitFor(`document.querySelectorAll('.react-flow__node').length===${before - 1}`, 'Ideias apagada');
    await js('document.activeElement?.blur()');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Z', modifiers: ['control'] });
    await waitFor("[...document.querySelectorAll('.react-flow__node textarea')].some(t => t.value==='uma ideia')", 'Ctrl+Z traz de volta a nota apagada pelo Sol');

    // Quem não é Sol não mexe no canvas
    const revisorId = saved.nodes.find((n) => n.terminal?.title === 'Revisor').id;
    const denied = await zn(['canvas'], revisorId);
    assert.match(denied.err, /Só o Sol/);
    console.log('OK: terminal comum não mexe no canvas');
    // ... e o Sol não se apaga
    assert.match((await zn(['node', 'delete', 'Sol'])).err, /não pode se apagar/);

    // Status por tarefa: o terminal põe o selo, o Sol vê no zn canvas
    await ok(['status', 'trabalhando', 'revisando o login'], revisorId);
    await waitFor("document.querySelector('.task-chip')?.textContent.includes('Trabalhando')", 'selo aparece no terminal');
    assert.match(await ok(['canvas']), /"Revisor" \[terminal\].*trabalhando: revisando o login/);

    // Terminal: editar cor, parar e reiniciar
    await ok(['terminal', 'edit', 'Revisor', '--color', '#e03131', '--font-size', '16']);
    assert.equal(store.loadCanvas(a).nodes.find((n) => n.id === revisorId).terminal.appearance.color, '#e03131');
    await ok(['terminal', 'stop', 'Revisor']);
    await waitFor(`!${JSON.stringify(revisorId)} || true`, 'pedido de parar aceito');
    const stoppedEnd = Date.now() + 3000;
    while (ptys.has(revisorId) && Date.now() < stoppedEnd) await delay(50);
    assert.ok(!ptys.has(revisorId), 'zn terminal stop encerra o processo');
    await ok(['terminal', 'restart', 'Revisor']);
    const restartEnd = Date.now() + 5000;
    while (!ptys.has(revisorId) && Date.now() < restartEnd) await delay(50);
    assert.ok(ptys.has(revisorId) && restarts >= 1, 'zn terminal restart abre de novo pela tela');
    assert.match((await zn(['terminal', 'stop', 'Sol'])).err, /não pode/);

    // Tela: organizar, enquadrar, visão resumida, fundo, print, exportar, registro
    const before2 = await js(`Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map(e=>[e.dataset.id,e.style.transform]))`);
    await ok(['canvas', 'arrange']);
    await delay(400);
    assert.notDeepEqual(await js(`Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map(e=>[e.dataset.id,e.style.transform]))`), before2, 'organizar mexeu nas posições');
    await ok(['canvas', 'fit', 'Plano']);
    await ok(['canvas', 'summary', 'on']);
    await waitFor("document.querySelector('.canvas').classList.contains('summary')", 'visão resumida ligada');
    await ok(['canvas', 'summary', 'off']);
    await waitFor("!document.querySelector('.canvas').classList.contains('summary')", 'visão resumida desligada');
    await ok(['canvas', 'background', 'grid']);
    assert.match((await zn(['canvas', 'background', 'xadrez'])).err, /Fundo desconhecido/);
    const shot = await ok(['canvas', 'screenshot', 'Plano']);
    assert.ok(existsSync(shot.trim()), 'o print foi salvo');
    const exported = join(output, 'sol-export.zenite');
    assert.match(await ok(['canvas', 'export', exported, '--kinds', 'nota,terminal']), /exportad/);
    assert.ok(existsSync(exported), 'o .zenite foi gravado');
    assert.match(await ok(['canvas', 'log']), /Sol: criou terminal "Revisor"/);

    // Duplicar uma nota leva o texto
    await ok(['node', 'duplicate', 'Ideias']);
    const copy = store.loadCanvas(a).nodes.find((n) => n.element?.title === 'Ideias 2');
    assert.ok(copy, 'cópia criada com nome novo');
    assert.equal(elements.readNote(copy.id), 'uma ideia', 'a cópia levou o texto');

    // Pausar e voltar a Ignição
    await ok(['flow', 'pause', 'Relógio']);
    assert.equal(store.loadCanvas(a).nodes.find((n) => n.id === 'ign').element.flow.paused, true);
    await waitFor("[...document.querySelectorAll('.react-flow__node-flow')].some(n => n.textContent.includes('Pausada'))", 'astro mostra Pausada');
    await ok(['flow', 'resume', 'Relógio']);
    assert.equal(store.loadCanvas(a).nodes.find((n) => n.id === 'ign').element.flow.paused, false);

    // Papéis salvos: recrutar com papel manda o texto quando o terminal fica quieto
    await ok(['role', 'save', 'Testador', 'Você é o testador. Responda com OK-PAPEL.']);
    assert.match(await ok(['role', 'list']), /"Testador"/);
    assert.match(await ok(['role', 'show', 'testador']), /OK-PAPEL/);
    await ok(['recruit', 'Testador', '--agent', 'shell', '--role', 'Testador']);
    const testador = store.loadCanvas(a).nodes.find((n) => n.terminal?.title === 'Testador');
    const roleEnd = Date.now() + 20000;
    let screen = '';
    while (Date.now() < roleEnd) { screen = (await ptys.snapshot(testador.id, 40)) ?? ''; if (screen.includes('OK-PAPEL')) break; await delay(300); }
    assert.match(screen, /OK-PAPEL/, 'o papel chegou como primeira mensagem');
    console.log('OK: papel entregue quando o terminal ficou quieto');
    assert.match((await zn(['recruit', 'X', '--agent', 'shell', '--role', 'Inexistente'])).err, /não existe/);
    await ok(['role', 'delete', 'Testador']);

    // Canvas fechado: o lote vai direto no arquivo e o terminal novo já roda sem tela
    const closed = await elements.canvasOps(b, [{ op: 'create', kind: 'terminal', title: 'Fora da tela', terminal: { command: '', cwd: root } }]);
    assert.ok(closed.ok);
    assert.equal(store.loadCanvas(b).nodes.length, 1);
    assert.deepEqual(started, [closed.results[0].id], 'o terminal fora da tela já começou');
    assert.ok(ptys.has(closed.results[0].id));
    console.log('OK: canvas fechado recebe o lote e o terminal roda sem tela');

    // Copiar e mover para outro canvas: o conteúdo vai junto
    await ok(['node', 'copy', 'Ideias', '--to', 'Outro']);
    const copied = store.loadCanvas(b).nodes.find((n) => n.element?.title === 'Ideias');
    assert.ok(copied, 'a nota chegou no outro canvas');
    assert.equal(elements.readNote(copied.id), 'uma ideia', 'com o texto');
    await ok(['node', 'move', 'Ideias 2', '--to', 'Outro']);
    await waitFor("![...document.querySelectorAll('.react-flow__node textarea')].some(t => t.value==='uma ideia' && t.closest('.react-flow__node').querySelector('input, .node-title')?.value==='Ideias 2')", 'Ideias 2 saiu deste canvas');
    assert.ok(store.loadCanvas(b).nodes.some((n) => n.element?.title === 'Ideias 2'), 'Ideias 2 está no outro canvas');
    assert.ok(!store.loadCanvas(a).nodes.some((n) => n.element?.title === 'Ideias 2'), 'e não está mais aqui');
    assert.match((await zn(['node', 'copy', 'Sol', '--to', 'Outro'])).err, /Terminal não muda de canvas/);
    assert.match((await zn(['node', 'copy', 'Plano', '--to', 'Nenhum'])).err, /não existe nesta galáxia/);

    // Os selos ficam guardados (o Zênite fecha e abre de novo com eles)
    assert.equal(savedTasks[revisorId]?.state, 'trabalhando');

    await ok(['dismiss', 'Revisor']);
    await ok(['dismiss', 'Testador']);
    await waitFor("document.querySelectorAll('.react-flow__node .xterm').length===1", 'Revisor e Testador dispensados');
    assert.equal(kills, 2, 'dispensar encerra os terminais');
    await snapshot('02-final');
    // Espera os terminais reais (ConPTY) fecharem antes de sair; sair no meio derruba o processo no Windows.
    ptys.killAll(); control.close();
    await delay(1500);
    console.log(JSON.stringify({ ok: true, screenshots: output }));
    win.destroy(); app.quit();
  } catch (error) {
    console.error(error.stack);
    if (win) await snapshot('erro').catch(() => {});
    ptys.killAll(); control.close(); await delay(300); app.exit(1);
  }
});
