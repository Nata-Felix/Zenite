// Teste ao vivo do zn agent com os CLIs de verdade (Codex e Antigravity instalados e logados).
// Não manda nenhum pedido ao modelo: só abre os CLIs, lê status/uso, troca esforço/modelo na sessão
// e volta como estava. Uso: node tests/live/sol-agents.live.cjs [--agy-account ID]
// (sem a conta do Antigravity, a parte dele é pulada).
const { buildSync } = require('esbuild');
const { execFile } = require('node:child_process');
const { join } = require('node:path');
const { mkdirSync, mkdtempSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd();
const out = join(root, 'out', 'sol-live');
mkdirSync(out, { recursive: true });
const data = mkdtempSync(join(out, 'profile-'));
const bundle = join(root, 'out/test/sol-live-main.cjs');
buildSync({ stdin: { contents: 'export * from "./src/main/ptyManager"; export * from "./src/main/workspaceStore"; export * from "./src/main/elements"; export * from "./src/main/controlServer"; export * from "./src/main/canvasGraph";', resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['@lydell/node-pty'], outfile: bundle, logLevel: 'silent' });
const cli = join(root, 'out/test/sol-live-cli.cjs');
buildSync({ entryPoints: [join(root, 'src/cli/index.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: cli, logLevel: 'silent' });
const { PtyManager, WorkspaceStore, ElementService, ControlServer, neighborhoodFromStore } = require(bundle);

const agyAccount = process.argv.includes('--agy-account') ? process.argv[process.argv.indexOf('--agy-account') + 1] : null;
const agyHome = agyAccount && join(process.env.APPDATA, 'o', 'contas', agyAccount);
const work = mkdtempSync(join(out, 'pasta-'));
const store = new WorkspaceStore(data);
const a = store.list().activeId;
store.update(a, { name: 'Ao vivo', dir: work });
store.saveCanvas(a, { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [{ id: 'sol', kind: 'terminal', x: 0, y: 0, width: 600, height: 400, terminal: { id: 'sol', title: 'Sol', command: '', cwd: work, sun: true } }], edges: [] });
const tokens = new Map();
const accounts = agyAccount ? [{ id: agyAccount, name: 'Agy', agent: 'antigravity' }] : [];
// O mesmo que o Zênite faz para a conta do Antigravity: a pasta dela vira o USERPROFILE.
const ptys = new PtyManager({ onData() {}, onExit() {} }, (id, token, req) => {
  tokens.set(id, token);
  return req.account === agyAccount && agyHome ? { USERPROFILE: agyHome, SSH_CONNECTION: '127.0.0.1 0 127.0.0.1 0' } : {};
});
const elements = new ElementService(data, store, { noteChanged() {}, tableChanged() {}, patch() {}, killTerminal: (id) => ptys.kill(id), startTerminal: (t) => ptys.create({ id: t.id, command: t.command, cwd: t.cwd, account: t.account, cols: 140, rows: 50 }) });
const terminalSpec = (id) => store.loadCanvas(a).nodes.find((n) => n.id === id)?.terminal;
const control = new ControlServer(ptys, (id) => neighborhoodFromStore(store, id), {
  readNote: () => '', writeNote() {}, mediaPath: (f) => f, importMedia: () => null, cleanup() {}, addLinkedElement: () => null, updateElement() {}, readTable: () => [], writeTable() {},
  web: () => null, runFlow: () => ({ ok: false }), canvasOf: (id) => elements.canvasOf(id), canvasOps: (c, ops, caller) => elements.canvasOps(c, ops, caller), accounts: () => accounts,
  terminalSpec, stopTerminal: (id) => (ptys.kill(id), true),
});
const pipe = `\\\\.\\pipe\\zenite-sol-live-${process.pid}`;
function zn(...args) {
  return new Promise((resolve) => execFile(process.execPath, [cli, ...args], { env: { ...process.env, O_PIPE: pipe, O_TERMINAL_ID: 'sol', O_TOKEN: tokens.get('sol') }, timeout: 240_000 }, (err, stdout, stderr) => resolve({ code: err ? 1 : 0, out: stdout.trim(), err: stderr.trim() })));
}
async function ok(...args) {
  const r = await zn(...args);
  if (r.code) throw Error(`zn ${args.join(' ')} falhou: ${r.err || r.out}`);
  console.log(`OK: zn ${args.join(' ')}\n${r.out.split('\n').slice(0, 8).map((l) => `    ${l}`).join('\n')}`);
  return r.out;
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready(id) {
  // Espera o CLI abrir: aberto há 6 s e quieto há 2 s.
  const end = Date.now() + 60_000;
  while (Date.now() < end) { const q = ptys.quiet(id); if (q && q.open > 6000 && q.idle > 2000) return; await delay(300); }
  throw Error('O CLI não abriu em 60 s.');
}
(async () => {
  await control.listen(pipe);
  ptys.create({ id: 'sol', command: '', cwd: work, cols: 120, rows: 40 });
  try {
    // ---- Codex
    await ok('recruit', 'Cx', '--agent', 'codex', '--effort', 'low');
    const cx = store.loadCanvas(a).nodes.find((n) => n.terminal?.title === 'Cx');
    assert.match(cx.terminal.command, /^codex -c model_reasoning_effort=low$/);
    await ready(cx.id);
    let o = await ok('agent', 'Cx');
    assert.match(o, /Codex/);
    assert.match(o, /esforço low/);
    o = await ok('agent', 'status', 'Cx');
    assert.match(o, /Model: .*reasoning low/, 'abriu com o esforço pedido na linha de comando');
    assert.match(o, /5h limit: \d+% left/);
    await ok('agent', 'effort', 'Cx', 'high');
    assert.match(await ok('agent', 'status', 'Cx'), /reasoning high/, 'trocou o esforço com o CLI aberto');
    const models = await ok('agent', 'commands', 'Cx');
    assert.match(models, /\/model/);
    assert.match(models, /\/status/);
    o = await ok('agent', 'run', 'Cx', '/model');
    assert.match(o, /Select Model/);
    await ok('agent', 'pick', 'Cx', '(current)');
    o = await ok('agent', 'pick', 'Cx', 'medium', '--no-enter');
    assert.match(o, /› \d\. Medium/);
    await ok('agent', 'interrupt', 'Cx');
    assert.match((await zn('agent', 'effort', 'Cx', 'turbo')).err, /aceita esforço/);
    assert.match((await zn('agent', 'status', 'Sol')).err, /próprio CLI/);
    await ok('terminal', 'edit', 'Cx', '--model', 'gpt-6-sol', '--effort', 'medium');
    assert.equal(terminalSpec(cx.id).command, 'codex -m gpt-6-sol -c model_reasoning_effort=medium');

    // ---- Antigravity
    if (agyAccount) {
      await ok('recruit', 'Ag', '--agent', 'antigravity', '--account', 'Agy', '--effort', 'medium', '--cwd', work);
      const ag = store.loadCanvas(a).nodes.find((n) => n.terminal?.title === 'Ag');
      assert.match(ag.terminal.command, /^agy --effort medium$/);
      await ready(ag.id);
      // Pasta nova: o agy pergunta se confia nela. O Sol responde pelo menu.
      const first = await ok('agent', 'run', 'Ag', '/usage');
      if (/trust/i.test(first)) await ok('agent', 'pick', 'Ag', 'Yes');
      o = await ok('agent', 'usage', 'Ag');
      assert.match(o, /Limit Remaining/);
      o = await ok('agent', 'commands', 'Ag');
      assert.match(o, /\/effort/);
      await ok('agent', 'effort', 'Ag', 'high');
      o = await ok('agent', 'run', 'Ag', '/effort');
      assert.match(o, /●━+●━+◉/, 'o controle está no high');
      await ok('agent', 'slide', 'Ag', 'medium');
      o = await ok('agent', 'run', 'Ag', '/effort');
      assert.match(o, /●━+◉─+○/, `o controle está no medium:
${o}`);
      await ok('agent', 'interrupt', 'Ag');
      await ok('agent', 'effort', 'Ag', 'high');
    } else console.log('-- Antigravity pulado (passe --agy-account ID).');

    console.log(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error(e.stack);
    process.exitCode = 1;
  }
  ptys.killAll();
  control.close();
  setTimeout(() => process.exit(), 2000);
})();
