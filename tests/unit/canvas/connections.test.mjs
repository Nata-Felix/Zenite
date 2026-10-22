import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "connections.mjs");
await build({ entryPoints: ["src/renderer/connections.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { connectedNodes, connectionError } = await import(pathToFileURL(outfile).href);
const nodes = [{ id: "agent", type: "terminal" }, { id: "note", type: "note" }, { id: "web", type: "web" }, { id: "cli", type: "terminal" }, { id: "draw", type: "draw" }];

test("constelação lista ligações de entrada e saída, sem repetir e sem incluir transitivas", () => {
  const edges = [{ source: "agent", target: "note" }, { source: "web", target: "agent" }, { source: "note", target: "agent" }, { source: "note", target: "cli" }];
  assert.deepEqual(connectedNodes("agent", nodes, edges).map((n) => n.id), ["note", "web"]);
});

test("constelação ignora desenhos, a própria origem e destinos removidos", () => {
  const edges = ["agent", "draw", "removed"].map((target) => ({ source: "agent", target }));
  assert.deepEqual(connectedNodes("agent", nodes, edges), []);
});

test("nova linha aceita qualquer elemento e recusa duplicatas nos dois sentidos", () => {
  assert.equal(connectionError("agent", "web", nodes, []), null);
  assert.ok(connectionError("agent", "web", nodes, [{ source: "web", target: "agent" }]));
  assert.ok(connectionError("agent", "web", nodes, [{ source: "agent", target: "web" }]));
});

test("nova linha recusa a própria origem, desenhos e elementos ausentes", () => {
  for (const target of ["agent", "draw", "removed"]) assert.ok(connectionError("agent", target, nodes, []));
  assert.ok(connectionError("removed", "agent", nodes, []));
});
