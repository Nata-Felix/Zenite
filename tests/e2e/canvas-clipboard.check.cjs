// Testa atalhos reais, dados persistidos e terminais em trânsito sem abrir os dados do usuário.
const { app, BrowserWindow, ipcMain } = require('electron');
const { buildSync } = require('esbuild');
const { join } = require('node:path');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd();
const output = join(root, 'out', 'canvas-clipboard-qa');
mkdirSync(output, { recursive: true });
const data = mkdtempSync(join(output, 'profile-'));
app.setPath('userData', data);
app.commandLine.appendSwitch('disable-gpu');
const bundle = join(root, 'out/test/clipboard-qa-main.cjs');
buildSync({ stdin: { contents: 'export * from "./src/main/ptyManager"; export * from "./src/main/canvasClipboard"; export * from "./src/main/workspaceStore"; export * from "./src/main/elements";', resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['@lydell/node-pty'], outfile: bundle, logLevel: 'silent' });
const { PtyManager, CanvasClipboard, WorkspaceStore, ElementService } = require(bundle);
const store = new WorkspaceStore(data);
const a = store.list().activeId;
store.update(a, { name: 'Projeto A', dir: root });
const b = store.create('Projeto B', root).activeId;
store.addUniverse(a, { id: 'universe', name: 'Paralelo', branch: '', path: root, worktree: '', isolated: false }, false);
store.setActive(a);
const node = (id, kind, title, x, y, width, height) => ({ id, kind, x, y, width, height, ...(kind === 'terminal' ? { terminal: { id, title, command: '', cwd: root, appearance: { color: '#4fd1a5' } } } : { element: { id, kind, title } }) });
store.saveCanvas(a, { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [
  node('terminal', 'terminal', 'Agente', 50, 135, 500, 250),
  node('note', 'note', 'Nota', 750, 135, 340, 250),
  node('table', 'table', 'Tabela', 50, 480, 360, 200),
  { id: 'draw', kind: 'draw', x: 650, y: 500, width: 190, height: 110, draw: { shape: 'rectangle', stroke: 'auto', fill: '#4fd1a5', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 0, opacity: 100, seed: 1 } },
], edges: [{ id: 't-n', source: 'terminal', target: 'note' }, { id: 'tab-t', source: 'table', target: 'terminal' }] });
let win;
const send = (event, ...args) => { if (win && !win.isDestroyed()) win.webContents.send(event, ...args); };
const elements = new ElementService(data, store, { noteChanged: (id, value) => send('note:changed', id, value), tableChanged: (id, rows) => send('table:changed', id, rows), patch: (p) => send('canvas:patch', p) });
elements.writeNote('note', 'Texto inicial', false);
elements.writeTable('table', [['Nome'], ['Valor preservado']], false);
let clipboard = new CanvasClipboard(data, store, elements);
let captures = 0, kills = 0;
const exits = new Set();
const ptys = new PtyManager({ onData: (id, text) => send('pty:data', id, text), onExit: (id, code) => { exits.add(id); send('pty:exit', id, code); } });
const transfer = (fn) => {
  try { const result = fn(); send('canvas-clipboard:changed', clipboard.state()); return result; }
  catch (e) { return { ok: false, error: e.message }; }
};
const handlers = {
  'workspaces:list': () => store.list(),
  'workspaces:setActive': (_e, id) => store.setActive(id),
  'universes:setActive': (_e, id, uid) => store.setActiveUniverse(id, uid),
  'git:version': () => '2.0', 'git:state': () => ({ installed: true, isRepo: true, hasCommits: true, top: root, pending: 0 }),
  'attention:get': () => ({}), 'update:get': () => ({ status: 'dev' }),
  'canvas:load': (_e, id) => store.loadCanvas(id),
  'canvas:save': (_e, id, state) => store.saveCanvas(id, state),
  'canvas-clipboard:get': () => clipboard.state(),
  'canvas-clipboard:capture': (_e, id, state, ids, mode) => { captures++; return transfer(() => clipboard.capture(id, state, ids, mode)); },
  'canvas-clipboard:paste': (_e, id, state, at) => transfer(() => clipboard.paste(id, state, at)),
  'canvas-clipboard:clear': (_e, id, state) => transfer(() => clipboard.clear(id, state)),
  'note:read': (_e, id) => elements.readNote(id), 'table:read': (_e, id) => elements.readTable(id),
  'pty:cliTheme': () => null, 'pty:create': (_e, req) => ptys.create(req),
  'pty:restart': (_e, req) => ptys.restart(req),
};
for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
ipcMain.on('canvas:saveNow', (e, id, state) => { store.saveCanvas(id, state); e.returnValue = true; });
ipcMain.on('canvas:mounted', (_e, id) => elements.setMounted(id));
ipcMain.on('note:write', (_e, id, value) => elements.writeNote(id, value, false));
ipcMain.on('table:write', (_e, id, rows) => elements.writeTable(id, rows, false));
ipcMain.on('pty:write', (_e, id, text) => ptys.write(id, text));
ipcMain.on('pty:resize', (_e, id, cols, rows) => ptys.resize(id, cols, rows));
ipcMain.on('pty:kill', (_e, id) => { kills++; ptys.kill(id); });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (code) => win.webContents.executeJavaScript(code, true);
async function waitFor(code, label) {
  const end = Date.now() + 8000;
  while (Date.now() < end) { if (await js(code)) { console.log('OK: ' + label); return; } await delay(60); }
  throw Error('Timeout: ' + label);
}
async function click(selector) {
  const p = await js(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('Ausente: '+${JSON.stringify(selector)}); const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`);
  for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, button: 'left', clickCount: 1, ...p });
  await delay(80);
}
async function key(letter) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: letter, modifiers: ['control'] });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: letter, modifiers: ['control'] });
  await delay(100);
}
async function snapshot(name) {
  win.webContents.invalidate(); await delay(200);
  writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ width: 1600, height: 1040, show: false, webPreferences: { preload: join(root, 'out/preload/index.js'), contextIsolation: true, sandbox: false, webviewTag: true, backgroundThrottling: false, offscreen: true } });
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await waitFor("document.querySelectorAll('.react-flow__node').length===4 && !!document.querySelector('.xterm')", 'canvas carregado');
    await delay(700);
    const pid = ptys.roots()[0].pid;
    ptys.write('terminal', 'echo sessao-preservada\r');
    await click('[data-id="note"] textarea');
    await js(`(() => {const e=document.querySelector('[data-id="note"] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Última tecla preservada');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await key('A'); await key('C');
    assert.equal(captures, 0, 'atalhos em campo de texto não copiam elementos');
    assert.equal(await js("document.querySelectorAll('.react-flow__node.selected').length"), 1, 'Ctrl+A no texto não seleciona o canvas');
    await click('[data-id="note"] .element-header');
    await key('C');
    await waitFor("document.querySelector('.canvas-clipboard-label')?.textContent.includes('para copiar')", 'Ctrl+C copia o elemento');
    await key('V');
    await waitFor("document.querySelectorAll('.react-flow__node').length===5", 'Ctrl+V cola uma cópia');
    const copy = store.loadCanvas(a).nodes.find((n) => n.element?.title === 'Nota - cópia');
    assert.ok(copy);
    assert.equal(elements.readNote(copy.id), 'Última tecla preservada');
    assert.equal(elements.readNote('note'), 'Última tecla preservada');
    await snapshot('01-copia');
    // A colagem enquadra a seleção; volta a enquadrar o canvas antes de clicar no terminal.
    await js("document.activeElement?.blur(); document.querySelector('.react-flow__pane').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await js("window.dispatchEvent(new CustomEvent('zenite:command',{detail:'fit-view'}))");
    await delay(350);
    await click('[data-id="terminal"] .terminal-header');
    await key('X');
    await waitFor("!document.querySelector('[data-id=\"terminal\"]')", 'Ctrl+X tira o terminal da origem');
    assert.equal(ptys.roots()[0].pid, pid, 'recortar mantém o processo');
    assert.deepEqual(store.loadCanvas(a).edges, []);
    await click('.universe-chip:not(.origin):not(.add)');
    await waitFor("document.querySelectorAll('.react-flow__node').length===0", 'universo paralelo aberto');
    await key('V');
    await waitFor("!!document.querySelector('[data-id=\"terminal\"] .xterm')", 'terminal movido ao universo');
    assert.equal(ptys.roots()[0].pid, pid);
    assert.equal(store.loadCanvas('universe').nodes[0].terminal.title, 'Agente');
    assert.match(await ptys.snapshot('terminal'), /sessao-preservada/);
    await snapshot('02-universo');
    await click('[data-id="terminal"] .terminal-header');
    await key('X');
    await waitFor("!document.querySelector('[data-id=\"terminal\"]')", 'segundo recorte');
    await click('.workspace-item[title^="Projeto B"]');
    await waitFor("document.querySelector('.galaxy-name')?.textContent==='Projeto B'", 'outro workspace aberto');
    await key('V');
    await waitFor("!!document.querySelector('[data-id=\"terminal\"] .xterm')", 'terminal movido entre workspaces');
    assert.equal(ptys.roots()[0].pid, pid);
    assert.equal(store.loadCanvas('universe').nodes.length, 0);
    assert.equal(kills, 0);
    await snapshot('03-workspace');
    await click('[data-id="terminal"] .terminal-header');
    await key('X');
    await waitFor("!document.querySelector('[data-id=\"terminal\"]')", 'recorte pendente');
    clipboard = new CanvasClipboard(data, store, elements);
    await win.webContents.reload();
    await waitFor("!!document.querySelector('.canvas-clipboard-actions')", 'recorte recuperado após recarregar');
    await js("[...document.querySelectorAll('.canvas-clipboard button')].find(e=>e.textContent==='Desfazer recorte').click()");
    await waitFor("!!document.querySelector('[data-id=\"terminal\"] .xterm')", 'desfazer recorte devolve o terminal');
    assert.equal(ptys.roots()[0].pid, pid);
    await click('.workspace-item[title^="Projeto A"]');
    await waitFor("document.querySelector('.galaxy-name')?.textContent==='Projeto A'", 'voltar ao workspace de origem');
    // A galáxia A estava no universo vazio. Volta à Origem pelo botão real.
    await click('.universe-chip.origin');
    await waitFor("document.querySelectorAll('.react-flow__node').length===4", 'Origem reaberta');
    await js('document.activeElement?.blur()');
    await key('A');
    await waitFor("document.querySelectorAll('.react-flow__node.selected').length===4", 'Ctrl+A seleciona notas, tabela e desenho');
    await key('C');
    assert.equal(clipboard.state().count, 4);
    await snapshot('04-tudo-selecionado');
    await click('.workspace-item[title^="Projeto B"]');
    await waitFor("document.querySelector('.galaxy-name')?.textContent==='Projeto B'", 'destino da seleção aberto');
    await key('V');
    await waitFor("document.querySelectorAll('.react-flow__node.selected').length===4 && document.querySelectorAll('.react-flow__node').length===5", 'seleção colada em outro workspace');
    assert.equal(kills, 0);
    assert.equal(ptys.roots()[0].pid, pid);
    await delay(600);
    assert.equal(store.loadCanvas(b).nodes.length, 5);
    await snapshot('05-colagem-multipla');
    exits.clear(); ptys.killAll();
    const end = Date.now() + 3000;
    while (!exits.has('terminal') && Date.now() < end) await delay(50);
    console.log(JSON.stringify({ ok: true, captures, preservedPid: pid, killsDuringMoves: kills, screenshots: output }));
    win.destroy(); app.quit();
  } catch (error) {
    console.error(error.stack);
    if(win) await snapshot('erro').catch(()=>{});
    ptys.killAll(); await delay(300); app.exit(1);
  }
});
