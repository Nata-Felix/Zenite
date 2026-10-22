const { app, BrowserWindow, ipcMain } = require('electron');
// Integração real da interface e do PTY, com serviços do app simulados e perfil descartável.
// Não carrega as galáxias reais nem instala guias/skills nas pastas do usuário.
const { buildSync } = require('esbuild');
const { join } = require('node:path');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd();
const dir = join(root, 'out', 'node-options-qa');
mkdirSync(dir, { recursive: true });
app.setPath('userData', mkdtempSync(join(dir, 'profile-')));
app.commandLine.appendSwitch('disable-gpu');
buildSync({ entryPoints: [join(root, 'src/main/ptyManager.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['@lydell/node-pty'], outfile: join(root, 'out/test/qa-pty.cjs'), logLevel: 'silent' });
const { PtyManager } = require(join(root, 'out/test/qa-pty.cjs'));
let win;
let creates = 0, restarts = 0;
const errors = [];
const exits = new Set();
const ptys = new PtyManager({
  onData: (id, data) => { if (win && !win.isDestroyed()) win.webContents.send('pty:data', id, data); },
  onExit: (id, code) => { exits.add(id); if (win && !win.isDestroyed()) win.webContents.send('pty:exit', id, code); },
});
const node = (id, kind, title, x, y, width, height, extra = {}) => ({ id, kind, x, y, width, height, ...(kind === 'terminal' ? { terminal: { id, title, command: '', cwd: root, ...extra } } : { element: { id, kind, title, ...extra } }) });
let canvas = { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [
  node('t1', 'terminal', 'Shell principal', 50, 135, 480, 240),
  node('t2', 'terminal', 'Outro CLI', 750, 135, 460, 240),
  node('note', 'note', 'Especificações', 50, 450, 280, 180),
  node('site', 'web', 'Site de teste', 390, 450, 400, 240, { url: 'about:blank' }),
  node('table', 'table', 'Tabela de teste', 850, 450, 350, 180),
], edges: [{ id: 'in', source: 'note', target: 't1' }, { id: 'out', source: 't1', target: 'table' }] };
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Teste isolado', dir: root, settings: {} }] };
const handlers = {
  'workspaces:list': () => index, 'git:version': () => '2.0',
  'git:state': () => ({ installed: true, isRepo: true, hasCommits: true, top: root, pending: 0 }),
  'attention:get': () => ({}), 'update:get': () => ({ status: 'dev' }),
  'canvas-clipboard:get': () => null,
  'canvas:load': () => canvas, 'canvas:save': (_e, _id, value) => { canvas = value; },
  'note:read': () => '# Referência\nConteúdo preservado', 'table:read': () => [['Nome', 'Valor'], ['Teste', '1']],
  'pty:cliTheme': () => null, 'pty:create': (_e, req) => { creates++; return ptys.create(req); },
  'pty:restart': (_e, req) => { restarts++; return ptys.restart(req); },
};
for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
ipcMain.on('canvas:saveNow', (e, _id, value) => { canvas = value; e.returnValue = true; });
ipcMain.on('pty:write', (_e, id, data) => ptys.write(id, data));
ipcMain.on('pty:resize', (_e, id, cols, rows) => ptys.resize(id, cols, rows));
ipcMain.on('pty:kill', (_e, id) => ptys.kill(id));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (code) => win.webContents.executeJavaScript(code, true);
async function waitFor(code, name, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(code)) { console.log('OK: ' + name); return; } await delay(80); }
  throw new Error(`Timeout: ${name}`);
}
async function click(selector, modifiers = []) {
  const point = await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw Error('Elemento ausente: ' + ${JSON.stringify(selector)}); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  if (modifiers.includes('control')) win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Control' });
  win.webContents.sendInputEvent({ type: 'mouseMove', ...point, modifiers });
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point, modifiers });
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point, modifiers });
  if (modifiers.includes('control')) win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Control' });
  await delay(100);
}
async function button(text) {
  await js(`(() => { const e = [...document.querySelectorAll('.node-options button')].find(e => e.textContent.trim() === ${JSON.stringify(text)}); if (!e) throw Error('Botão ausente: ' + ${JSON.stringify(text)}); e.click(); })()`);
  await delay(120);
}
async function screenshot(name) {
  win.webContents.invalidate();
  await delay(250);
  writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
async function input(selector, value) {
  await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${selector.includes('select') ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event(${selector.includes('select') ? "'change'" : "'input'"}, { bubbles: true })); })()`);
  await delay(80);
}
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ width: 1600, height: 1040, show: false, webPreferences: { preload: join(root, 'out/preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, webviewTag: true, backgroundThrottling: false, offscreen: true } });
    win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await waitFor("document.querySelectorAll('.terminal-host .xterm').length === 2", 'terminais');
    await delay(800);
    await click('[data-id="t1"] .terminal-host');
    await waitFor("!!document.querySelector('.node-options')", 'painel após clicar no conteúdo');
    assert.equal(await js("document.querySelectorAll('.node-options-actions button').length"), 5, 'Editar, Reload, Sol, Constelação e Linhas');
    await screenshot('01-opcoes');
    const originalPid = ptys.roots().find((r) => r.id === 't1').pid;
    const peerPid = ptys.roots().find((r) => r.id === 't2').pid;
    await button('Editar');
    await input('.node-options input', 'Meu terminal');
    await click('.node-options button[aria-label="Verde"]');
    await input('.terminal-font-fields label:last-child select', '18');
    await input('.node-options-detail form > label:last-of-type select', 'dracula');
    await screenshot('02-editar');
    await button('Salvar');
    await waitFor("document.querySelector('[data-id=\"t1\"] .node-title').textContent === 'Meu terminal'", 'nome salvo');
    assert.equal(ptys.roots().find((r) => r.id === 't1').pid, originalPid, 'editar mantém o processo');
    assert.equal(await js("getComputedStyle(document.querySelector('[data-id=\"t1\"] .terminal-host')).backgroundColor"), 'rgb(40, 42, 54)');
    await button('Constelação2');
    assert.equal(await js("document.querySelectorAll('.constellation-list li').length"), 2);
    assert.match(await js("document.querySelector('.constellation-list').textContent"), /Especificações/);
    await screenshot('03-constelacao');
    await button('Linhas');
    await waitFor("!!document.querySelector('.quick-connection')", 'linha temporária');
    const sitePoint = await js("(() => {const r=document.querySelector('[data-id=\"site\"] .web-host').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
    win.webContents.sendInputEvent({ type: 'mouseMove', ...sitePoint });
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...sitePoint });
    win.webContents.debugger.detach();
    await delay(150);
    await waitFor("!!document.querySelector('.quick-connection rect')", 'linha acompanha o cursor e destaca o destino');
    await screenshot('04-linha');
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...sitePoint });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...sitePoint });
    await waitFor("document.querySelectorAll('.react-flow__edge').length === 3 && !document.querySelector('.quick-connection')", 'conexão pelo corpo do site');
    await button('Linhas');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await waitFor("!document.querySelector('.quick-connection') && !document.body.classList.contains('canvas-busy')", 'Esc cancela');
    await button('Linhas');
    await input('.line-destination select', 't2');
    await button('Conectar');
    await waitFor("document.querySelectorAll('.react-flow__edge').length === 4", 'conexão por lista');
    await button('Reload');
    await waitFor("!document.querySelector('.node-options-actions button:disabled')", 'reload concluído');
    assert.equal(restarts, 1);
    assert.notEqual(ptys.roots().find((r) => r.id === 't1').pid, originalPid);
    assert.equal(ptys.roots().find((r) => r.id === 't2').pid, peerPid, 'reload não mexe no outro terminal');
    await delay(700);
    assert.equal(await js("document.querySelector('[data-id=\"t1\"] .status-dot').classList.contains('alive')"), true);
    assert.equal(canvas.nodes.find((n) => n.id === 't1').terminal.appearance.fontSize, 18);
    assert.equal(canvas.edges.length, 4);
    assert.equal(canvas.nodes.find((n) => n.id === 't1').reloadVersion, undefined);
    await screenshot('05-final');
    await win.webContents.reload();
    await waitFor("document.querySelector('[data-id=\"t1\"] .node-title')?.textContent === 'Meu terminal'", 'reabrir aparência e nome');
    await delay(600);
    assert.equal(restarts, 1, 'reabrir a tela não reinicia a sessão');
    assert.equal(await js("getComputedStyle(document.querySelector('[data-id=\"t1\"] .terminal-host')).backgroundColor"), 'rgb(40, 42, 54)');
    await js("document.documentElement.dataset.theme='dark'");
    await click('[data-id="t1"] .terminal-host');
    await screenshot('06-escuro');
    await js("document.documentElement.dataset.theme='light'");
    await screenshot('07-claro');
    await button('Constelação4');
    await click('.constellation-list button[title="Ir até Especificações"]');
    await waitFor("document.querySelector('.react-flow__node.selected')?.dataset.id === 'note'", 'ir até uma conexão');
    assert.equal(await js("document.querySelectorAll('.node-options-actions button').length"), 2, 'outros elementos oferecem Constelação e Linhas');
    await button('Linhas');
    await input('.line-destination select', 't2');
    await button('Conectar');
    await waitFor("document.querySelectorAll('.react-flow__edge').length === 5", 'conexão iniciada por uma nota');
    await delay(600);
    assert.equal(canvas.edges.length, 5);
    const positions = () => Object.fromEntries(canvas.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const beforeLayout = positions();
    const beforeEdges = structuredClone(canvas.edges);
    const beforePids = ptys.roots();
    await screenshot('08-antes-organizar');
    await click('.dock button[aria-label="Organizar todo o canvas"]');
    await waitFor("!document.querySelector('.dock button[aria-label=\"Desfazer organização\"]').disabled", 'organização automática disponível para desfazer');
    await delay(850);
    assert.ok(canvas.nodes.find((n) => n.id === 'note').x < canvas.nodes.find((n) => n.id === 't1').x);
    assert.ok(canvas.nodes.find((n) => n.id === 't1').x < canvas.nodes.find((n) => n.id === 'table').x);
    for (const [i, a] of canvas.nodes.entries()) for (const b of canvas.nodes.slice(i + 1)) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${a.id} sobrepõe ${b.id}`);
    assert.deepEqual(canvas.edges, beforeEdges);
    assert.deepEqual(ptys.roots(), beforePids, 'organizar não reinicia terminais');
    await screenshot('09-organizado');
    await click('.dock button[aria-label="Desfazer organização"]');
    await delay(850);
    assert.deepEqual(positions(), beforeLayout, 'desfazer devolve as posições originais');
    await click('.dock button[title="Enquadrar tudo"]');
    await delay(350);
    await click('[data-id="t1"] .terminal-header');
    await click('[data-id="t2"] .terminal-header', ['control']);
    await waitFor("document.querySelectorAll('.react-flow__node.selected').length === 2", 'seleção parcial');
    const beforeSelectionLayout = positions();
    await click('.selection-bar button[aria-label="Organizar seleção automaticamente"]');
    await delay(850);
    for (const id of ['note', 'site', 'table']) assert.deepEqual(positions()[id], beforeSelectionLayout[id], 'organizar seleção mantém os outros no lugar');
    assert.ok(canvas.nodes.find((n) => n.id === 't1').x < canvas.nodes.find((n) => n.id === 't2').x);
    await screenshot('10-selecao-organizada');
    await click('.dock button[aria-label="Desfazer organização"]');
    await delay(850);
    assert.deepEqual(positions(), beforeSelectionLayout);
    await js('document.activeElement?.blur()');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'O', modifiers: ['control', 'alt'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'O', modifiers: ['control', 'alt'] });
    await waitFor("!document.querySelector('.dock button[aria-label=\"Desfazer organização\"]').disabled", 'atalho Ctrl+Alt+O organiza a seleção');
    assert.deepEqual(ptys.roots(), beforePids);
    assert.deepEqual(errors, []);
    // Deixa o ConPTY concluir os callbacks antes de encerrar o processo do Electron.
    exits.clear();
    ptys.killAll();
    const end = Date.now() + 3000;
    while (exits.size < 2 && Date.now() < end) await delay(50);
    console.log(JSON.stringify({ ok: true, creates, restarts, edges: canvas.edges.length, screenshots: dir }));
    win.destroy(); app.quit();
  } catch (error) {
    console.error(error.stack, errors);
    if (win) await screenshot('erro').catch(() => {});
    ptys.killAll(); app.exit(1);
  }
});
