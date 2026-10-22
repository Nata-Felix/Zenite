// Janela real do Zênite: um agente de mentira mostra uma pergunta com opções e pede atenção;
// a caixa de mensagem abre sozinha com ele de destino, mostra a tela e as opções como
// botões, e clicar numa opção responde no terminal. Com a opção desligada, não abre.
const { app } = require('electron');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/composer-wait');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto');
for (const p of [project, join(profile, 'workspaces')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
const received = join(profile, 'recebido.txt');
const agent = join(root, 'tests/fixtures/menu-agent.cjs');
const cli = join(root, 'out/cli/index.js');
const node = { id: 'codex', kind: 'terminal', x: 60, y: 60, width: 620, height: 360, terminal: { id: 'codex', title: 'Construtor', command: `node '${agent}' '${received}' '${cli}'`, cwd: project } };
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Espera', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false, notifyRequest: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 150; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const shot = async name => { win.webContents.invalidate(); await delay(500); writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    await until("document.querySelector('.composer-waiting')", 'a caixa abre sozinha quando o agente espera');
    const text = await js("document.querySelector('.composer').innerText");
    assert.match(text, /Construtor/);
    assert.match(text, /Posso rodar os testes\?/);
    assert.match(text, /Run this command\?/);
    const choices = await js("[...document.querySelectorAll('.composer-choices button')].map(b => b.textContent)");
    assert.deepEqual(choices, ['1. Yes, run command', '2. Yes, and always allow', '3. No, cancel']);
    console.log('OK: pedido, tela e opções na caixa');
    await shot('01-esperando');
    await js("[...document.querySelectorAll('.composer-choices button')].find(b => b.textContent.includes('No, cancel')).click()");
    await until("!document.querySelector('.composer')", 'escolher fecha a caixa');
    await delay(800);
    const got = existsSync(received) ? readFileSync(received, 'latin1') : '';
    assert.match(got, /ESCOLHIDO=3/, 'opção escolhida: ' + JSON.stringify(got));
    console.log('OK: a opção 3 foi escolhida no terminal');
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
