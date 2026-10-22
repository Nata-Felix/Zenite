// Testa o Ctrl+Z do canvas no app de verdade: mover, remover (nota, tabela, terminal) e organizar.
const { app, BrowserWindow, ipcMain } = require('electron');
const { buildSync } = require('esbuild');
const { join } = require('node:path');
const { existsSync, mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd();
const output = join(root, 'out', 'canvas-undo-qa');
mkdirSync(output, { recursive: true });
const data = mkdtempSync(join(output, 'profile-'));
app.setPath('userData', data);
app.commandLine.appendSwitch('disable-gpu');
const bundle = join(root, 'out/test/undo-qa-main.cjs');
buildSync({ stdin: { contents: 'export * from "./src/main/ptyManager"; export * from "./src/main/workspaceStore"; export * from "./src/main/elements";', resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['@lydell/node-pty'], outfile: bundle, logLevel: 'silent' });
const { PtyManager, WorkspaceStore, ElementService } = require(bundle);
const store = new WorkspaceStore(data);
const a = store.list().activeId;
store.update(a, { name: 'Projeto A', dir: root });
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
let creates = 0, kills = 0;
const ptys = new PtyManager({ onData: (id, text) => send('pty:data', id, text), onExit: (id, code) => send('pty:exit', id, code) });
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
  'pty:cliTheme': () => null, 'pty:create': (_e, req) => { creates++; return ptys.create(req); },
  'pty:restart': (_e, req) => ptys.restart(req),
};
for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
ipcMain.on('canvas:saveNow', (e, id, state) => { store.saveCanvas(id, state); e.returnValue = true; });
ipcMain.on('canvas:mounted', (_e, id) => elements.setMounted(id));
ipcMain.on('note:write', (_e, id, value) => elements.writeNote(id, value, false));
ipcMain.on('table:write', (_e, id, rows) => elements.writeTable(id, rows, false));
ipcMain.on('element:removed', (_e, n) => elements.trash(n));
ipcMain.on('element:restored', (_e, n) => elements.untrash(n));
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
const center = (selector, left = false) => js(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('Ausente: '+${JSON.stringify(selector)}); const r=e.getBoundingClientRect();return {x:Math.round(${left} ? r.x+6 : r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`);
async function click(selector) {
  const p = await center(selector);
  for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, button: 'left', clickCount: 1, ...p });
  await delay(80);
}
async function drag(selector, dx, dy) {
  // Arrastar pelo depurador (o mesmo canal do F12): o sendInputEvent não segura o botão no modo offscreen.
  const p = await center(selector, true);
  const mouse = (type, x, y, extra = {}) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
  win.webContents.debugger.attach('1.3');
  await mouse('mouseMoved', p.x, p.y, { button: 'none' });
  await mouse('mousePressed', p.x, p.y, { buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    await mouse('mouseMoved', p.x + (dx * i) / 8, p.y + (dy * i) / 8, { buttons: 1 });
    await delay(30);
  }
  await mouse('mouseReleased', p.x + dx, p.y + dy, { buttons: 0, clickCount: 1 });
  win.webContents.debugger.detach();
  await delay(150);
}
async function key(letter) {
  await js('document.activeElement?.blur()');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: letter, modifiers: ['control'] });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: letter, modifiers: ['control'] });
  await delay(150);
}
const transform = (id) => js(`document.querySelector('[data-id="${id}"]')?.style.transform ?? null`);
const positions = () => js(`Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map(e=>[e.dataset.id,e.style.transform]))`);
async function snapshot(name) {
  win.webContents.invalidate(); await delay(200);
  writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
async function remove(id, closeSelector) {
  await click(`[data-id="${id}"] ${closeSelector}`);
  await waitFor("!!document.querySelector('.dialog .primary.danger')", `confirmação para remover ${id}`);
  await click('.dialog .primary.danger');
  await waitFor(`!document.querySelector('[data-id="${id}"]')`, `${id} removido`);
}
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ width: 1600, height: 1040, show: false, webPreferences: { preload: join(root, 'out/preload/index.js'), contextIsolation: true, sandbox: false, webviewTag: true, backgroundThrottling: false, offscreen: true } });
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await waitFor("document.querySelectorAll('.react-flow__node').length===4 && !!document.querySelector('.xterm')", 'canvas carregado');
    await delay(700);

    // Mover um elemento
    const before = await transform('note');
    await drag('[data-id="note"] .element-header', 220, 90);
    const moved = await transform('note');
    assert.notEqual(moved, before, 'a nota andou');
    await key('Z');
    await waitFor(`document.querySelector('[data-id="note"]').style.transform===${JSON.stringify(before)}`, 'Ctrl+Z devolve a nota ao lugar');
    await key('Y');
    await waitFor(`document.querySelector('[data-id="note"]').style.transform===${JSON.stringify(moved)}`, 'Ctrl+Y move de novo');
    await key('Z');
    await waitFor(`document.querySelector('[data-id="note"]').style.transform===${JSON.stringify(before)}`, 'Ctrl+Z outra vez');

    // Remover uma nota: o texto vai para a lixeira e volta com o Ctrl+Z
    await remove('note', '.element-close');
    assert.ok(!existsSync(elements.notePath('note')), 'o arquivo da nota saiu da pasta de notas');
    assert.ok(existsSync(join(elements.trashDir, 'notes', 'note.md')), 'o arquivo da nota está na lixeira');
    await key('Z');
    await waitFor(`document.querySelector('[data-id="note"] textarea')?.value==='Texto inicial'`, 'Ctrl+Z traz a nota com o texto');
    assert.ok(existsSync(elements.notePath('note')), 'o arquivo da nota voltou');
    await waitFor("document.querySelectorAll('.react-flow__edge').length===2", 'a ligação da nota voltou');

    // Remover uma tabela leva a ligação; o Ctrl+Z traz as duas
    await remove('table', '.element-close');
    await waitFor("document.querySelectorAll('.react-flow__edge').length===1", 'a ligação da tabela saiu');
    await key('Z');
    await waitFor("!!document.querySelector('[data-id=\"table\"]') && document.querySelectorAll('.react-flow__edge').length===2", 'Ctrl+Z traz a tabela e a ligação');
    assert.deepEqual(elements.readTable('table')[1], ['Valor preservado']);

    // Organizar e desfazer
    const layout = await positions();
    await js("window.dispatchEvent(new CustomEvent('zenite:command',{detail:'auto-layout-all'}))");
    await delay(500);
    assert.notDeepEqual(await positions(), layout, 'organizar mudou as posições');
    await key('Z');
    await delay(300);
    assert.deepEqual(await positions(), layout, 'Ctrl+Z desfaz a organização');
    console.log('OK: Ctrl+Z desfaz a organização');

    // Terminal fechado volta (com um shell novo); o Ctrl+Z nunca fecha um terminal aberto
    const createsBefore = creates;
    await remove('terminal', '.terminal-close');
    assert.equal(kills, 1, 'fechar o terminal encerra o processo');
    await key('Z');
    await waitFor("!!document.querySelector('[data-id=\"terminal\"] .xterm')", 'Ctrl+Z traz o terminal de volta');
    await waitFor("document.querySelectorAll('.react-flow__edge').length===2", 'as ligações do terminal voltaram');
    assert.equal(creates, createsBefore + 1, 'o terminal voltou com um shell novo');
    await key('Y');
    await delay(300);
    assert.ok(await js("!!document.querySelector('[data-id=\"terminal\"]')"), 'Ctrl+Y não fecha o terminal');
    assert.equal(kills, 1);

    await delay(700);
    const saved = store.loadCanvas(a);
    assert.equal(saved.nodes.length, 4, 'o canvas salvo tem os 4 nós');
    await snapshot('01-final');
    ptys.killAll();
    console.log(JSON.stringify({ ok: true, creates, kills, screenshots: output }));
    win.destroy(); app.quit();
  } catch (error) {
    console.error(error.stack);
    if (win) await snapshot('erro').catch(() => {});
    ptys.killAll(); await delay(300); app.exit(1);
  }
});
