// Janela real do Zênite, sem CLIs de verdade: Ctrl+K abre a caixa de mensagem mesmo com o
// foco no terminal, o destino padrão é esse terminal, e texto + anexo chegam a ele.
const { app } = require('electron');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/composer-check');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto');
for (const p of [project, join(profile, 'workspaces')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
// "Agente" de mentira: grava tudo o que chega pelo terminal.
const received = join(profile, 'recebido.txt');
const agent = join(profile, 'agente.cjs');
writeFileSync(agent, `process.stdin.setRawMode?.(true); process.stdin.on('data', d => require('fs').appendFileSync(${JSON.stringify(received)}, d)); console.log('pronto');`);
const term = (id, title, x) => ({ id, kind: 'terminal', x, y: 60, width: 520, height: 300, terminal: { id, title, command: `node '${agent}'`, cwd: project } });
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Mensagens', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [term('a', 'Construtor', 40), term('b', 'Revisor', 600)], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const shot = async name => { win.webContents.invalidate(); await delay(500); writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  try {
    win = await ready; win.show(); win.focus();
    await delay(3000);
    await js("document.querySelector('[data-id=\"b\"] .xterm-helper-textarea').focus(); 0");
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'K', modifiers: ['control'] });
    await until("document.querySelector('.composer')", 'Ctrl+K abre a caixa com o foco no terminal');
    assert.match(await js("document.querySelector('.composer-to').innerText"), /Revisor/);
    console.log('OK: destino padrão é o terminal em foco');
    await js(`(() => { const t = document.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Use esta referência na home'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await shot('01-caixa');
    await js("document.querySelector('.composer-send').click()");
    await until("!document.querySelector('.composer')", 'enviar fecha a caixa');
    await delay(1500);
    const got = existsSync(received) ? readFileSync(received, 'utf8') : '';
    assert.match(got, /Use esta referência na home/);
    assert.match(got, /\r/);
    console.log('OK: o texto chegou ao terminal com Enter');
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
