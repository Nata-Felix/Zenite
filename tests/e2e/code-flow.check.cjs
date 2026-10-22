// Janela real, perfil descartável: modal de instalação recusada, JavaScript e seleção temporária.
const { app, dialog, session } = require('electron');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const realExecFile = cp.execFile;
// Simula somente a ausência do Python. Nunca instala software no computador durante o teste.
cp.execFile = function(file, args, options, callback) {
  if (args?.some(arg => typeof arg === 'string' && arg.includes('sys.version.split()'))) {
    const child = new (require('node:events').EventEmitter)();
    child.stdin = new (require('node:stream').PassThrough)();
    process.nextTick(() => callback(Error('Python indisponível no teste'), '', ''));
    return child;
  }
  if (args?.[0] === 'install') throw Error('O teste não pode instalar linguagens');
  return realExecFile.apply(this, arguments);
};
const root = process.cwd(), dir = join(root, 'out/code-flow-qa'); mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto'), home = join(profile, 'home');
for (const path of [project, join(profile, 'workspaces'), join(home, '.agents/skills')]) mkdirSync(path, { recursive: true });
process.env.ZENITE_DATA_DIR = profile; require('node:os').homedir = () => home;
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Teste Código', dir: project, universes: [] }], settings: { confirmQuit: false, isolatedAgents: false, agentGuide: false, agentPermissions: 'full', notifyDone: false } }));
const node = { id: 'code', kind: 'flow', x: 100, y: 100, width: 300, height: 180, element: { id: 'code', kind: 'flow', title: 'Código de teste', flow: { type: 'code', code: { language: 'python', source: '' } } } };
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
const seed = join(profile, 'seed.cjs'); writeFileSync(seed, "localStorage.setItem('o.summaryView','false');");
app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed }));
const native = []; dialog.showMessageBox = async (_, options) => { native.push(options.title); return { response: 0 }; };
let win;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const js = source => win.webContents.executeJavaScript(source, true);
const until = async (source, label) => { for (let n = 0; n < 150; n++) { if (await js(`!!(${source})`)) { console.log('OK: ' + label); return; } await delay(100); } throw Error('Timeout: ' + label); };
const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
const pointer = async selector => {
  const at = await js(`(()=>{ const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`);
  win.webContents.sendInputEvent({ type: 'mouseMove', ...at }); await delay(100);
  win.webContents.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 }); await delay(100);
};
const ready = new Promise(resolve => app.once('browser-window-created', (_, window) => window.webContents.once('did-finish-load', () => resolve(window))));
app.whenReady().then(async () => {
  try {
    win = await ready;
    await until('document.querySelector("[data-id=code]")', 'astro no canvas');
    await click('.draw-toolbar button[title^="Mão:"]');
    await pointer('[data-id=code] .flow-summary');
    await until('document.querySelector(".canvas.tool-select")', 'clique ativa Selecionar');
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 950, y: 400 });
    await until('document.querySelector(".canvas.tool-hand")', 'sair restaura Mão');
    await click('.draw-toolbar button[title="Retângulo (R)"]');
    await pointer('[data-id=code] .flow-summary');
    await until('document.querySelector(".canvas.tool-select")', 'desenho não cobre clique no astro');
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 950, y: 400 });
    await until('document.querySelector(".canvas.tool-rectangle")', 'sair restaura Retângulo');
    await click('.draw-toolbar button[title^="Mão:"]');
    await pointer('[data-id=code] button[title="Configurar"]');
    await until('document.querySelector(".app-dialog h2")?.textContent === "Instalar Python?"', 'instalação pergunta no modal do Zênite');
    await click('.app-dialog .ghost');
    await until('document.querySelector(".flow-dialog .integration-error")?.textContent.includes("cancelada")', 'recusa mantém editor aberto');
    await js(`(()=>{const e=document.querySelector('.flow-dialog select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'javascript'); e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until('document.querySelector(".flow-dialog [role=status]")?.textContent.includes("Node.js")', 'usa Node.js instalado');
    await js(`(()=>{const e=document.querySelector('.flow-dialog textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'console.log("Código validado ✓");'); e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await js(`document.head.insertAdjacentHTML('beforeend','<style>*{animation:none!important}</style>')`);
    writeFileSync(join(dir, 'codigo.png'), (await win.webContents.capturePage()).toPNG());
    await click('.flow-dialog button[type=submit]');
    await click('[data-id=code] button[title="Executar a partir daqui"]');
    await until('document.querySelector("[data-id=code] .flow-status.ok")', 'código executa pelo app');
    assert.deepEqual(native, [], 'nenhuma pergunta nativa');
    win.destroy(); app.quit();
  } catch (error) { console.error(error.stack); if (win) { console.error(await js('document.body.innerText')); writeFileSync(join(dir, 'erro.png'), (await win.webContents.capturePage()).toPNG()); } app.exit(1); }
});
require(join(root, 'out/main/index.js'));
