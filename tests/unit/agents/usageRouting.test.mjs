// Limite de uso no roteamento: o zn list mostra o uso, o zn ask recusa quem esgotou (dizendo quem tem
// folga) e pedidos abertos para quem esgotou são encerrados. Servidor e CLI reais; terminais simulados.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(process.cwd(), "out", "test");
const cliPath = join(out, "usage-cli.cjs");
await build({ entryPoints: ["src/cli/index.ts"], bundle: true, platform: "node", format: "cjs", outfile: cliPath, logLevel: "silent" });
const modPath = join(out, "usage-control.mjs");
await build({ entryPoints: ["src/main/controlServer.ts"], bundle: true, platform: "node", format: "esm", outfile: modPath, logLevel: "silent" });
const { ControlServer } = await import(pathToFileURL(modPath).href);

const address = process.platform === "win32" ? `\\\\.\\pipe\\o-test-${randomBytes(6).toString("hex")}` : join(tmpdir(), `o-test-${randomBytes(6).toString("hex")}.sock`);

// Canvas: o Sol (A) ligado a dois executores, Codex 2 (B) e Codex Reserva (C).
const titles = { A: "Sol", B: "Codex 2", C: "Codex Reserva" };
const links = { A: ["B", "C"], B: ["A"], C: ["A"] };
const graph = (id) =>
  titles[id]
    ? {
        me: { id, title: titles[id], ...(id === "A" ? { sun: true } : {}) },
        linked: links[id].map((k) => ({ id: k, title: titles[k], kind: "terminal" })),
        others: [],
      }
    : null;

const written = [];
const ptys = {
  has: (id) => id in titles,
  verify: (id, token) => token === `tok-${id}`,
  write: (id, data) => void written.push([id, data]),
  snapshot: async () => "",
  acceptsPaste: () => false,
};
const elements = new Proxy({}, { get: () => () => null });

const usage = { notes: {}, blocked: {}, refreshes: 0 };
const usageInfo = {
  note: (id) => usage.notes[id],
  blocked: (id) => (usage.blocked[id] ? { until: usage.blocked[id] } : null),
  refresh: async () => void usage.refreshes++,
};

let control;
before(async () => {
  control = new ControlServer(ptys, graph, elements, undefined, undefined, undefined, usageInfo);
  await control.listen(address);
});
after(() => control.close());

function zn(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [cliPath, ...args], { env: { ...process.env, O_PIPE: address, O_TERMINAL_ID: "A", O_TOKEN: "tok-A" } });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
const textTo = (id) => written.filter(([t]) => t === id).map(([, d]) => d).join("");
async function waitFor(check, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("tempo esgotado esperando");
    await new Promise((r) => setTimeout(r, 50));
  }
}

test("zn list mostra o uso de cada terminal e lê o uso na hora da consulta", async () => {
  usage.notes.B = "uso 5h 92%, semana 30%";
  const before = usage.refreshes;
  const r = await zn(["list"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /"Codex 2" \[terminal\] \(ativo · uso 5h 92%, semana 30%\)/);
  assert.match(r.stdout, /"Codex Reserva" \[terminal\] \(ativo\)/);
  assert.ok(usage.refreshes > before, "o uso é relido a cada consulta");
  // O Sol fica sabendo do papel dele.
  assert.match(r.stdout, /Papel: você é o Sol, o orquestrador desta galáxia/);
});

test("zn ask para quem esgotou é recusado e diz quem tem folga", async () => {
  usage.blocked.B = Date.now() + 60 * 60 * 1000;
  usage.notes.C = "uso 5h 10%";
  const r = await zn(["ask", "Codex 2", "faça X", "--no-wait"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /"Codex 2" está com o limite de uso atingido \(zera (?:em \d\d\/\d\d )?às \d\d:\d\d\)/);
  assert.match(r.stderr, /Ligados a você e com folga: "Codex Reserva" \(uso 5h 10%\)/);
  assert.match(r.stderr, /--force/);
  assert.equal(textTo("B"), "", "nada foi colado no terminal esgotado");
});

test("--force manda mesmo assim", async () => {
  const r = await zn(["ask", "Codex 2", "manda assim mesmo", "--no-wait", "--force"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(textTo("B"), /manda assim mesmo/);
  delete usage.blocked.B;
});

test("pedido esperando resposta é encerrado quando o executor esgota", async () => {
  const asking = zn(["ask", "Codex Reserva", "tarefa longa", "--timeout", "30"]);
  await waitFor(() => textTo("C").includes("tarefa longa"));
  control.terminalLimited("C", Date.now() + 30 * 60 * 1000);
  const r = await asking;
  assert.equal(r.code, 1);
  assert.match(r.stdout, /"Codex Reserva" atingiu o limite de uso antes de responder \(pedido #\d+\)/);
});

test("pedido sem espera: quem pediu é avisado no próprio terminal", async () => {
  const r = await zn(["ask", "Codex Reserva", "outra tarefa", "--no-wait", "--json"]);
  assert.equal(r.code, 0, r.stderr);
  const { request } = JSON.parse(r.stdout);
  control.terminalLimited("C", Date.now() + 30 * 60 * 1000);
  await waitFor(() => textTo("A").includes(`pedido #${request} não concluído`));
  assert.match(textTo("A"), /"Codex Reserva" atingiu o limite de uso \(zera (?:em \d\d\/\d\d )?às \d\d:\d\d\)/);
  // O pedido não fica pendurado: um reply atrasado não acha mais nada para responder.
  assert.equal(control.terminalLimited("C"), undefined);
});
