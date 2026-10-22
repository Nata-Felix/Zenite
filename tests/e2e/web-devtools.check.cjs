// Testa o "F12" dos sites para os agentes (zn web console|network|request|source|cookies) com uma
// página de verdade num servidor local: o zn de verdade, o servidor de controle e o depurador da página.
const { app, BrowserWindow, ipcMain, webContents } = require('electron');
const { buildSync } = require('esbuild');
const { execFile } = require('node:child_process');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { mkdirSync, mkdtempSync, readFileSync, existsSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd();
const output = join(root, 'out', 'web-devtools-qa');
mkdirSync(output, { recursive: true });
const data = mkdtempSync(join(output, 'profile-'));
app.setPath('userData', data);
app.commandLine.appendSwitch('disable-gpu');
const bundle = join(root, 'out/test/web-qa-main.cjs');
buildSync({ stdin: { contents: 'export * from "./src/main/ptyManager"; export * from "./src/main/workspaceStore"; export * from "./src/main/controlServer"; export * from "./src/main/canvasGraph"; export * from "./src/main/webDriver"; export * from "./src/main/webInspector";', resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['@lydell/node-pty', 'electron'], outfile: bundle, logLevel: 'silent' });
const cli = join(root, 'out/test/web-qa-cli.cjs');
buildSync({ entryPoints: [join(root, 'src/cli/index.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: cli, logLevel: 'silent' });
const { PtyManager, WorkspaceStore, ControlServer, neighborhoodFromStore, WebDriver, WebInspector } = require(bundle);

// Página de teste: um script que loga, avisa, busca dados, pede algo que não existe e quebra.
const PAGE = '<!doctype html><title>Loja</title><h1>Loja</h1><button id="comprar" style="position:fixed;right:40px;top:120px;width:200px;height:80px" onclick="console.log(`clicou ${innerWidth}`)">Comprar</button><script src="/app.js"></script>';
const SCRIPT = `console.log('carregou', { itens: 3 });
console.warn('estoque baixo');
fetch('/api/pedido', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ produto: 'caneca' }) })
  .then((r) => r.json()).then((d) => console.log('pedido', d.numero));
fetch('/api/nao-existe');
setTimeout(() => { throw new Error('quebrou no carrinho'); }, 50);`;
const server = createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': ['sessao=segredo123; HttpOnly; Path=/', 'tema=escuro; Path=/'] }); return res.end(PAGE); }
  if (req.url === '/app.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end(SCRIPT); }
  if (req.url === '/api/pedido') {
    let body = '';
    req.on('data', (c) => (body += c));
    return req.on('end', () => { res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ numero: 42, recebido: JSON.parse(body) })); });
  }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('não achei');
});

const store = new WorkspaceStore(data);
const a = store.list().activeId;
store.update(a, { name: 'Web', dir: root });
// Um agente comum (não é o Sol) ligado ao site: o F12 vale para quem está ligado.
store.saveCanvas(a, { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [
  { id: 'ag', kind: 'terminal', x: 0, y: 0, width: 600, height: 400, terminal: { id: 'ag', title: 'Agente', command: '', cwd: root } },
  { id: 'site', kind: 'web', x: 700, y: 0, width: 900, height: 600, element: { id: 'site', kind: 'web', title: 'Loja', url: '' } },
  { id: 'outro', kind: 'web', x: 700, y: 700, width: 900, height: 600, element: { id: 'outro', kind: 'web', title: 'Solto', url: '' } },
  { id: 'tela', kind: 'web', x: 0, y: 440, width: 600, height: 400, element: { id: 'tela', kind: 'web', title: 'Na tela', url: '' } },
], edges: [{ id: 'ag->site', source: 'ag', target: 'site' }, { id: 'ag->tela', source: 'ag', target: 'tela' }] });

// O mesmo que o index.ts faz com os sites do canvas: depurador ligado desde que o webview nasce.
const webViews = new Map();
const inspectors = new Map();
const inspectorFor = (wcId) => {
  const wc = webContents.fromId(wcId);
  if (!wc || wc.isDestroyed()) return null;
  if (!inspectors.has(wcId)) inspectors.set(wcId, new WebInspector(wc.debugger));
  return inspectors.get(wcId);
};
app.on('web-contents-created', (_e, wc) => { if (wc.getType() === 'webview') inspectorFor(wc.id)?.start().catch(() => {}); });
ipcMain.handle('web:inspectReady', async (_e, wcId) => { await Promise.race([inspectorFor(wcId)?.start().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]); });
ipcMain.on('web:register', (_e, nodeId, wcId) => { webViews.set(nodeId, wcId); inspectorFor(wcId)?.start().catch(() => {}); });
const handlers = {
  'workspaces:list': () => store.list(), 'workspaces:setActive': (_e, id) => store.setActive(id), 'universes:setActive': (_e, id, uid) => store.setActiveUniverse(id, uid),
  'git:version': () => '2.0', 'git:state': () => ({ installed: true, isRepo: true, hasCommits: true, top: root, pending: 0 }),
  'attention:get': () => ({}), 'update:get': () => ({ status: 'dev' }), 'canvas:load': (_e, id) => store.loadCanvas(id), 'canvas:save': (_e, id, st) => store.saveCanvas(id, st),
  'canvas-clipboard:get': () => null, 'pty:cliTheme': () => null, 'pty:create': (_e, req) => ptys.create(req), 'tasks:get': () => ({}),
};
for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
ipcMain.on('canvas:saveNow', (e, id, st) => { store.saveCanvas(id, st); e.returnValue = true; });
const tokens = new Map();
const ptys = new PtyManager({ onData() {}, onExit() {} }, (id, token) => (tokens.set(id, token), {}));
let win;
let inspector;
const control = new ControlServer(ptys, (id) => neighborhoodFromStore(store, id), {
  readNote: () => '', writeNote() {}, mediaPath: (f) => f, importMedia: () => null, cleanup() {}, addLinkedElement: () => null, updateElement() {}, readTable: () => [], writeTable() {},
  web: (id) => (id === 'site' ? new WebDriver(win.webContents) : webViews.has(id) ? new WebDriver(webContents.fromId(webViews.get(id))) : null),
  webInspect: (id) => (id === 'site' ? inspector : webViews.has(id) ? inspectorFor(webViews.get(id)) : null),
  runFlow: () => ({ ok: false }),
});
const pipe = `\\\\.\\pipe\\zenite-web-qa-${process.pid}`;
const zn = (...args) => new Promise((resolve) => execFile(process.execPath, [cli, ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', O_PIPE: pipe, O_TERMINAL_ID: 'ag', O_TOKEN: tokens.get('ag') } }, (err, stdout, stderr) => resolve({ code: err ? 1 : 0, out: stdout.trim(), err: stderr.trim() })));
async function ok(...args) {
  const r = await zn(...args);
  if (r.code) throw Error(`zn ${args.join(' ')} falhou: ${r.err || r.out}`);
  console.log(`OK: zn ${args.join(' ')}`);
  return r.out;
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
/** Clica com o mouse da janela do app no botão da página (como o usuário), descontando a redução da tela. */
async function clickButton(ui, guest, width, retry = true) {
  // Espera o site parar de mudar de tamanho na janela (a tela reduzida acabou de se montar).
  let last = 0;
  for (let i = 0; i < 30; i++) {
    const w = await ui.webContents.executeJavaScript(`document.querySelector('[data-id="tela"] webview').getBoundingClientRect().width`);
    if (Math.abs(w - last) < 0.5) break;
    last = w;
    await delay(200);
  }
  await delay(400);
  // Posição do botão como fração da página, vezes o tamanho do site na janela do app (vale para qualquer zoom).
  const button = await guest.executeJavaScript(`(() => { const r = document.getElementById('comprar').getBoundingClientRect(); return { fx: (r.left + r.width / 2) / innerWidth, fy: (r.top + r.height / 2) / innerHeight }; })()`);
  const view = await ui.webContents.executeJavaScript(`(() => { const r = document.querySelector('[data-id="tela"] webview').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
  const scale = view.width / Number(width);
  const at = { x: Math.round(view.left + button.fx * view.width), y: Math.round(view.top + button.fy * view.height) };
  // Pelo depurador da janela do app: no modo offscreen, o sendInputEvent não chega ao <webview>.
  const dbg = ui.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await dbg.sendCommand('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  }
  await delay(600);
  require('node:fs').writeFileSync(join(output, `clique-${width}.png`), (await ui.webContents.capturePage()).toPNG());
  const out = await ok('web', 'console', 'Na tela');
  // O primeiro clique logo depois de a tela mudar pode se perder no Chromium (não acontece com o usuário).
  if (retry && !new RegExp(`clicou ${width}`).test(out)) return clickButton(ui, guest, width, false);
  assert.match(out, new RegExp(`clicou ${width}`), `o clique (escala ${scale.toFixed(2)}, em ${at.x},${at.y}) devia chegar ao botão:\n${out.split('\n').slice(-4).join('\n')}`);
}

app.whenReady().then(async () => {
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    await control.listen(pipe);
    ptys.create({ id: 'ag', command: '', cwd: root, cols: 100, rows: 30 });
    win = new BrowserWindow({ width: 1000, height: 700, show: false, webPreferences: { offscreen: true } });
    // Como o Zênite faz: o depurador liga antes de a página carregar.
    // Como o site do canvas: nasce em branco, o depurador liga e só então o endereço carrega.
    await win.loadURL('about:blank');
    inspector = new WebInspector(win.webContents.debugger);
    await inspector.start();
    await win.loadURL(`${base}/`);
    await delay(800);

    let out = await ok('web', 'console', 'Loja');
    assert.match(out, /log\s+carregou \{itens: 3\}/, 'console.log com objeto');
    assert.match(out, /AVISO estoque baixo/);
    assert.doesNotMatch(out, /%c|font-weight/, 'o estilo %c não aparece');
    assert.doesNotMatch(out, /\(http[^)]*nao-existe\)\s+\(http/, 'o endereço do aviso não se repete');
    assert.match(out, /ERRO\s+\[não tratado\] Error: quebrou no carrinho/, `erro não tratado:\n${out}`);
    assert.match(out, /log\s+pedido 42/, 'log depois do fetch');
    assert.match(out, /\[navegador\].*404/, 'o navegador avisa do 404');
    out = await ok('web', 'console', 'Loja', '--errors');
    assert.doesNotMatch(out, /carregou/, '--errors só mostra erros e avisos');

    out = await ok('web', 'network', 'Loja');
    assert.match(out, /#\d+ GET 200 Document text\/html .*:\d+\/$/m, `a página inicial (carregamento inicial capturado):\n${out}`);
    assert.match(out, /#\d+ GET 200 Script .*\/app\.js/);
    assert.match(out, /#\d+ POST 201 Fetch .*\/api\/pedido/);
    assert.match(out, /#\d+ GET 404 Fetch .*\/api\/nao-existe/);
    out = await ok('web', 'network', 'Loja', '--failed');
    assert.match(out, /nao-existe/);
    assert.doesNotMatch(out, /app\.js/);
    const pedido = (await ok('web', 'network', 'Loja', '--filter', 'pedido')).match(/#(\d+) POST/)[1];

    out = await ok('web', 'request', 'Loja', pedido);
    assert.match(out, /Corpo enviado:\n\{"produto":"caneca"\}/, 'corpo do POST');
    assert.match(out, /Resposta:\n\{"numero":42,"recebido":\{"produto":"caneca"\}\}/, 'corpo da resposta');
    assert.match(out, /cookie: sessao=segredo123; tema=escuro/i, 'cabeçalho Cookie com o HttpOnly');
    const doc = (await ok('web', 'network', 'Loja', '--filter', 'Document')).match(/#(\d+) GET/)[1];
    assert.match(await ok('web', 'request', 'Loja', doc), /set-cookie: sessao=segredo123; HttpOnly/i, 'Set-Cookie HttpOnly na resposta');

    out = await ok('web', 'source', 'Loja');
    assert.match(out, /Script\s+http.*\/app\.js/);
    out = await ok('web', 'source', 'Loja', 'app.js');
    assert.match(out, /quebrou no carrinho/, 'código do script');
    const saved = join(output, 'pagina.html');
    await ok('web', 'source', 'Loja', `${base}/`, '--out', saved);
    assert.equal(readFileSync(saved, 'utf8'), PAGE, 'HTML salvo inteiro');
    assert.match((await zn('web', 'source', 'Loja', 'nada.css')).err, /Nenhum arquivo/);

    out = await ok('web', 'cookies', 'Loja');
    assert.match(out, /sessao=segredo123\s+\[HttpOnly\]/);
    assert.match(out, /tema=escuro\s+\[comum\]/);

    // Limpar e navegar de novo: só o novo aparece
    await ok('web', 'console', 'Loja', '--clear');
    await ok('web', 'network', 'Loja', '--clear');
    assert.match(await ok('web', 'console', 'Loja'), /vazio/);
    await ok('web', 'navigate', 'Loja', `${base}/`);
    await delay(800);
    out = await ok('web', 'console', 'Loja');
    assert.match(out, /----- Navegou para/);
    assert.match(out, /carregou/);

    // Quem não está ligado ao site não usa o F12 dele
    assert.match((await zn('web', 'console', 'Solto')).err, /não está ligado/);
    assert.match((await zn('web', 'request', 'Loja', '999')).err, /Não há requisição #999/);

    // ---- Na tela de verdade: o site do canvas nasce em branco, liga o F12 e só então carrega ----
    const canvas = store.loadCanvas(a);
    canvas.nodes.find((n) => n.id === 'tela').element.url = `${base}/`;
    store.saveCanvas(a, canvas);
    // Sem offscreen: nesse modo o mouse da janela não entra no <webview> (o clique do usuário não seria testado).
    const ui = new BrowserWindow({ width: 1400, height: 900, show: false, webPreferences: { preload: join(root, 'out/preload/index.js'), contextIsolation: true, sandbox: false, webviewTag: true } });
    await ui.loadFile(join(root, 'out/renderer/index.html'));
    const end = Date.now() + 15000;
    while (!webViews.has('tela') && Date.now() < end) await delay(100);
    assert.ok(webViews.has('tela'), 'o site do canvas se registrou');
    const wv = webContents.fromId(webViews.get('tela'));
    while (!wv.getURL().startsWith(base) && Date.now() < end) await delay(100);
    assert.equal(wv.getURL(), `${base}/`, 'o site carregou o endereço depois do about:blank');
    await delay(1200);
    out = await ok('web', 'network', 'Na tela');
    assert.match(out, /GET 200 Document .*:\d+\/$/m, `documento inicial na tela:
${out}`);
    assert.match(out, /GET 200 Script .*\/app\.js/, `script do carregamento inicial na tela:
${out}`);
    assert.match(await ok('web', 'console', 'Na tela'), /carregou \{itens: 3\}/);
    await delay(800);
    assert.equal(store.loadCanvas(a).nodes.find((n) => n.id === 'tela').element.url, `${base}/`, 'o about:blank não vira o endereço salvo');

    // Antes, na tela ajustada ao cartão: o clique do usuário no botão chega à página.
    await clickButton(ui, webContents.fromId(webViews.get('tela')), String(await webContents.fromId(webViews.get('tela')).executeJavaScript('innerWidth')));
    console.log('OK: clique na tela ajustada acertou o botão');

    // ---- Tela 1080p (Configurações → Tela dos cartões): a página vê 1920 px e o clique acerta ----
    await ui.webContents.executeJavaScript(`localStorage.setItem('o.items', ${JSON.stringify(JSON.stringify({ screen: '1080p' }))})`);
    webViews.delete('tela');
    await ui.webContents.reload();
    const end2 = Date.now() + 15000;
    while (!webViews.has('tela') && Date.now() < end2) await delay(100);
    const guest = webContents.fromId(webViews.get('tela'));
    while (!guest.getURL().startsWith(base) && Date.now() < end2) await delay(100);
    await delay(1000);
    assert.equal(await guest.executeJavaScript('innerWidth'), 1920, 'a página vê uma tela de 1920 px');
    console.log('OK: o site vê 1920 px de largura');
    await clickButton(ui, guest, '1920');
    console.log('OK: clique na tela reduzida acertou o botão');
    ui.destroy();

    console.log(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
  ptys.killAll();
  control.close();
  server.close();
  await delay(1200);
  app.exit(process.exitCode ?? 0);
});
