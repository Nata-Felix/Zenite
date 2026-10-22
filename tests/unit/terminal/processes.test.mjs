// Árvore de processos de um terminal: leitura real com ps e encerramento.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "processes.mjs");
await build({
  stdin: { contents: 'export * from "./src/main/processes"; export * from "./src/main/ptyManager";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@lydell/node-pty"],
  outfile,
  logLevel: "silent",
});
const { processTree, sampleProcesses, killTree, PtyManager } = await import(pathToFileURL(outfile).href);

test("processTree soma o processo e todos os descendentes, sem misturar outros", () => {
  const all = [
    { pid: 10, ppid: 1, name: "bash", rss: 100 },
    { pid: 11, ppid: 10, name: "node", rss: 300 },
    { pid: 12, ppid: 11, name: "esbuild", rss: 50 },
    { pid: 20, ppid: 1, name: "outro", rss: 999 },
  ];
  const t = processTree(all, 10);
  assert.equal(t.total, 450);
  assert.deepEqual(t.processes.map((p) => p.pid), [10, 11, 12]);
  assert.deepEqual(processTree(all, 77), { total: 0, processes: [] });
});

if (process.platform !== "win32") {
  test("lê processos reais de um terminal e encerra um processo filho", async () => {
    const ptys = new PtyManager({ onData: () => {}, onExit: () => {} });
    ptys.create({ id: "T", command: "", cwd: "", cols: 80, rows: 24 });
    ptys.write("T", "sleep 300\r");
    const root = ptys.roots()[0];
    let tree;
    for (let i = 0; i < 40; i++) {
      tree = processTree(await sampleProcesses(), root.pid);
      if (tree.processes.some((p) => p.name === "sleep")) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const sleep = tree.processes.find((p) => p.name === "sleep");
    assert.ok(sleep, `sleep não apareceu: ${JSON.stringify(tree.processes)}`);
    assert.ok(tree.total > 0);
    await killTree(sleep.pid, []);
    await new Promise((r) => setTimeout(r, 300));
    const after = processTree(await sampleProcesses(), root.pid);
    assert.equal(after.processes.some((p) => p.pid === sleep.pid), false);
    assert.ok(after.processes.some((p) => p.pid === root.pid), "o shell continua vivo");
    ptys.killAll();
  });
}
