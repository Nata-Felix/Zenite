// Janela real do Zênite com um agente que responde como o Codex: uma resposta simples não
// abre a caixa (só terminou); uma pergunta com opções abre, com a resposta formatada e as
// opções como botões; clicar numa opção manda a escolha ao agente.
const { app } = require('electron');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/composer-reply');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto');
for (const p of [project, join(profile, 'workspaces')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
const received = join(profile, 'recebido.txt');
const agent = join(root, 'tests/fixtures/reply-agent.cjs');
const node = { id: 'codex', kind: 'terminal', x: 60, y: 60, width: 640, height: 360, terminal: { id: 'codex', title: 'Construtor', command: `node '${agent}' '${received}'`, cwd: project } };
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Respostas', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false, notifyDone: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label, tries = 150) => { for (let i = 0; i < tries; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const shot = async name => { win.webContents.invalidate(); await delay(500); writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    await delay(2500);
    // Resposta sem pergunta: o agente só terminou, a caixa fica fechada.
    await js("window.o.composer.send(['codex'], 'status', [])");
    await delay(7000);
    assert.equal(await js("!!document.querySelector('.composer')"), false, 'não abre quando o agente só terminou');
    console.log('OK: resposta sem pergunta não abre a caixa');
    // Pergunta com opções: abre sozinha, formatada, com botões.
    await js("window.o.composer.send(['codex'], 'monte a home', [])");
    await until("document.querySelector('.composer-reply')", 'pergunta com opções abre a caixa');
    assert.equal(await js("document.querySelector('.composer-reply strong')?.textContent"), 'Qual você prefere?');
    const options = await js("[...document.querySelectorAll('.composer-choices button')].map(b => b.textContent)");
    assert.deepEqual(options, ['1 Hero grande com vídeo', '2 Grade de produtos']);
    assert.doesNotMatch(await js("document.querySelector('.composer-reply').innerText"), /Ask Codex|for shortcuts|GPT-6/);
    console.log('OK: resposta formatada, sem a moldura do CLI, e opções como botões');
    await shot('01-pergunta');
    await js("[...document.querySelectorAll('.composer-choices button')][1].click()");
    await until("!document.querySelector('.composer')", 'escolher fecha a caixa');
    await delay(1500);
    assert.match(readFileSync(received, 'utf8'), /2\. Grade de produtos/);
    console.log('OK: a escolha chegou ao agente');
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
