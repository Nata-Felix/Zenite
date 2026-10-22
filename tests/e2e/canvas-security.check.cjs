// App real, perfil descartável; os terminais só gravam suas credenciais de TESTE para o próprio teste.
const { app, BrowserWindow } = require('electron');
const { join } = require('node:path');
const { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { request } = require('node:http');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/canvas-security-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-'));
process.env.ZENITE_DATA_DIR = profile;
const home = join(profile, 'home'), project = join(profile, 'projeto');
mkdirSync(join(home, '.agents/skills'), { recursive: true }); mkdirSync(project);
require('node:os').homedir = () => home;
mkdirSync(join(profile, 'workspaces'), { recursive: true });
const probe = join(dir, 'probe.cjs');
writeFileSync(probe, "require('node:fs').writeFileSync(process.argv[2], JSON.stringify({id:process.env.O_TERMINAL_ID,token:process.env.O_TOKEN,pipe:process.env.O_PIPE}));");
const nodes = ['sol', 'agent'].map((id, i) => ({ id, kind: 'terminal', x: 40 + i * 660, y: 100, width: 600, height: 350, terminal: { id, title: id, command: `node '${probe}' '${join(profile, id + '.json')}'`, cwd: project, ...(id === 'sol' ? { sun: true } : {}) } }));
const canvas = { version: 1, viewport: { x: 0, y: 0, zoom: 0.8 }, nodes, edges: [{ id: 'link', source: 'sol', target: 'agent' }] };
const indexFile = join(profile, 'workspaces/index.json'), canvasFile = join(profile, 'workspaces/qa.json');
writeFileSync(indexFile, JSON.stringify({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Teste de autorização do Sol', dir: project, universes: [] }], settings: { confirmQuit: false, agentPermissions: 'sandbox', notifyDone: false, notifyRequest: false } }));
writeFileSync(canvasFile, JSON.stringify(canvas));
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => w.webContents.once('did-finish-load', () => resolve(w))));
const delay = ms => new Promise(r => setTimeout(r, ms));
let win, guest;
let stage = 'inicialização';
const js = code => win.webContents.executeJavaScript(code, true);
async function until(predicate, label) {
  for (let i = 0; i < 180; i++) { if (await predicate()) return; await delay(100); }
  throw Error('Timeout: ' + label);
}
const call = (auth, path, body, id = auth.id) => new Promise((resolve, reject) => {
  const req = request({ socketPath: auth.pipe, path, method: 'POST', headers: { 'x-o-terminal': id, 'x-o-token': auth.token, 'content-type': 'application/json' } }, res => {
    const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
  }); req.on('error', reject); req.end(JSON.stringify(body));
});
async function run() {
  try {
    win = await ready; win.show();
    await until(() => existsSync(join(profile, 'sol.json')) && existsSync(join(profile, 'agent.json')), 'terminais de teste');
    const sol = JSON.parse(readFileSync(join(profile, 'sol.json'))), agent = JSON.parse(readFileSync(join(profile, 'agent.json')));
    assert.ok(!(await call(sol, '/list', {})).body.me.sun, 'Sol salvo exige nova promoção');
    assert.equal((await call(sol, '/canvas', { ops: [] })).status, 403);
    assert.equal((await call(agent, '/list', {}, 'sol')).status, 401, 'ID do Sol com token de outro terminal é recusado');
    stage = 'promoção';
    const promoted = await js(`window.o.pty.promoteSun(${JSON.stringify({ ...nodes[0].terminal, sun: true, cols: 80, rows: 24 })})`);
    assert.equal(promoted.ok, true);
    assert.equal((await call(sol, '/list', {})).body.me.sun, true);
    assert.equal((await call(agent, '/note', { action: 'create', title: 'indevida' })).status, 403);
    assert.equal((await call(agent, '/send', { to: 'sol', data: 'unsafe' })).status, 403);
    // Nem edição direta em disco nem save da marca pela interface concedem autoridade.
    const forged = structuredClone(canvas); forged.nodes[1].terminal.sun = true;
    writeFileSync(canvasFile, JSON.stringify(forged));
    assert.ok(!(await call(agent, '/list', {})).body.me.sun);
    stage = 'save';
    await js(`window.o.canvas.save('qa', ${JSON.stringify(forged)})`);
    assert.ok(!(await call(agent, '/list', {})).body.me.sun);
    await js(`window.o.pty.create(${JSON.stringify({ ...nodes[1].terminal, sun: true, cols: 80, rows: 24 })})`);
    assert.ok(!(await call(agent, '/list', {})).body.me.sun, 'marcar o pedido de criação de PTY não concede Sol');
    const badIndex = JSON.parse(readFileSync(indexFile)); badIndex.settings.agentPermissions = 'full';
    writeFileSync(indexFile, JSON.stringify(badIndex));
    assert.equal((await js('window.o.workspaces.list()')).settings.agentPermissions, 'sandbox');
    stage = 'outra janela';
    guest = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: join(root, 'out/preload/index.js') } });
    await guest.loadURL('about:blank');
    assert.equal(await guest.webContents.executeJavaScript(`window.o.pty.promoteSun(${JSON.stringify({ ...nodes[1].terminal, sun: true, cols: 80, rows: 24 })}).then(()=>false,()=>true)`), true, 'outra janela não promove Sol');
    assert.equal(await guest.webContents.executeJavaScript("window.o.canvas.load('qa').then(()=>false,()=>true)"), true, 'outra janela não lê o canvas');
    assert.equal(await guest.webContents.executeJavaScript("window.o.workspaces.list().then(()=>false,()=>true)"), true, 'outra janela não lê os dados internos');
    assert.equal(await guest.webContents.executeJavaScript("window.o.workspaces.setSettings({agentPermissions:'full'}).then(()=>false,()=>true)"), true, 'outra janela não muda permissões');
    assert.equal(await guest.webContents.executeJavaScript("window.o.elements.readSkill('qualquer').then(()=>false,()=>true)"), true, 'outra janela não lê skills pela ponte da interface');
    assert.equal(await guest.webContents.executeJavaScript("window.o.elements.useService('qualquer',{action:'test'}).then(()=>false,()=>true)"), true, 'outra janela não usa serviços pela ponte da interface');
    assert.equal(await guest.webContents.executeJavaScript("window.o.elements.pickSkill().then(()=>false,()=>true)"), true, 'outra janela não abre o seletor de skills');
    guest.destroy(); guest = null;
    await js(`window.o.pty.promoteSun(${JSON.stringify({ ...nodes[0].terminal, sun: false, cols: 80, rows: 24 })})`);
    assert.equal((await call(sol, '/canvas', { ops: [] })).status, 403, 'revogação tem efeito imediato');
    console.log('OK: app real: autenticação por sessão, nova promoção, criação restrita, falsificação em disco/save recusada, permissões preservadas, outra janela recusada e revogação imediata.');
    win.destroy(); app.quit();
  } catch (error) { console.error(stage + ': ' + error.message); if (guest && !guest.isDestroyed()) guest.destroy(); if (win) writeFileSync(join(dir, 'erro.png'), (await win.webContents.capturePage()).toPNG()); app.exit(1); }
}
run();
require(join(root, 'out/main/index.js'));
