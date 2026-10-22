const { app, BrowserWindow, clipboard, ipcMain } = require('electron');
// Terminal com o canvas em zoom: o mouse seleciona a linha que está debaixo dele, Ctrl+C copia e
// Ctrl+V cola. Perfil descartável e serviços simulados, como em node-options.check.cjs.
const { buildSync } = require('esbuild');
const { join } = require('node:path');
const { mkdirSync, mkdtempSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd();
const dir = join(root, 'out', 'terminal-mouse-qa');
mkdirSync(dir, { recursive: true });
app.setPath('userData', mkdtempSync(join(dir, 'profile-')));
app.commandLine.appendSwitch('disable-gpu');
buildSync({ entryPoints: [join(root, 'src/main/ptyManager.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['@lydell/node-pty'], outfile: join(root, 'out/test/qa-pty.cjs'), logLevel: 'silent' });
const { PtyManager } = require(join(root, 'out/test/qa-pty.cjs'));
let win;
const ptys = new PtyManager({
  onData: (id, data) => { if (win && !win.isDestroyed()) win.webContents.send('pty:data', id, data); },
  onExit: (id, code) => { if (win && !win.isDestroyed()) win.webContents.send('pty:exit', id, code); },
});
let canvas = { version: 1, viewport: { x: 40, y: 20, zoom: 0.6 }, nodes: [
  { id: 't1', kind: 'terminal', x: 50, y: 60, width: 900, height: 900, terminal: { id: 't1', title: 'Zoom', command: '', cwd: root } },
], edges: [] };
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Teste isolado', dir: root, settings: {} }] };
const handlers = {
  'workspaces:list': () => index, 'git:version': () => '2.0',
  'git:state': () => ({ installed: true, isRepo: true, hasCommits: true, top: root, pending: 0 }),
  'attention:get': () => ({}), 'update:get': () => ({ status: 'dev' }), 'canvas-clipboard:get': () => null,
  'canvas:load': () => canvas, 'canvas:save': (_e, _id, value) => { canvas = value; },
  'pty:cliTheme': () => null, 'pty:create': (_e, req) => ptys.create(req), 'pty:restart': (_e, req) => ptys.restart(req),
  'clipboard:read': () => clipboard.readText(), 'clipboard:write': (_e, text) => clipboard.writeText(text),
};
for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
ipcMain.on('canvas:saveNow', (e, _id, value) => { canvas = value; e.returnValue = true; });
ipcMain.on('pty:write', (_e, id, data) => ptys.write(id, data));
ipcMain.on('pty:resize', (_e, id, cols, rows) => ptys.resize(id, cols, rows));
ipcMain.on('pty:kill', (_e, id) => ptys.kill(id));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (code) => win.webContents.executeJavaScript(code, true);
async function waitFor(code, name, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(code)) { console.log('OK: ' + name); return; } await delay(100); }
  throw new Error(`Timeout: ${name}`);
}
/** Linhas que o terminal mostra (tela invisível do PtyManager, sem histórico rolado neste teste). */
const lines = async () => ((await ptys.snapshot('t1', 1000)) ?? '').split('\n');
/** Retângulo (na janela) da linha do terminal que contém o texto, calculado pela grade do xterm. */
async function rowRect(text) {
  const all = await lines();
  const row = all.findIndex((l) => l.trim() === text);
  if (row < 0) return null;
  const { rows, cols } = ptys.sessions.get('t1').screen;
  const s = await js(`(() => { const r = document.querySelector('.xterm-screen').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
  const h = s.height / rows;
  const cell = s.width / cols;
  return { left: s.left, right: s.left + text.length * cell, cell, y: s.top + (row + 0.5) * h };
}
const key = (keyCode, modifiers = []) => {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
};

app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ width: 1400, height: 1000, show: false, webPreferences: { preload: join(root, 'out/preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true } });
    await win.loadFile(join(root, 'out/renderer/index.html'));
    // SCREEN=720p|1080p: a tela dos cartões emulada (Configurações → Tela dos cartões).
    const screen = process.env.SCREEN || process.argv.find((a) => a.startsWith('--screen='))?.slice(9);
    if (screen) {
      await js(`localStorage.setItem('o.items', ${JSON.stringify(JSON.stringify({ screen }))})`);
      await win.webContents.reload();
    }
    await waitFor(`!!document.querySelector('.xterm-screen')`, 'terminal aberto');
    const zoom = await js(`(() => { const h = document.querySelector('.terminal-host'); return h.getBoundingClientRect().width / h.offsetWidth; })()`);
    if (screen) {
      const width = screen === '1080p' ? 1920 : 1280;
      const inner = await js(`(() => { const e = document.querySelector('.terminal-screen .screen-inner'); return { emulated: e.classList.contains('emulated'), width: e.offsetWidth }; })()`);
      assert.ok(inner.emulated && inner.width === width, `a tela do terminal devia ter ${width} px, veio ${JSON.stringify(inner)}`);
      await delay(800);
      const cols = ptys.sessions.get('t1').screen.cols;
      assert.ok(cols > (screen === '1080p' ? 180 : 115), `com ${screen} o terminal devia ganhar colunas, veio ${cols}`);
      console.log(`OK: tela ${screen}: ${width} px, ${cols} colunas, escala total ${zoom.toFixed(2)}`);
    } else {
      assert.ok(Math.abs(zoom - 0.6) < 0.02, `zoom do canvas deveria ser 0.6, veio ${zoom}`);
      console.log('OK: canvas em zoom ' + zoom.toFixed(2));
    }
    await delay(1500);
    ptys.write('t1', "1..25 | % { 'linha-{0:D2}' -f $_ }\r");
    for (let i = 0; i < 100 && !(await lines()).some((l) => l.trim() === 'linha-25'); i++) await delay(100);
    console.log('OK: saída na tela');
    await delay(400);

    // Arrasta o mouse por cima da linha 12, de ponta a ponta.
    const r = await rowRect('linha-12');
    assert.ok(r, 'linha-12 na tela');
    const y = Math.round(r.y);
    // Começa no primeiro quarto da primeira letra (com a tela reduzida, uma letra tem ~2 px).
    // Começo da primeira letra e fim da última (com a tela reduzida, uma letra tem ~2 px).
    const from = { x: Math.round(r.left + r.cell * 0.25), y };
    const to = { x: Math.round(r.right + r.cell * 0.5), y }; // depois da última letra só há espaço em branco
    win.webContents.sendInputEvent({ type: 'mouseMove', ...from });
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...from });
    for (let i = 1; i <= 8; i++) win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', x: Math.round(from.x + ((to.x - from.x) * i) / 8), y, modifiers: ['leftButtonDown'] });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...to });
    await delay(200);

    await clipboard.writeText('');
    key('C', ['control']);
    await delay(300);
    const copied = (await clipboard.readText()).trim();
    assert.equal(copied, 'linha-12', `com zoom, o mouse devia selecionar a linha debaixo dele; copiou ${JSON.stringify(copied)}`);
    console.log('OK: seleção com zoom pegou a linha certa e Ctrl+C copiou');

    await clipboard.writeText('echo colado-ok');
    key('V', ['control']);
    await delay(200);
    key('Return');
    for (let i = 0; i < 100 && !(await lines()).some((l) => l.trim() === 'colado-ok'); i++) await delay(100);
    assert.ok((await lines()).some((l) => l.trim() === 'colado-ok'), 'Ctrl+V devia colar o comando no terminal');
    console.log('OK: Ctrl+V colou no terminal');
    console.log(JSON.stringify({ ok: true }));
    ptys.killAll?.();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
