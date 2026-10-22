// Testa a promoção real e a entrega ao terminal. O agente é uma fixture, sem modelo/conta.
const { app, session } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/sol-canvas-welcome-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'projeto'), home = join(profile, 'home');
for (const p of [project, join(profile, 'workspaces'), join(home, '.agents/skills')]) mkdirSync(p, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
require('node:os').homedir = () => home;
const record = join(profile, 'recebido.jsonl'), helper = join(profile, 'agent.cjs'), command = join(profile, 'agy.cmd');
const node = execFileSync('where.exe', ['node'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/)[0];
writeFileSync(helper, `const fs=require('node:fs'), cp=require('node:child_process');
process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdout.write('\\x1b[?2004hAntigravity simulado para teste de entrega\\r\\n> ');
let input='';process.stdin.on('data',data=>{input+=data; if(!input.includes('\\r'))return;
const text=input.replace(/\\x1b\\[20[01]~/g,'').trim();input='';
fs.appendFileSync(${JSON.stringify(record)},JSON.stringify({text,args:process.argv.slice(2)})+'\\n');
if(text.includes('zn list')){try{const output=cp.execFileSync(process.execPath,[process.env.O_CLI,'list'],{encoding:'utf8',env:process.env});process.stdout.write('\\r\\nzn list\\r\\n'+output.replace(/\\n/g,'\\r\\n'));}catch(e){process.stdout.write('ERRO zn list: '+e.message);}}
process.stdout.write('\\r\\n> ');});`);
writeFileSync(command, `@echo off\r\n"${node}" "${helper}" %*\r\n`);
const terminal = { id: 'sol', title: 'Antigravity · entrega do canvas', command, cwd: project };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Canvas primeiro', dir: project }], settings: { confirmQuit: false, agentGuide: false, agentPermissions: 'ask', notifyDone: false } }));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify({ version: 1, viewport: { x: 25, y: 45, zoom: .85 }, nodes: [
  { id: 'sol', kind: 'terminal', x: 20, y: 60, width: 780, height: 550, terminal },
  { id: 'nota', kind: 'note', x: 850, y: 60, width: 330, height: 260, element: { id: 'nota', kind: 'note', title: 'Plano ligado' } },
], edges: [{ id: 'e', source: 'sol', target: 'nota' }] }));
mkdirSync(join(profile, 'notes')); writeFileSync(join(profile, 'notes/nota.md'), 'Material do canvas: analisar esta nota antes de explorar a pasta.');
const seed = join(profile, 'seed.cjs'); writeFileSync(seed, "localStorage.setItem('o.summaryView','false')");
app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed }));
let win; const delay = ms => new Promise(r => setTimeout(r, ms));
const ready = new Promise(resolve => app.once('browser-window-created', (_e, w) => w.webContents.once('did-finish-load', () => resolve(w))));
const js = code => win.webContents.executeJavaScript(code, true);
const messages = () => existsSync(record) ? readFileSync(record, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
app.whenReady().then(async () => {
  try {
    win = await ready; win.show();
    for (let i = 0; i < 100 && !await js('!!document.querySelector(".xterm")'); i++) await delay(100);
    for (const mode of ['ask', 'sandbox', 'full']) {
      await js(`window.o.workspaces.setSettings({agentPermissions:${JSON.stringify(mode)}})`);
      await js(`window.o.pty.promoteSun(${JSON.stringify({ ...terminal, sun: false, cols: 100, rows: 35 })})`);
      const before = messages().length;
      const request = { ...terminal, sun: true, cols: 100, rows: 35 };
      const result = await js(`window.o.pty.promoteSun(${JSON.stringify(request)})`);
      assert.equal(result.ok, true); assert.equal(result.fullAccess, mode === 'full');
      if (result.restart) await js(`window.o.pty.restart(${JSON.stringify(request)})`);
      for (let i = 0; i < 180 && messages().length === before; i++) await delay(100);
      const received = messages().at(-1);
      assert.equal(messages().length, before + 1, 'uma orientação por promoção');
      assert.match(received.text, /execute zn list/);
      assert.match(received.text, /diretório de trabalho/);
      assert.equal(received.text.includes('acesso total para trabalhar'), mode === 'full');
      if (mode !== 'full') assert.ok(!received.args.includes('--dangerously-skip-permissions'));
      await delay(300);
      writeFileSync(join(dir, mode + '.png'), (await win.webContents.capturePage()).toPNG());
      console.log('OK: orientação do canvas entregue no terminal · ' + mode);
    }
    writeFileSync(join(dir, 'resultado.json'), JSON.stringify({ ok: true, profile, fixtureAgent: true, modes: ['ask', 'sandbox', 'full'] }, null, 2));
    win.destroy(); app.quit();
  } catch (e) { console.error(e.stack); if (win) writeFileSync(join(dir, 'erro.png'), (await win.webContents.capturePage()).toPNG()); app.exit(1); }
});
require(join(root, 'out/main/index.js'));
