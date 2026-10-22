import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { request } from "node:http";
import { randomUUID } from "node:crypto";

const dir = join(process.cwd(), "out/security-tests");
mkdirSync(dir, { recursive: true });
const outfile = join(dir, "security.mjs");
await build({ stdin: { contents: 'export * from "./src/main/sunAuthority"; export * from "./src/main/workspaceStore"; export * from "./src/main/canvasGraph"; export * from "./src/main/controlServer";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { SunAuthority, WorkspaceStore, neighborhoodFromStore, ControlServer } = await import(pathToFileURL(outfile).href);
const terminal = id => ({ id, kind: "terminal", x: 0, y: 0, width: 100, height: 100, terminal: { id, title: id, command: "", sun: true } });
const state = () => ({ version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [terminal("sol"), terminal("agent")], edges: [{ id: "link", source: "sol", target: "agent" }] });

test("marcas em JSON, ID conhecido e saves não concedem o papel de Sol", () => {
  const suns = new SunAuthority();
  const store = new WorkspaceStore(mkdtempSync(join(dir, "store-")), (id, canvas) => suns.present(id, canvas));
  const id = store.list().activeId;
  store.saveCanvas(id, state());
  assert.ok(store.loadCanvas(id).nodes.every(n => !n.terminal.sun));
  const graph = who => neighborhoodFromStore(store, who, (terminalId, canvasId) => suns.has(terminalId, canvasId));
  assert.equal(graph("agent").me.sun, undefined);
  suns.set(id, "sol", true);
  assert.equal(graph("sol").me.sun, true);
  assert.equal(graph("agent").me.sun, undefined);
  store.saveCanvas(id, state());
  assert.equal(graph("agent").me.sun, undefined);
  suns.set(id, "agent", true);
  assert.equal(graph("sol").me.sun, undefined);
  assert.equal(graph("agent").me.sun, true);
  suns.set(id, "agent", false);
  assert.equal(graph("agent").me.sun, undefined);
  assert.equal(new SunAuthority().has("sol", id), false);
  assert.equal(neighborhoodFromStore(store, "sol").me.sun, undefined);
});

test("edições externas do índice e canvas não alteram a sessão protegida", () => {
  const home = mkdtempSync(join(dir, "protected-"));
  const store = new WorkspaceStore(home);
  const id = store.list().activeId;
  store.setSettings({ agentPermissions: "sandbox" });
  store.saveCanvas(id, state());
  store.protectRuntimeState();
  const tampered = store.list();
  tampered.settings.agentPermissions = "full";
  writeFileSync(join(home, "workspaces/index.json"), JSON.stringify(tampered));
  writeFileSync(join(home, "workspaces", id + ".json"), JSON.stringify({ ...state(), nodes: [terminal("falso")] }));
  assert.equal(store.list().settings.agentPermissions, "sandbox");
  assert.equal(store.loadCanvas(id).nodes[0].id, "sol");
  // Objetos devolvidos também não alteram o registro sem um save do aplicativo.
  store.list().settings.agentPermissions = "full";
  assert.equal(store.list().settings.agentPermissions, "sandbox");
  store.saveCanvas(id, { ...state(), nodes: [terminal("legítimo")] });
  assert.equal(store.loadCanvas(id).nodes[0].id, "legítimo");
});

test("API recusa identidade falsa e todas as criações legadas sem Sol", async () => {
  const suns = new SunAuthority();
  suns.set("canvas", "sol", true);
  const peers = [{ id: "sol", kind: "terminal", title: "sol" }, { id: "agent", kind: "terminal", title: "agent" }, { id: "note", kind: "note", title: "note" }, { id: "image", kind: "image", title: "image", file: "image.png" }];
  const graph = id => ({ me: { id, title: id, sun: suns.has(id, "canvas") }, linked: peers.filter(p => p.id !== id).map(p => ({ ...p, sun: suns.has(p.id, "canvas") })), others: [] });
  let created = 0, writes = 0;
  const server = new ControlServer({ verify: (id, token) => token === `test-token-${id}`, has: () => true, write: () => { writes++; }, snapshot: async () => "private", acceptsPaste: () => false }, graph, {
    addLinkedElement: (_id, kind, title) => { created++; return { element: { id: "new", kind, title } }; },
    writeNote: () => { writes++; }, readNote: () => "content", writeTable: () => { writes++; },
    canvasOf: () => "canvas", canvasOps: async () => ({ ok: true, state: state(), results: [] }),
  });
  const address = process.platform === "win32" ? `\\\\.\\pipe\\zn-security-${randomUUID()}` : join(dir, randomUUID() + ".sock");
  await server.listen(address);
  const call = (path, body, id = "agent", token = `test-token-${id}`) => new Promise((resolve, reject) => {
    const req = request({ socketPath: address, path, method: "POST", headers: { "x-o-terminal": id, "x-o-token": token, "content-type": "application/json" } }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on("error", reject); req.end(JSON.stringify(body));
  });
  try {
    assert.equal((await call("/canvas", { ops: [] }, "sol", "test-token-agent")).status, 401);
    assert.equal((await call("/canvas", { ops: [], sun: true })).status, 403);
    for (const route of ["/note", "/table", "/file", "/web"]) assert.equal((await call(route, { action: "create", title: "test", url: "https://example.com", path: "irrelevant" })).status, 403);
    assert.equal((await call("/media", { action: "set", target: "image", path: "irrelevant" })).status, 403);
    assert.equal(created, 0);
    assert.equal((await call("/send", { to: "sol", data: "unsafe" })).status, 403);
    assert.equal((await call("/check", { to: "sol" })).status, 403);
    assert.equal(writes, 0);
    assert.equal((await call("/note", { action: "write", target: "note", content: "resultado" })).status, 200);
    assert.equal((await call("/note", { action: "create", title: "test" }, "sol")).status, 200);
    assert.equal(created, 1);
    suns.set("canvas", "sol", false);
    assert.equal((await call("/canvas", { ops: [] }, "sol")).status, 403);
  } finally { server.close(); }
});
