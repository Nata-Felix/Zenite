// Aplicativo, Docker, shell e ponte reais. Apenas a resposta ao diálogo nativo é simulada.
const { app, session, dialog } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/isolation-ui-qa'); mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), home = join(profile, 'home'), project = join(profile, 'projeto'), linked = join(project, 'ligada'), outside = join(project, 'externa');
for (const folder of [join(profile, 'workspaces'), join(home, '.agents/skills'), linked, outside]) mkdirSync(folder, { recursive: true });
const linkedFile = join(linked, 'nota.txt'), outsideFile = join(outside, 'privado.txt');
writeFileSync(linkedFile, 'conteudo-ligado'); writeFileSync(outsideFile, 'conteudo-externo');
process.env.ZENITE_DATA_DIR = profile; require('node:os').homedir = () => home;
const terminal = { id: 'qa-shell', title: 'Terminal isolado · teste real', command: "bash --noprofile --norc -i", cwd: project, account: 'qa-' + Date.now() };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Isolamento · validação', dir: project }], settings: { confirmQuit: false, agentGuide: false, isolatedAgents: true, agentPermissions: 'ask', notifyDone: false } }));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, viewport: { x: 20, y: 40, zoom: .85 }, nodes: [
  { id: terminal.id, kind: 'terminal', x: 20, y: 50, width: 850, height: 650, terminal },
  { id: 'folder', kind: 'folder', x: 920, y: 50, width: 310, height: 300, element: { id: 'folder', kind: 'folder', title: 'Pasta autorizada pelo canvas', path: linked } },
  { id: 'host-action', kind: 'flow', x: 920, y: 430, width: 310, height: 160, element: { id: 'host-action', kind: 'flow', title: 'Propulsor no computador', flow: { type: 'thruster', script: `Set-Content -LiteralPath '${join(project, 'NAO-DEVE-CRIAR.txt')}' -Value teste` } } },
], edges: [{ id: 'e', source: terminal.id, target: 'folder' }] }));
const seed = join(profile, 'seed.cjs'); writeFileSync(seed, "localStorage.setItem('o.summaryView','false')");
app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed }));
let win, allow = false, remember = false; const prompts = [];
process.env.ZENITE_NATIVE_DIALOGS = "1";
dialog.showMessageBox = async (_win, options) => { prompts.push(options); return { response: allow ? 1 : 0, checkboxChecked: remember }; };
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => w.webContents.once('did-finish-load', () => resolve(w))));
const delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
async function command(text) { await js('window.testOutput=""'); await js(`window.o.pty.write(${JSON.stringify(terminal.id)},${JSON.stringify(text + '\r')})`); }
async function result(label) {
  const pattern = 'RESULT_' + label + '=(\\{[^\\r\\n]*\\})';
  for (let i = 0; i < 180; i++) { const raw = await js(`window.testOutput.match(new RegExp(${JSON.stringify(pattern)}))?.[1]`); if (raw) return JSON.parse(raw); await delay(100); }
  throw Error('Timeout: ' + label + '\n' + (await js('window.testOutput')).slice(-3000));
}
const report = (label, expression) => `python3 -c ${quote(`import json,os;print("RESULT_${label}="+json.dumps(${expression}))`)}`;
const shot = async label => writeFileSync(join(dir, label + '.png'), (await win.webContents.capturePage()).toPNG());
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    await js('window.testOutput="";void window.o.pty.onData((id,data)=>{if(id==="qa-shell")window.testOutput+=data});true');
    await delay(1800);
    await command(report('BOUNDARY', `{"uid":os.getuid(),"host":os.path.exists(${JSON.stringify(outsideFile)}),"docker":os.path.exists("/var/run/docker.sock"),"workspace":os.getcwd()}`));
    const boundary = await result('BOUNDARY'); assert.equal(boundary.uid, 1000); assert.equal(boundary.host, false); assert.equal(boundary.docker, false); assert.equal(boundary.workspace, '/workspace');
    await command(report('ROOT', '{"root_writable":os.access("/etc",os.W_OK)}'));
    assert.equal((await result('ROOT')).root_writable, false);
    await command(`zn list; zn access read ${quote(linkedFile)} --out /workspace/nota.txt; ${report('LINKED', '{"text":open("/workspace/nota.txt").read()}')}`);
    assert.equal((await result('LINKED')).text, 'conteudo-ligado'); assert.equal(prompts.length, 0);
    await shot('01-pasta-conectada');
    await command(`zn access read ${quote(outsideFile)} --out /workspace/fora.txt; ${report('CANCEL', '{"exists":os.path.exists("/workspace/fora.txt")}')}`);
    assert.equal((await result('CANCEL')).exists, false); assert.equal(prompts.length, 1);
    assert.deepEqual(prompts[0].buttons, ['Cancelar', 'Permitir']); assert.equal(prompts[0].defaultId, 0);
    allow = true;
    await command(`zn access read ${quote(outsideFile)} --out /workspace/fora.txt; ${report('ALLOW', '{"text":open("/workspace/fora.txt").read()}')}`);
    assert.equal((await result('ALLOW')).text, 'conteudo-externo'); assert.equal(prompts.length, 2);
    await command(`zn access read ${quote(outsideFile)} --out /workspace/fora.txt; ${report('ASK', '{"ok":True}')}`); await result('ASK'); assert.equal(prompts.length, 3);
    await js('window.o.workspaces.setSettings({agentPermissions:"full"})'); remember = true;
    await command(`zn access read ${quote(outsideFile)} --out /workspace/fora.txt; ${report('REMEMBER', '{"ok":True}')}`); await result('REMEMBER'); assert.equal(prompts.length, 4); assert.ok(prompts[3].checkboxLabel);
    await command(`zn access read ${quote(outsideFile)} --out /workspace/fora.txt; ${report('REPEAT', '{"ok":True}')}`); await result('REPEAT'); assert.equal(prompts.length, 4);
    await js('window.o.workspaces.revokeDirectAccess()'); allow = false;
    await command(`rm /workspace/fora.txt; zn access read ${quote(outsideFile)} --out /workspace/fora.txt; ${report('REVOKE', '{"exists":os.path.exists("/workspace/fora.txt")}')}`);
    assert.equal((await result('REVOKE')).exists, false); assert.equal(prompts.length, 5);
    await js('window.o.canvas.load("qa").then(state=>window.o.flows.run("qa",state,"host-action"))');
    assert.equal(prompts.length, 6, 'isolamento também pede confirmação antes do Propulsor no host');
    assert.equal(existsSync(join(project, 'NAO-DEVE-CRIAR.txt')), false);
    await js('window.o.workspaces.setSettings({agentPermissions:"sandbox"})');
    await command(`zn access read ${quote(outsideFile)} --out /workspace/fora.txt; ${report('SANDBOX', '{"exists":os.path.exists("/workspace/fora.txt")}')}`);
    assert.equal((await result('SANDBOX')).exists, false); assert.equal(prompts.length, 6);
    await command(`printf modificado > /workspace/escrever.txt; zn access write ${quote(linkedFile)} --file /workspace/escrever.txt; ${report('WRITE', '{"ok":True}')}`); await result('WRITE'); assert.equal(readFileSync(linkedFile, 'utf8'), 'modificado');
    await command(`printf persistiu > /home/agent/perfil-qa.txt; ${report('SAVE', '{"ok":True}')}`); await result('SAVE');
    await shot('02-sandbox-e-perfil');
    await js(`window.o.pty.kill(${JSON.stringify(terminal.id)})`); await delay(1500);
    const created = await js(`window.o.pty.create(${JSON.stringify({ ...terminal, cols: 110, rows: 36 })})`); assert.equal(created.ok, true, created.error); await delay(2000);
    await command(report('PERSIST', '{"profile":open("/home/agent/perfil-qa.txt").read(),"scratch":os.path.exists("/workspace/nota.txt")}'));
    const persistence = await result('PERSIST'); assert.equal(persistence.profile, 'persistiu'); assert.equal(persistence.scratch, false);
    await command(`python3 -c ${quote('import subprocess,json;programs=[["codex","--version"],["claude","--version"],["agy","--help"]];results=[subprocess.run(p,capture_output=True,text=True).returncode for p in programs];print("RESULT_AGENTS="+json.dumps({"codes":results}))')}`);
    assert.deepEqual((await result('AGENTS')).codes, [0, 0, 0]);
    await shot('03-agentes-e-perfil-preservado');
    writeFileSync(join(dir, 'resultado.json'), JSON.stringify({ ok: true, profile, boundary, persistence, decisions: prompts.length, nativeDialogResponsesSimulated: true }, null, 2));
    console.log('PASS: isolamento real, ponte, pasta ligada, Permitir/Cancelar, revogação, Sandbox, três agentes instalados e perfil persistente');
    win.destroy(); app.quit();
  } catch (error) { console.error(error.stack); if (win) await shot('erro').catch(() => {}); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
