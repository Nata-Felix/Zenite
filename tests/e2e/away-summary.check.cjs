// Janela real do Zênite: com a janela sem foco, um terminal pede atenção e põe o selo
// "pronto"; ao voltar (depois de 11 min, com o relógio adiantado no teste), aparece o
// painel "Enquanto você esteve fora" e clicar no terminal leva até ele.
const { app } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/away-summary-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto'), home = join(profile, 'home');
for (const p of [project, join(profile, 'workspaces'), join(home, '.agents/skills')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
require('node:os').homedir = () => home;
const cli = join(root, 'out/cli/index.js');
const agent = join(profile, 'agente.cjs');
writeFileSync(agent, `const { execFileSync } = require('node:child_process');
const zn = (...a) => execFileSync(process.execPath, [${JSON.stringify(cli)}, ...a]);
setTimeout(() => { zn('status', 'pronto', 'testes ok'); zn('notify', 'Terminei os testes, pode revisar?'); console.log('avisado'); }, 4000);
setInterval(() => {}, 1e9);`);
const terminal = { id: 'revisor', kind: 'terminal', x: 80, y: 80, width: 560, height: 320, terminal: { id: 'revisor', title: 'Revisor', command: `node '${agent}'`, cwd: project } };
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Loja', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false, notifyDone: false, notifyRequest: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [terminal], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 200; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const shot = async name => { win.webContents.invalidate(); await delay(300); writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    await delay(1500);
    win.emit('blur');
    await delay(7000); // o agente avisa enquanto a janela está sem foco
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60_000;
    win.emit('focus');
    await until("document.querySelector('.away-panel')", 'painel aparece ao voltar');
    const text = await js("document.querySelector('.away-panel').innerText");
    assert.match(text, /Enquanto você esteve fora/);
    assert.match(text, /Revisor/);
    assert.match(text, /Terminei os testes, pode revisar\?/);
    assert.match(text, /pronto · testes ok/);
    console.log('OK: pedido e selo do terminal no resumo');
    await js(`document.head.insertAdjacentHTML('beforeend','<style>*{animation:none!important}</style>')`);
    await delay(1200); await shot('01-resumo');
    await js("document.querySelector('.away-row').click()");
    await until("!document.querySelector('.away-panel')", 'clicar no terminal fecha o painel');
    Date.now = realNow;
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
