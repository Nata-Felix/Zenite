// Janela real do Zênite aberta já na visão resumida: os terminais iniciam sem precisar abrir
// cada círculo, e ao abrir aparece o que eles já escreveram (confira em out/summary-start).
const { app } = require('electron');
const { existsSync, mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/summary-start');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto');
for (const p of [project, join(profile, 'workspaces')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
const marker = id => join(profile, `iniciou-${id}.txt`);
const agent = join(profile, 'agente.cjs');
writeFileSync(agent, "require('fs').writeFileSync(process.argv[2], 'sim'); console.log('AGENTE ' + process.argv[3] + ' PRONTO'); setInterval(() => {}, 1e9);");
const term = (id, x) => ({ id, kind: 'terminal', x, y: 80, width: 560, height: 340, terminal: { id, title: `Agente ${id}`, command: `node '${agent}' '${marker(id)}' ${id}`, cwd: project } });
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Resumida', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [term('a', 0), term('b', 700)], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
// A preferência da visão resumida fica no localStorage: o script de pré-carga liga antes do app.
const seed = join(profile, 'seed.cjs');
writeFileSync(seed, "localStorage.setItem('o.summaryView', 'true');");
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 150; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  require('electron').session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed });
  try {
    win = await ready; win.show();
    await until("document.querySelector('.canvas.summary')", 'abriu já na visão resumida');
    for (let i = 0; i < 60 && !(existsSync(marker('a')) && existsSync(marker('b'))); i++) await delay(200);
    assert.ok(existsSync(marker('a')) && existsSync(marker('b')), 'os dois agentes iniciaram sem abrir os círculos');
    console.log('OK: os terminais iniciaram sem abrir os círculos');
    win.webContents.send('attention:jump', 'b');
    await until("document.querySelector('.summary-expanded-node[data-id=\"b\"]')", 'abriu o agente b');
    await delay(1500);
    // O terminal é desenhado em canvas: a saída reaproveitada aparece na captura 01-aberto.png.
    win.webContents.invalidate(); await delay(400);
    writeFileSync(join(dir, '01-aberto.png'), (await win.webContents.capturePage()).toPNG());
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
