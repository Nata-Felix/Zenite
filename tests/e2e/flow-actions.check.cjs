// Janela real do Zênite. API e aplicativo são locais; abertura pelo sistema é registrada
// por um substituto para não abrir aplicativos pessoais. Comando executável roda de verdade.
const { app, dialog, session, shell } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, unlinkSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/flow-actions-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto'), home = join(profile, 'home');
for (const p of [project, join(profile, 'workspaces'), join(home, '.agents/skills')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
require('node:os').homedir = () => home;
const nodePath = execFileSync('where.exe', ['node'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/)[0];
const helper = join(project, 'app-teste.cjs'), marker = join(project, 'resultado.txt');
writeFileSync(helper, 'require("node:fs").writeFileSync(process.argv[2],process.argv[3]);console.log("Aplicativo executado: "+process.argv[3]);');
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Teste das ações · janela aberta', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentPermissions: 'full', agentGuide: false, notifyDone: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
const flow = (id, title, x, y, spec) => ({ id, kind: 'flow', x, y, width: 290, height: 160, element: { id, kind: 'flow', title, flow: spec } });
const nodes = [
  flow('c', 'Cronos · disparo automático', 50, 340, { type: 'chronos', paused: true, chronos: { mode: 'interval', value: 3, unit: 'seconds' } }),
  flow('i', '1. Ignição', 50, 80, { type: 'ignition', schedule: 'manual' }),
  flow('r', '2. Consultar API local', 410, 80, { type: 'request', http: { method: 'GET', url: 'http://127.0.0.1:1' } }),
  flow('t', '3. Preparar mensagem', 770, 80, { type: 'transform', transform: { operation: 'template', value: '{{entrada}}' } }),
  flow('a', '4. Executar aplicativo de teste', 770, 340, { type: 'launch', launch: { mode: 'command', path: nodePath, args: [helper, marker, '{{entrada}}'], waitForExit: true } }),
  { id: 'f', kind: 'file', x: 410, y: 340, width: 290, height: 270, element: { id: 'f', kind: 'file', title: 'Atalho conectado ao fluxo', path: helper } },
];
const edge = (source, target) => ({ id: source + '-' + target, source, target });
const state = { version: 1, nodes, edges: [edge('i', 'r'), edge('r', 't'), edge('t', 'a'), edge('i', 'f'), { ...edge('c', 'r'), sourceHandle: 'continue' }], viewport: { x: 10, y: 30, zoom: .82 } };
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify(state));
const seed = join(profile, 'seed.cjs'); writeFileSync(seed, "localStorage.setItem('o.summaryView','false');");
app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed }));
const errors = [], opened = [], confirmations = [];
shell.openPath = async path => { opened.push(path); return ''; };
process.env.ZENITE_NATIVE_DIALOGS = "1";
dialog.showMessageBox = async (_win, options) => { confirmations.push(options?.title); return { response: 0, checkboxChecked: false }; };
let win, calls = 0;
const server = createServer((_req, res) => { calls++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ mensagem: 'Olá do serviço local' })); }).listen(0, '127.0.0.1');
const listening = new Promise(resolve => server.once('listening', resolve));
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const click = async selector => { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(400); };
const shot = async name => writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG());
async function input(selector, text) {
  const point = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});e.focus();const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await win.webContents.debugger.sendCommand('Input.insertText', { text });
  await delay(250);
}
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error' && !e.message.includes('ResizeObserver')) errors.push(e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  try {
    await listening; win = await ready; win.show(); win.webContents.debugger.attach('1.3');
    await until("document.querySelectorAll('.react-flow__node').length===6", 'seis elementos conectados no Zênite');
    await click('[data-id="r"] button[title="Configurar"]');
    await input('.flow-dialog input[type=url]', `http://127.0.0.1:${server.address().port}/dados`);
    await shot('01-configurar-http'); await delay(1200); await click('.flow-dialog .primary');
    await click('[data-id="t"] button[title="Configurar"]');
    await input('.flow-dialog textarea', 'Mensagem: {{json.mensagem}}');
    await shot('02-configurar-transformacao'); await delay(1200); await click('.flow-dialog .primary');
    await click('[data-id="a"] button[title="Configurar"]');
    assert.equal(await js('document.querySelector(".flow-dialog textarea").value'), [helper, marker, '{{entrada}}'].join('\n'));
    await shot('03-configurar-aplicativo'); await delay(1200); await click('.flow-dialog .primary');
    await click('[data-id="f"] .file-flow-option input');
    await click('[data-id="i"] button[title="Executar a partir daqui"]');
    await until('document.querySelector("[data-id=a] .flow-status.ok")', 'Ignição → HTTP → dados → aplicativo concluído');
    assert.equal(readFileSync(marker, 'utf8'), 'Mensagem: Olá do serviço local');
    assert.deepEqual(opened, [helper]); assert.equal(calls, 1); assert.equal(confirmations.length, 0);
    await shot('04-fluxo-concluido'); await delay(1500);
    // Recusa e Sandbox: permissões são alteradas apenas neste perfil descartável.
    await js('window.o.workspaces.setSettings({agentPermissions:"ask"})');
    await click('[data-id="i"] button[title="Executar a partir daqui"]');
    await until('document.querySelector("[data-id=r] .flow-status.error")', 'Sempre perguntar: recusa impede HTTP');
    assert.ok(confirmations.length >= 2); assert.equal(calls, 1); assert.equal(opened.length, 1);
    await js('window.o.workspaces.setSettings({agentPermissions:"sandbox"})');
    const before = confirmations.length;
    await click('[data-id="i"] button[title="Executar a partir daqui"]'); await delay(800);
    assert.equal(calls, 1); assert.equal(confirmations.length, before); assert.equal(opened.length, 1);
    assert.match(await js('document.querySelector("[data-id=r] .flow-status").textContent'), /Sandbox/);
    await shot('05-sandbox-bloqueia');
    await click('[data-id="t"] button[title="Configurar"]');
    await input('.flow-dialog textarea', 'Transformação local {{entrada}}'); await click('.flow-dialog .primary');
    await click('[data-id="t"] button[title="Executar a partir daqui"]'); await delay(500);
    assert.ok(await js('document.querySelector("[data-id=t] .flow-status.ok")'), 'transformação local funciona no Sandbox');
    await js('window.o.workspaces.setSettings({agentPermissions:"full"})');
    await click('[data-id="t"] button[title="Configurar"]');
    await input('.flow-dialog textarea', 'Mensagem: {{json.mensagem}}'); await click('.flow-dialog .primary');
    await click('[data-id="f"] .file-flow-option input');
    await click('[data-id="i"] button[title="Executar a partir daqui"]'); await delay(1000);
    assert.equal(opened.length, 1, 'arquivo desativado não recebe abertura');
    assert.equal(readFileSync(marker, 'utf8'), 'Mensagem: Olá do serviço local');
    win.webContents.reload(); await delay(1500);
    await until('document.querySelector("[data-id=r] .flow-summary").textContent.includes("127.0.0.1")', 'configurações persistem ao recarregar');
    const priorCalls = calls;
    if (existsSync(marker)) unlinkSync(marker);
    await click('[data-id="c"] button[title="Configurar"]');
    await click('.flow-dialog .flow-check input'); await click('.flow-dialog .primary');
    for (let i = 0; i < 100 && !existsSync(marker); i++) await delay(100);
    assert.ok(existsSync(marker), 'Cronos dispara HTTP → transformação → aplicativo sem clique em Executar');
    assert.ok(calls > priorCalls);
    assert.equal(readFileSync(marker, 'utf8'), 'Mensagem: Olá do serviço local');
    await click('[data-id="c"] button[title="Configurar"]');
    await click('.flow-dialog .flow-check input'); await click('.flow-dialog .primary');
    await delay(700); const pausedCalls = calls; await delay(4000);
    assert.equal(calls, pausedCalls, 'pausar Cronos interrompe disparos seguintes');
    await shot('06-cronos-integrado');
    assert.deepEqual(errors, []);
    writeFileSync(join(dir, 'resultado.json'), JSON.stringify({ ok: true, profile, requests: calls, opened, confirmations, errors }, null, 2));
    console.log('PASS: janela real, configuração, conexões, dados, aplicativo, permissões e Cronos automático com pausa');
    server.close();
    if (process.argv.includes('--keep-open')) return;
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); server.close(); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
