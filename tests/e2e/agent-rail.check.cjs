// Janela real do Zênite: o painel à esquerda lista só os terminais (o Sol primeiro, com
// função), clicar leva até o terminal, e as barras (terminais, galáxia, ferramentas e a de
// baixo) recolhem, mostram de novo e lembram a escolha ao recarregar.
const { app } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/agent-rail');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto');
for (const p of [project, join(profile, 'workspaces')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
const idle = `node -e "setInterval(()=>{},1e9)"`;
const term = (id, title, x, extra = {}) => ({ id, kind: 'terminal', x, y: 60, width: 460, height: 260, terminal: { id, title, command: idle, cwd: project, ...extra } });
const note = { id: 'n', kind: 'note', x: 0, y: 400, width: 300, height: 200, element: { id: 'n', kind: 'note', title: 'Briefing' } };
const nodes = [term('c1', 'Claude', 0, { role: 'Frontend' }), term('c2', 'Claude 2', 520, { role: 'Revisor' }), term('far', 'Testes', 4000), note];
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Painel', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes, edges: [], viewport: { x: 120, y: 60, zoom: 0.9 } }));
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const shot = async name => { win.webContents.invalidate(); await delay(500); writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
const inView = id => js(`(() => { const r = document.querySelector('[data-id="${id}"]').getBoundingClientRect(), p = document.querySelector('.react-flow').getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1; })()`);
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    await until("document.querySelectorAll('.agent-rail-item').length === 3", 'painel com os 3 terminais (sem a nota)');
    assert.deepEqual(await js("[...document.querySelectorAll('.agent-rail-name')].map(e => e.textContent)"), ['Frontend', 'Revisor', 'Testes']);
    await shot('01-painel');
    assert.equal(await inView('far'), false);
    await js("[...document.querySelectorAll('.agent-rail-item')].find(b => b.textContent.includes('Testes')).click()");
    await delay(800);
    assert.equal(await inView('far'), true, 'o terminal distante entrou na tela');
    console.log('OK: clicar no painel leva até o terminal');
    for (const [label, sel] of [['os terminais', '.agent-rail-item'], ['a barra da galáxia', '.universe-panel .bar-collapse ~ *, .universe-panel > :not(.bar-collapse)'], ['as ferramentas de desenho', '.draw-dock .draw-toolbar, .draw-dock [role=toolbar]'], ['a barra de ferramentas', '.dock']]) {
      await js(`document.querySelector('[aria-label="Recolher ${label}"]').click()`);
      await until(`document.querySelector('[aria-label="Mostrar ${label}"]')`, `recolheu ${label}`);
    }
    await shot('02-recolhido');
    await js('location.reload(); 0');
    await delay(2500);
    for (const label of ['os terminais', 'a barra da galáxia', 'as ferramentas de desenho', 'a barra de ferramentas']) {
      await until(`document.querySelector('[aria-label="Mostrar ${label}"]')`, `${label} continua recolhida ao recarregar`);
      await js(`document.querySelector('[aria-label="Mostrar ${label}"]').click()`);
      await until(`document.querySelector('[aria-label="Recolher ${label}"]')`, `${label} aparece de novo`);
    }
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
