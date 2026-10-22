// Zênite real, janela visível e dados descartáveis. Nenhum controle global do computador.
const { app, BrowserWindow, dialog, session } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const fixture = require('../fixtures/integrations.fixture.cjs');
const root = process.cwd(), dir = join(root, 'out/canvas-integrations-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-'));
process.env.ZENITE_DATA_DIR = profile;
const home = join(profile, 'home'), project = join(profile, 'projeto'), skill = join(project, 'skill-revisao');
mkdirSync(join(home, '.agents/skills'), { recursive: true });
mkdirSync(join(skill, 'references'), { recursive: true });
require('node:os').homedir = () => home;
writeFileSync(join(skill, 'SKILL.md'), '---\nname: revisao\ndescription: Revisar o projeto\n---\n# Revisão pelo canvas\nLeia references/guia.md antes de revisar.\nVerifique os critérios e apresente os resultados.');
writeFileSync(join(skill, 'references/guia.md'), '# Guia de apoio\nConfirmar comportamento, permissões e conexões.');
writeFileSync(join(project, '.env'), 'QA_LOCAL_TOKEN=token-local-descartavel\n');
mkdirSync(join(profile, 'workspaces'), { recursive: true });
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Skills e serviços · teste no Zênite', dir: project, universes: [] }], settings: { agentGuide: false, agentPermissions: 'full', confirmQuit: false, notifyDone: false, notifyRequest: false } }));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, viewport: { x: 30, y: 60, zoom: 0.8 }, nodes: [{ id: 'agent', kind: 'terminal', x: 0, y: 0, width: 380, height: 260, terminal: { id: 'agent', title: 'Agente de teste', command: '', cwd: project } }], edges: [] }));
const seed = join(dir, 'seed.cjs'); writeFileSync(seed, "if(!localStorage.getItem('qa.integrations')){localStorage.setItem('qa.integrations','1');localStorage.setItem('o.summaryView','false');}");
app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed }));
// Apenas o seletor nativo usa uma resposta de teste; criação e configuração passam pela interface real.
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [skill] });
let decision = false, confirmations = 0;
process.env.ZENITE_NATIVE_DIALOGS = "1";
dialog.showMessageBox = async (_win, options) => {
  if (options.title === 'Permitir acesso ao serviço?') { confirmations++; await delay(650); return { response: decision ? 1 : 0 }; }
  return { response: 0 };
};
let win, service, skillId, apiId;
const errors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const js = code => win.webContents.executeJavaScript(code, true);
async function until(code, label) { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) return; await delay(80); } throw Error('Timeout: ' + label); }
const save = () => js("window.dispatchEvent(new Event('zenite:flush-canvas'))");
const state = () => JSON.parse(readFileSync(join(profile, 'workspaces/qa.json'), 'utf8'));
const node = (id, inner = '') => `[data-testid="rf__node-${id}"]${inner ? ' ' + inner : ''}`;
async function click(selector) { await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Não encontrado: '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});e.click()})()`); await delay(350); }
async function fill(selector, value) {
  await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});e.focus();e.select()})()`);
  await win.webContents.debugger.sendCommand('Input.insertText', { text: value }); await delay(180);
}
async function choose(selector, value) { await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`); await delay(250); }
async function mouse(type, x, y, options = {}) { if (type === 'mousePressed') await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }); await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...options }); }
async function drag(from, to) { await mouse('mousePressed', from.x, from.y, { buttons: 1, clickCount: 1 }); for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12, { buttons: 1 }); await delay(30); } await mouse('mouseReleased', to.x, to.y, { buttons: 0, clickCount: 1 }); await delay(550); }
const box = selector => js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,left:r.left,top:r.top,width:r.width,height:r.height}})()`);
async function move(id, x, y) { const r = await box(node(id, '.element-header')); await drag({ x: r.left + 28, y: r.y }, { x, y }); }
async function connect(id) { await drag(await box(node('agent', '.react-flow__handle-right')), await box(node(id, '.react-flow__handle-left'))); }
async function screenshot(name) { writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); }
async function mode(value) { await js(`window.o.workspaces.setSettings({agentPermissions:${JSON.stringify(value)}})`); }
async function step(label) { console.log('OK: ' + label); await delay(650); }
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => { w.webContents.on('console-message', event => { if (event.level === 'error' && !event.message.includes('ResizeObserver')) errors.push(event.message); }); w.webContents.once('did-finish-load', () => resolve(w)); }));
app.whenReady().then(async () => {
  try {
    service = await fixture(); win = await ready; win.show(); win.webContents.debugger.attach('1.3');
    await until("document.querySelector('.react-flow__node-terminal')", 'canvas real');
    const pane = await box('.react-flow__pane');
    await click('button[title="Adicionar skill ao canvas"]');
    await until("document.querySelector('.kind-skill .integration-result')", 'skill criada e carregada');
    await save(); skillId = state().nodes.find(n => n.kind === 'skill').id;
    await move(skillId, pane.left + pane.width - 350, pane.top + 90);
    await step('Skill criada pelo menu, sem instalação global');
    assert.match(await js(`document.querySelector(${JSON.stringify(node(skillId, '.integration-result'))}).textContent`), /Revisão pelo canvas/);
    await click(node(skillId, 'summary')); await click(node(skillId, '.integration-files button'));
    await until(`document.querySelector(${JSON.stringify(node(skillId, '.integration-result'))})?.textContent.includes('Guia de apoio')`, 'arquivo de apoio lido');
    await connect(skillId); await save(); assert.equal(state().edges.length, 1);
    await step('Ligação com o agente e leitura de arquivos de apoio');
    await click('button[title="Adicionar serviço externo"]');
    await until("document.querySelector('.kind-service')", 'serviço criado');
    await save(); apiId = state().nodes.find(n => n.kind === 'service').id;
    await move(apiId, pane.left + 450, pane.top + 350);
    await fill(node(apiId, 'input[aria-label="Endereço do serviço"]'), service.url + '/api');
    await fill(node(apiId, 'input[aria-label="Variável do token"]'), 'QA_LOCAL_TOKEN');
    await connect(apiId); await save(); assert.equal(state().edges.length, 2);
    await click(node(apiId, '.primary'));
    await until(`document.querySelector(${JSON.stringify(node(apiId, '.integration-result'))})?.textContent.includes('Serviço local conectado')`, 'HTTP real');
    assert.ok(!await js("document.body.textContent.includes('token-local-descartavel')"));
    await screenshot('01-skill-e-api'); await step('API configurada, ligada e testada com token do .env');
    await mode('ask'); decision = false;
    const count = service.calls.length;
    await click(node(apiId, '.primary'));
    await until(`document.querySelector(${JSON.stringify(node(apiId, '.integration-error'))})?.textContent.includes('cancelado')`, 'cancelamento');
    assert.equal(service.calls.length, count);
    decision = true; await click(node(apiId, '.primary'));
    await until(`document.querySelector(${JSON.stringify(node(apiId, '.integration-result'))})`, 'aprovação');
    assert.equal(confirmations, 2);
    await mode('sandbox'); await click(node(apiId, '.primary'));
    await until(`document.querySelector(${JSON.stringify(node(apiId, '.integration-error'))})?.textContent.includes('Sandbox')`, 'sandbox');
    assert.equal(service.calls.length, count + 1);
    await screenshot('02-sandbox-respeitado'); await step('Sempre perguntar aprova/cancela; Sandbox não faz nenhuma chamada');
    await mode('full');
    await choose(node(apiId, 'select[aria-label="Tipo de conexão"]'), 'mcp');
    await fill(node(apiId, 'input[aria-label="Endereço do serviço"]'), service.url + '/mcp');
    await click(node(apiId, '.primary'));
    await until(`document.querySelector(${JSON.stringify(node(apiId, '.integration-result'))})?.textContent.includes('echo')`, 'ferramentas MCP');
    await click(node(apiId, 'input[type="checkbox"]'));
    await fill(node(apiId, 'textarea[aria-label="Ferramentas autorizadas"]'), 'echo');
    await click(node(apiId, 'details summary'));
    await choose(node(apiId, 'select[aria-label="Ferramenta"]'), 'echo');
    await fill(node(apiId, 'textarea[aria-label="Dados JSON"]'), '{"message":"Olá do canvas"}');
    await click(node(apiId, 'details button'));
    await until(`document.querySelector(${JSON.stringify(node(apiId, '.integration-result'))})?.textContent.includes('Olá do canvas')`, 'chamada MCP real');
    await screenshot('03-ferramenta-mcp'); await step('MCP: descoberta via SSE, ferramenta autorizada e execução com argumentos');
    await save(); const saved = state();
    win.webContents.reload(); await until("document.querySelectorAll('.integration-body').length===2", 'reabertura'); await delay(700);
    assert.equal(state().nodes.find(n => n.id === apiId).element.service.transport, 'mcp');
    assert.deepEqual(state().nodes.find(n => n.id === apiId).element.service.tools, ['echo']);
    assert.equal(saved.edges.length, state().edges.length);
    await click('button[title^="Visão resumida"]'); await delay(550);
    assert.equal(await js("document.querySelectorAll('.summary-node').length"), 3);
    const edgeBefore = await js("document.querySelector('.pulse-edge').getAttribute('d')");
    const round = await box(node(skillId, '.summary-icon')); await drag(round, { x: round.x + 90, y: round.y + 50 });
    assert.notEqual(await js("document.querySelector('.pulse-edge').getAttribute('d')"), edgeBefore);
    await click('button[title="Enquadrar tudo"]'); await delay(400);
    await screenshot('04-canvas-compacto'); await step('Configuração e conexões persistem; círculos e linhas acompanham o movimento');
    assert.deepEqual(errors, []);
    writeFileSync(join(dir, 'resultado.json'), JSON.stringify({ ok: true, profile, screenshots: 4, httpCalls: service.calls.length, confirmations, errors }, null, 2));
    console.log('PASS: skills e serviços no Zênite real; ' + dir);
    if (process.argv.includes('--keep-open')) return;
    await service.close(); win.destroy(); app.quit();
  } catch (error) { console.error(error.stack); if (win) await screenshot('erro').catch(() => {}); await service?.close(); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
