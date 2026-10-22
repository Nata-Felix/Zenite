// Janela real do Zênite: "Organizar" arruma também o conteúdo de um Buraco negro fechado,
// entre os próprios membros, sem misturá-los com o resto do canvas.
const { app, session } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/black-hole-organize-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'project'), home = join(profile, 'home');
process.env.ZENITE_DATA_DIR = profile;
for (const p of [project, join(profile, 'workspaces'), join(profile, 'notes'), join(home, '.agents/skills')]) mkdirSync(p, { recursive: true });
require('node:os').homedir = () => home;
const note = (id, x, y) => ({ id, kind: 'note', x, y, width: 300, height: 200, element: { id, kind: 'note', title: id } });
// Membros espalhados de propósito: A e B longe um do outro, C empilhado sobre A.
const nodes = [
  note('Fora 1', 0, 0), note('Fora 2', 2000, 1500),
  note('A', 600, 600), note('B', 3000, 2600), note('C', 610, 610),
  { id: 'bh', kind: 'blackhole', x: 900, y: 0, width: 200, height: 210, element: { id: 'bh', kind: 'blackhole', title: 'Pasta', blackHole: { members: ['A', 'B', 'C'], collapsed: true } } },
];
const edges = [{ id: 'f1-bh', source: 'Fora 1', target: 'A' }, { id: 'a-b', source: 'A', target: 'B' }, { id: 'b-c', source: 'B', target: 'C' }];
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Organizar Buraco negro', dir: project }], settings: { confirmQuit: false, agentGuide: false, notifyDone: false } }));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes, edges }));
const seed = join(dir, 'seed.cjs'); writeFileSync(seed, "localStorage.setItem('o.summaryView','false');");
app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed }));
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const state = () => JSON.parse(readFileSync(join(profile, 'workspaces/qa.json'), 'utf8'));
const save = async () => { await js("window.dispatchEvent(new Event('zenite:flush-canvas'))"); await delay(150); return state(); };
const at = (s, id) => s.nodes.find(n => n.id === id);
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => w.webContents.once('did-finish-load', () => resolve(w))));
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    for (let i = 0; i < 100 && !(await js("!!document.querySelector('button[aria-label=\"Organizar todo o canvas\"]:not([disabled])')")); i++) await delay(100);
    await delay(500);
    await js("document.querySelector('button[aria-label=\"Organizar todo o canvas\"]').click()");
    await delay(800);
    const after = await save();
    const [a, b, c] = ['A', 'B', 'C'].map(id => at(after, id));
    assert.ok(!overlap(a, c) && !overlap(a, b) && !overlap(b, c), 'membros não ficam empilhados');
    const span = Math.max(a.x, b.x, c.x) - Math.min(a.x, b.x, c.x) + Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y);
    assert.ok(span < 2000, `membros organizados juntos (distância ${Math.round(span)})`);
    console.log('OK: conteúdo do Buraco negro fechado organizado');
    assert.deepEqual(at(after, 'bh').element.blackHole, { members: ['A', 'B', 'C'], collapsed: true });
    assert.deepEqual(after.edges, edges);
    console.log('OK: pasta continua fechada e ligações preservadas');
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
