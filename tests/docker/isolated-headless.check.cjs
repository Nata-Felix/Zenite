const { buildSync } = require('esbuild');
const { join } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/isolation-headless-qa'); mkdirSync(dir, { recursive: true });
const bundle = join(root, 'out/test/isolated-headless.cjs');
buildSync({ entryPoints: ['src/main/isolatedRuntime.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
const { IsolatedRuntime } = require(bundle);
const runtime = new IsolatedRuntime(dir, join(root, 'out/cli/index.js'), () => 'http://host.docker.internal:1');
const account = 'qa-headless-' + Date.now();
const quote = text => "'" + text.replace(/'/g, "'\\''") + "'";
(async () => {
  try {
    const firstCode = 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{require("fs").writeFileSync("/home/agent/headless-qa.txt",s);console.log(JSON.stringify({uid:process.getuid(),input:s,host:require("fs").existsSync("/mnt/c/Windows"),docker:require("fs").existsSync("/var/run/docker.sock")}))});';
    const base = { id: 'headless-qa', agent: 'custom', account, token: 'qa-only', prompt: 'entrada-com-aspas " e\nquebra', command: 'node -e ' + quote(firstCode) };
    const first = await runtime.headless(base); assert.equal(first.ok, true, first.error);
    const result = JSON.parse(first.text); assert.equal(result.uid, 1000); assert.equal(result.input, base.prompt); assert.equal(result.host, false); assert.equal(result.docker, false);
    const second = await runtime.headless({ ...base, prompt: '', command: 'node -e ' + quote('console.log(JSON.stringify({saved:require("fs").readFileSync("/home/agent/headless-qa.txt","utf8")}))') });
    assert.equal(second.ok, true, second.error); assert.equal(JSON.parse(second.text).saved, base.prompt);
    writeFileSync(join(dir, 'resultado.json'), JSON.stringify({ ok: true, realContainer: true, result, persistence: true }, null, 2));
    console.log('PASS: processo sem tela isolado, entrada preservada, perfil persistente e sem disco do host');
  } finally { runtime.closeAll(); await runtime.removeProfile(account, 'node'); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
