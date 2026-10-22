// Caixa de mensagem com CLIs reais (usa as contas logadas do computador e gasta uma
// mensagem de cada): Ctrl+K abre a caixa mesmo com o foco no terminal, e uma imagem com
// texto chega como anexo ao Codex e ao Antigravity. Confira as capturas em out/composer-qa.
const { app } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const root = process.cwd(), dir = join(root, 'out/composer-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-'));
mkdirSync(join(profile, 'workspaces'), { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
const term = (id, title, command, x) => ({ id, kind: 'terminal', x, y: 40, width: 720, height: 520, terminal: { id, title, command, cwd: root } });
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Composer', dir: root, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false, notifyDone: false, agentPermissions: 'ask' } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [term('codex', 'Codex', 'codex', 20), term('agy', 'Antigravity', 'agy', 780)], edges: [], viewport: { x: 0, y: 0, zoom: 0.8 } }));
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const shot = async name => { win.webContents.invalidate(); await delay(400); writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => w.webContents.once('did-finish-load', () => resolve(w))));
app.whenReady().then(async () => {
  try {
    win = await ready; win.show(); win.setContentSize(1600, 900);
    await delay(25000); // os CLIs abrem e ficam prontos
    // Ctrl+K com o foco dentro do terminal do Codex.
    await js("document.querySelector('[data-id=\"codex\"] .xterm-helper-textarea')?.focus(); 0");
    win.focus();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'K', modifiers: ['control'] });
    await delay(800);
    console.log('caixa aberta:', await js("!!document.querySelector('.composer')"), '· destino:', await js("document.querySelector('.composer-to')?.innerText"));
    await shot('01-caixa');
    await js("document.querySelector('.composer-layer')?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); 0");
    const image = join(root, 'docs/images/thumb-gerada.jpg');
    const r = await js(`window.o.composer.send(${JSON.stringify((process.env.ZENITE_COMPOSER_TO || 'codex,agy').split(','))}, 'Responda só com o texto escrito em letras grandes nesta imagem.', [${JSON.stringify(image)}])`);
    console.log('envio:', JSON.stringify(r));
    await delay(4000); await shot('02-anexado');
    await delay(60000); await shot('03-respostas');
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
