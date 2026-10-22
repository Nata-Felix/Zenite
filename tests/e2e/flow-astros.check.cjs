// Interface e motor reais, perfil descartável e interações restritas à janela do teste.
// A resposta da confirmação é simulada; nenhum agente, terminal ou script externo é executado.
const { app, BrowserWindow, dialog, session } = require('electron');
const { join } = require('node:path');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/flow-astros-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-'));
process.env.ZENITE_DATA_DIR = profile;
const home = join(profile, 'home'), project = join(profile, 'projeto');
mkdirSync(join(home, '.agents/skills'), { recursive: true });
mkdirSync(project);
require('node:os').homedir = () => home;
mkdirSync(join(profile, 'workspaces'), { recursive: true });
const node = (id, type, x, y, config = {}) => ({ id, kind: 'flow', x, y, width: 280, height: 150, element: { id, kind: 'flow', title: id, flow: { type, ...config } } });
const edge = (source, target, sourceHandle) => ({ id: `${source}-${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) });
const canvas = { version: 1, viewport: { x: 30, y: 40, zoom: 0.8 }, nodes: [
  node('Início', 'ignition', 0, 200, { input: 'Dados de teste' }),
  node('Análise', 'wait', 330, 80, { waitSeconds: 0.1 }),
  node('Revisão', 'wait', 330, 330, { waitSeconds: 0.2 }),
  node('Convergência', 'convergence', 660, 200, { joinMode: 'all' }),
  node('Aprovação', 'approval', 990, 200, { approvalMessage: 'Continuar com estes resultados?' }),
  node('Aprovado', 'wait', 1320, 80, { waitSeconds: 0 }),
  node('Recusado', 'wait', 1320, 330, { waitSeconds: 0 }),
  node('Sinal da API', 'wait', 660, 570, { waitMode: 'signal', timeoutSeconds: 30, signalName: 'API' }),
], edges: [edge('Início', 'Análise'), edge('Início', 'Revisão'), edge('Análise', 'Convergência'), edge('Revisão', 'Convergência'), edge('Convergência', 'Aprovação'), edge('Aprovação', 'Aprovado', 'approved'), edge('Aprovação', 'Recusado', 'rejected')] };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Teste · novos astros', dir: project, universes: [] }], settings: { confirmQuit: false, agentPermissions: 'sandbox', notifyDone: false, notifyRequest: false } }));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify(canvas));
const seed = join(dir, 'seed.cjs');
writeFileSync(seed, "localStorage.setItem('o.summaryView','false');");
app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed }));
let approve = false, approvalCalls = [];
process.env.ZENITE_NATIVE_DIALOGS = "1";
dialog.showMessageBox = async (_win, options) => { approvalCalls.push(options); return { response: approve ? 1 : 0, checkboxChecked: false }; };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, win) => win.webContents.once('did-finish-load', () => resolve(win))));
const delay = ms => new Promise(r => setTimeout(r, ms));
let win;
const js = code => win.webContents.executeJavaScript(code, true);
async function until(code, label) {
  for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) return; await delay(80); }
  throw Error(`Timeout: ${label}`);
}
async function screenshot(name) {
  await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
  await delay(200);
  writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
async function run() {
  try {
    win = await ready;
    win.webContents.setBackgroundThrottling(false);
    win.setBounds({ width: 1440, height: 1000 });
    win.show();
    await until("document.querySelectorAll('.flow-node').length === 8", 'astros no canvas');
    await js("window.qaStatuses = []; void window.o.flows.onStatus(s => window.qaStatuses.push(s));");
    await js("document.querySelector('.dock-agent[title^=\"Astros:\"]').click()");
    assert.equal(await js("document.querySelectorAll('.dock-flow-menu [role=menuitem]').length"), 14);
    await screenshot('01-menu');
    await js("document.querySelector('.dock-agent[title^=\"Astros:\"]').click()");
    for (const title of ['Convergência', 'Sinal da API', 'Aprovação']) {
      await js(`document.querySelector('[data-id="${title}"] button[title="Configurar"]').click()`);
      await until("!!document.querySelector('.flow-dialog')", 'configuração');
      assert.ok(await js("document.querySelector('.flow-dialog').textContent.length > 100"));
      await screenshot('config-' + title.replaceAll(' ', '-'));
      await js("[...document.querySelectorAll('.flow-dialog button')].find(b=>b.textContent==='Salvar').click()");
    }
    // Aciona o botão real do astro; confere a recusa antes de testar o aceite simulado.
    await js("document.querySelector('[data-id=\"Início\"] button[title=\"Executar a partir daqui\"]').click()");
    await until("window.qaStatuses.some(s=>s.nodeId==='Recusado' && s.state==='ok')", 'caminho recusado');
    assert.ok(!await js("window.qaStatuses.some(s=>s.nodeId==='Aprovado')"));
    assert.equal(approvalCalls.length, 1);
    assert.ok(approvalCalls[0].detail.includes('Análise:\nDados de teste'));
    assert.ok(approvalCalls[0].detail.includes('Revisão:\nDados de teste'));
    assert.equal(approvalCalls[0].defaultId, 0);
    approve = true;
    await js("window.qaStatuses = []; document.querySelector('[data-id=\"Início\"] button[title=\"Executar a partir daqui\"]').click()");
    await until("window.qaStatuses.some(s=>s.nodeId==='Aprovado' && s.state==='ok')", 'caminho aprovado');
    assert.ok(!await js("window.qaStatuses.some(s=>s.nodeId==='Recusado')"));
    assert.equal((await js("window.o.workspaces.list()" )).settings.agentPermissions, 'sandbox');
    await screenshot('02-fluxo-concluido');
    await js("document.querySelector('[data-id=\"Sinal da API\"] button[title=\"Executar a partir daqui\"]').click()");
    await until("[...document.querySelectorAll('[data-id=\"Sinal da API\"] button')].some(b=>b.textContent==='Enviar sinal')", 'aguardando sinal');
    await screenshot('03-aguardando-sinal');
    await js("[...document.querySelectorAll('[data-id=\"Sinal da API\"] button')].find(b=>b.textContent==='Enviar sinal').click()");
    await until("document.querySelector('[data-id=\"Sinal da API\"] .flow-status.ok')", 'sinal recebido');
    await js("document.querySelector('[data-id=\"Sinal da API\"] button[title=\"Executar a partir daqui\"]').click()");
    await until("[...document.querySelectorAll('[data-id=\"Sinal da API\"] button')].some(b=>b.textContent==='Parar')", 'parar disponível');
    await js("[...document.querySelectorAll('[data-id=\"Sinal da API\"] button')].find(b=>b.textContent==='Parar').click()");
    await until("document.querySelector('[data-id=\"Sinal da API\"] .flow-status.error')", 'espera cancelada');
    console.log('OK: menu, configuração, convergência, recusa/aceite, Sandbox preservado, sinal e parada na interface real.');
    win.destroy(); app.quit();
  } catch (error) { console.error(error.stack); if (win) await screenshot('erro').catch(()=>{}); app.exit(1); }
}
run();
require(join(root, 'out/main/index.js'));
