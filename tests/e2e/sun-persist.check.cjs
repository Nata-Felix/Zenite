// Janela real do Zênite, aberta duas vezes com o mesmo perfil: o terminal promovido a Sol
// pela interface volta como Sol ao reabrir; marcar sun no arquivo do canvas não promove ninguém.
//   1ª execução (sem ZENITE_SUN_PROFILE): promove "Construtor" e fecha.
//   2ª execução (ZENITE_SUN_PROFILE=<perfil da 1ª>): confere que o Sol voltou.
const { app } = require('electron');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/sun-persist');
mkdirSync(dir, { recursive: true });
const second = !!process.env.ZENITE_SUN_PROFILE;
const profile = process.env.ZENITE_SUN_PROFILE || mkdtempSync(join(dir, 'profile-'));
const project = join(profile, 'projeto');
process.env.ZENITE_DATA_DIR = profile;
if (!second) {
  for (const p of [project, join(profile, 'workspaces')]) mkdirSync(p, { recursive: true });
  const idle = `node -e "setInterval(()=>{},1e9)"`;
  const term = (id, title, x) => ({ id, kind: 'terminal', x, y: 60, width: 460, height: 260, terminal: { id, title, command: idle, cwd: project } });
  const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Sol', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false } };
  writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
  writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [term('a', 'Construtor', 0), term('b', 'Intruso', 520)], edges: [], viewport: { x: 20, y: 40, zoom: 0.9 } }));
}
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    await delay(2500);
    if (!second) {
      // Promove pela interface (painel do terminal) e fecha; depois força sun no arquivo do outro.
      const header = await js("(()=>{const r=document.querySelector('[data-id=\"a\"] .terminal-header').getBoundingClientRect();return{x:r.x+40,y:r.y+10}})()");
      win.webContents.sendInputEvent({ type: 'mouseDown', x: header.x, y: header.y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x: header.x, y: header.y, button: 'left', clickCount: 1 });
      await until("document.querySelector('button[title^=\"Promover a Sol\"]')", 'painel do terminal aberto');
      await js("document.querySelector('button[title^=\"Promover a Sol\"]').click()");
      await until("document.querySelector('button[aria-pressed=\"true\"][title^=\"Tirar o Sol\"]')", 'Construtor promovido a Sol');
      await delay(1500); // o registro é gravado na promoção; encerrar sem o fechamento normal cobre uma queda
      const file = join(profile, 'workspaces/qa.json');
      const state = JSON.parse(readFileSync(file, 'utf8'));
      state.nodes.find(n => n.id === 'b').terminal.sun = true;
      writeFileSync(file, JSON.stringify(state));
      console.log('PERFIL=' + profile);
      app.exit(0);
      return;
    }
    // Confere pelo processo principal: quem tem a autoridade de Sol.
    const solA = await js("window.o.composer.targets().then(l => l.find(t => t.id === 'a')?.sun)");
    const solB = await js("window.o.composer.targets().then(l => l.find(t => t.id === 'b')?.sun)");
    assert.equal(solA, true, 'o Construtor voltou como Sol');
    assert.equal(solB, false, 'sun escrito no arquivo não promove o Intruso');
    console.log('OK: o Sol voltou ao reabrir, e o sun do arquivo foi ignorado');
    win.webContents.invalidate(); await delay(500);
    writeFileSync(join(dir, '01-reaberto.png'), (await win.webContents.capturePage()).toPNG());
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
