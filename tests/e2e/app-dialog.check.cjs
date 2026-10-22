// Janela real do Zênite: as perguntas do processo principal aparecem no diálogo do app, não na
// caixa do Windows, e os botões respondem. A abertura pelo sistema é registrada por um substituto.
const { app, dialog, shell } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/app-dialog-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto'), home = join(profile, 'home');
for (const p of [project, join(profile, 'workspaces'), join(home, '.agents/skills')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
require('node:os').homedir = () => home;
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Teste do diálogo', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false, notifyDone: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
const opened = [], native = [];
shell.openPath = async path => { opened.push(path); return ''; };
dialog.showMessageBox = async (_win, options) => { native.push(options); return { response: 0, checkboxChecked: false }; };
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const shot = async name => writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG());
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
const exe = 'C:\\Programas\\Teste\\app.exe';
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    await delay(800);
    await js(`window.__r1 = window.o.elements.openPath(${JSON.stringify(exe)}); 0`);
    await until("document.querySelector('.app-dialog h2')?.textContent === 'Executar app.exe?'", 'pergunta no diálogo do app');
    // A janela de teste não avança animações: sem elas a captura mostra o diálogo pronto.
    await js(`document.head.insertAdjacentHTML('beforeend','<style>*{animation:none!important}</style>')`); await delay(200); await shot('01-executar');
    await js(`[...document.querySelectorAll('.app-dialog button')].find(b => b.textContent === 'Cancelar').click()`);
    assert.equal(await js('window.__r1'), '');
    assert.equal(opened.length, 0);
    await until("!document.querySelector('.app-dialog')", 'diálogo fecha ao cancelar');
    await js(`window.__r2 = window.o.elements.openPath(${JSON.stringify(exe)}); 0`);
    await until("document.querySelector('.app-dialog')", 'pergunta de novo');
    await js(`[...document.querySelectorAll('.app-dialog button')].find(b => b.textContent === 'Executar').click()`);
    await js('window.__r2');
    assert.deepEqual(opened, [exe]);
    console.log('OK: Executar abre o programa');
    assert.equal(native.length, 0, 'a caixa do Windows não deve aparecer');
    console.log('OK: nenhuma caixa do Windows');
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack, 'native:', JSON.stringify(native.map(n => n.title)), 'dialogs:', await js('typeof window.o.dialogs').catch(String)); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
