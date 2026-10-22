// Janela real do Zênite: a função de cada terminal aparece no cabeçalho, na caixa de mensagem
// (lista de destinos) e no círculo da visão resumida; editar pelo painel muda em todos.
const { app } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/terminal-role');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto');
for (const p of [project, join(profile, 'workspaces')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
const idle = `node -e "setInterval(()=>{},1e9)"`;
const term = (id, title, x, extra = {}) => ({ id, kind: 'terminal', x, y: 60, width: 460, height: 260, terminal: { id, title, command: idle, cwd: project, ...extra } });
const nodes = [term('sol', 'Sol', 0, { sun: true }), term('c1', 'Claude', 500, { role: 'Frontend' }), term('c2', 'Claude 2', 1000, { role: 'Revisor', accountName: 'trabalho' })];
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Funções', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes, edges: [], viewport: { x: 20, y: 40, zoom: 0.85 } }));
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const shot = async name => { win.webContents.invalidate(); await delay(500); writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  try {
    win = await ready; win.show(); win.focus();
    await until("document.querySelectorAll('.role-chip').length === 2", 'função no cabeçalho dos dois Claude');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'K', modifiers: ['control'] });
    await until("document.querySelector('.composer')", 'caixa aberta');
    await js("document.querySelector('.composer-to').click()");
    await until("document.querySelector('.composer-menu.right')", 'lista de destinos');
    const list = await js("[...document.querySelectorAll('.composer-menu.right button')].map(b => b.innerText.replace(/\\s+/g, ' ').trim())");
    assert.ok(list.some(t => /Claude\s*Frontend/.test(t)), JSON.stringify(list));
    assert.ok(list.some(t => /Claude 2\s*Revisor\s*trabalho/.test(t)), JSON.stringify(list));
    console.log('OK: a lista de destinos diferencia os dois Claude pela função');
    await shot('01-destinos');
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
