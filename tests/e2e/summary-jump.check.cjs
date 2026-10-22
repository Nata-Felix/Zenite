// Janela real do Zênite na visão resumida: com um terminal aberto, ir até outro (Ver no canvas,
// notificação) fecha o aberto e abre o novo no centro, em vez de enquadrar a posição escondida.
const { app } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/summary-jump');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto');
for (const p of [project, join(profile, 'workspaces')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
const term = (id, title, x) => ({ id, kind: 'terminal', x, y: 80, width: 560, height: 340, terminal: { id, title, command: '', cwd: project } });
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Resumida', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [term('a', 'Claude Code', 0), term('b', 'Antigravity', 1400)], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const shot = async name => { win.webContents.invalidate(); await delay(500); writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
const centerOf = id => js(`(() => { const r = document.querySelector('[data-id="${id}"]').getBoundingClientRect(), p = document.querySelector('.react-flow').getBoundingClientRect(); return { dx: Math.round(r.x + r.width / 2 - (p.x + p.width / 2)), dy: Math.round(r.y + r.height / 2 - (p.y + p.height / 2)) }; })()`);
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    await delay(1500);
    await js("localStorage.setItem('o.summaryView', 'true'); location.reload(); 0");
    await delay(2500);
    await until("document.querySelector('.canvas.summary')", 'visão resumida');
    win.webContents.send('attention:jump', 'a');
    await until("document.querySelector('.summary-expanded-node[data-id=\"a\"]')", 'Claude Code aberto');
    await delay(600);
    win.webContents.send('attention:jump', 'b');
    await until("document.querySelector('.summary-expanded-node[data-id=\"b\"]') && !document.querySelector('.summary-expanded-node[data-id=\"a\"]')", 'ir ao Antigravity fecha o Claude Code e abre o Antigravity');
    await delay(700);
    const c = await centerOf('b');
    assert.ok(Math.abs(c.dx) < 40 && Math.abs(c.dy) < 40, 'Antigravity centralizado: ' + JSON.stringify(c));
    console.log('OK: o novo fica no centro');
    await shot('01-antigravity');
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
