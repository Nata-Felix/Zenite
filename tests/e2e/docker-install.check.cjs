// Janela real do Zênite: o ambiente isolado começa desligado e, ao ligar sem o Docker instalado,
// o app oferece instalar pelo WinGet. Recusar deixa desligado; aceitar instala e liga.
// O docker e o WinGet são substituídos: nada é instalado de verdade.
const childProcess = require('node:child_process');
const { app } = require('electron');
const { mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/docker-install-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto'), home = join(profile, 'home');
for (const p of [project, join(profile, 'workspaces'), join(home, '.agents/skills'), join(profile, 'ProgramFiles')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
process.env.ProgramFiles = join(profile, 'ProgramFiles'); // sem Docker Desktop na pasta padrão
require('node:os').homedir = () => home;
// Sem isolatedAgents: vale o padrão.
const index = { version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Teste do Docker', dir: project, universes: [] }], settings: { confirmQuit: false, agentGuide: false, notifyDone: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
const installs = [];
const realExecFile = childProcess.execFile;
childProcess.execFile = function (file, args, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  if (file === 'docker') { const e = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }); setImmediate(() => cb(e, '', '')); return; }
  if (/winget\.exe$/i.test(file)) { installs.push(args); setImmediate(() => cb(null, 'Instalado', '')); return; }
  return realExecFile.apply(this, arguments);
};
let win;
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const until = async (code, label) => { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const shot = async name => { win.webContents.invalidate(); await delay(300); writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
const click = code => js(`(${code}).click()`);
const button = text => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const toggle = `document.querySelector('[role=switch][aria-label="Executar terminais em ambiente isolado"]')`;
const saved = () => JSON.parse(readFileSync(join(profile, 'workspaces/index.json'), 'utf8')).settings?.isolatedAgents;
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', e => { if (e.level === 'error') console.error('renderer:', e.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    await delay(800);
    await js(`document.head.insertAdjacentHTML('beforeend','<style>*{animation:none!important;transition:none!important}</style>')`);
    await click(`document.querySelector('[title="Configurações"]')`);
    await until(button('Agentes'), 'configurações abertas');
    await click(button('Agentes'));
    await until(toggle, 'aba Agentes');
    assert.equal(await js(`${toggle}.getAttribute('aria-checked')`), 'false');
    console.log('OK: isolamento desligado por padrão');
    await shot('01-desligado');

    await click(toggle);
    await until("document.querySelector('.app-dialog h2')?.textContent === 'Instalar o Docker Desktop?'", 'oferece instalar o Docker');
    await shot('02-pergunta');
    await click(`[...document.querySelectorAll('.app-dialog button')].find(b => b.textContent === 'Agora não')`);
    await until("!document.querySelector('.app-dialog')", 'diálogo fecha ao recusar');
    await delay(300);
    assert.equal(await js(`${toggle}.getAttribute('aria-checked')`), 'false');
    assert.equal(installs.length, 0);
    assert.notEqual(saved(), true);
    console.log('OK: recusar deixa desligado e não instala');

    await click(toggle);
    await until("document.querySelector('.app-dialog')", 'pergunta de novo');
    await click(`[...document.querySelectorAll('.app-dialog button')].find(b => b.textContent === 'Instalar Docker')`);
    await until(`${toggle}.getAttribute('aria-checked') === 'true'`, 'aceitar instala e liga');
    assert.equal(installs.length, 1);
    assert.ok(installs[0].includes('Docker.DockerDesktop'));
    assert.equal(saved(), true);
    console.log('OK: WinGet chamado com Docker.DockerDesktop e opção gravada');
    await delay(300); await shot('03-ligado');
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
