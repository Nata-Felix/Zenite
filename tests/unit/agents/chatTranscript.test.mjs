// Aba Chat: cada CLI grava a conversa num formato próprio; o leitor transforma tudo em mensagens,
// ações, perguntas e avisos do Zênite, e acha o arquivo de cada terminal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "chatTranscript.mjs");
await build({ entryPoints: ["src/main/chatTranscript.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { antigravityFile, claudeFile, codexFile, newState, PARSERS, TranscriptReader, withOptions } = await import(pathToFileURL(outfile).href);

const run = (agent, records) => { const s = newState(); for (const r of records) PARSERS[agent](s, r); return s; };
const kinds = (s) => s.items.map((i) => i.kind);

test("Claude: mensagem, ferramenta, resposta e pergunta interativa respondida", () => {
  const s = run("claude", [
    { type: "user", message: { content: "liste os arquivos" } },
    { type: "user", isMeta: true, message: { content: "<system-reminder>x</system-reminder>" } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls", description: "Lista os arquivos" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "a\nb" }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "q1", name: "AskUserQuestion", input: { questions: [{ question: "Qual?", multiSelect: false, options: [{ label: "A" }, { label: "B" }] }] } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "q1", content: "A" }] } },
    { type: "assistant", message: { content: [{ type: "text", text: "Pronto." }], stop_reason: "end_turn" } },
  ]);
  assert.deepEqual(kinds(s), ["user", "tool", "question", "assistant"]);
  assert.equal(s.items[1].label, "Lista os arquivos");
  assert.deepEqual(s.items[2].questions[0].options, ["A", "B"]);
  assert.equal(s.items[2].answered, true);
  assert.equal(s.working, false);
});

test("Claude: comando de barra aparece como mensagem; aviso do Zênite vira nota", () => {
  const s = run("claude", [
    { type: "user", message: { content: "<command-name>/model</command-name>\n<command-args></command-args>" } },
    { type: "user", message: { content: "<pasted_content id=\"1\">\n[Zênite · orientação do Sol]\nFaça isto.\n</pasted_content>" } },
  ]);
  assert.deepEqual(s.items.map((i) => [i.kind, i.text]), [["user", "/model"], ["note", "Zênite · orientação do Sol"]]);
});

test("Codex: ignora instruções injetadas, junta comando do exec e marca fim do turno", () => {
  const s = run("codex", [
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions\n..." }, { type: "input_text", text: "<environment_context>x</environment_context>" }] } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "oi" }, { type: "input_image", image_url: "data:..." }] } },
    { type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "c1", input: 'text(await tools.exec_command({cmd:"zn list"}))' } },
    { type: "response_item", payload: { type: "function_call", name: "wait", call_id: "c2", arguments: "{}" } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Escolha:\n\n1. Rápido\n2. Completo\n\nQual?" }] } },
    { type: "event_msg", payload: { type: "task_complete" } },
  ]);
  assert.deepEqual(kinds(s), ["user", "tool", "assistant"]);
  assert.equal(s.items[0].images, 1);
  assert.equal(s.items[1].label, "zn list");
  assert.equal(s.working, false);
  assert.deepEqual(withOptions(s.items).at(-1).options.map((o) => o.key), ["1", "2"]);
});

test("Codex: pergunta assíncrona se responde por texto e só fecha com a próxima mensagem", () => {
  const s = run("codex", [
    { type: "response_item", payload: { type: "function_call", name: "request_user_input_async", call_id: "q", arguments: JSON.stringify({ questions: [{ title: "Qual?", options: ["Um", "Dois"] }] }) } },
    // O Codex devolve o resultado na hora, sem a pessoa ter escolhido.
    { type: "response_item", payload: { type: "function_call_output", call_id: "q", output: "aguardando" } },
  ]);
  assert.equal(s.items[0].answerBy, "text");
  assert.equal(s.items[0].answered, false);
  PARSERS.codex(s, { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Um" }] } });
  assert.equal(s.items[0].answered, true);
});

test("Codex: pergunta síncrona fecha com o resultado da ferramenta", () => {
  const s = run("codex", [
    { type: "response_item", payload: { type: "function_call", name: "request_user_input", call_id: "q", arguments: JSON.stringify({ questions: [{ title: "Qual?", options: ["Um", "Dois"] }] }) } },
  ]);
  assert.equal(s.items[0].answerBy, "menu");
  PARSERS.codex(s, { type: "response_item", payload: { type: "function_call_output", call_id: "q", output: "Um" } });
  assert.equal(s.items[0].answered, true);
});

test("Antigravity: tira as marcas do pedido, separa ferramentas e perguntas", () => {
  const s = run("antigravity", [
    { step_index: 0, type: "USER_INPUT", status: "DONE", content: "<USER_REQUEST>\nola\n</USER_REQUEST>\n<ADDITIONAL_METADATA>x</ADDITIONAL_METADATA>", media: [{ mime_type: "image/png", uri: "f" }] },
    { step_index: 1, type: "PLANNER_RESPONSE", status: "DONE", tool_calls: [{ name: "run_command", args: { CommandLine: "\"zn list\"", toolSummary: "\"Run zn list\"" } }] },
    { step_index: 2, type: "GENERIC", status: "DONE", content: "saída" },
    { step_index: 3, type: "PLANNER_RESPONSE", status: "DONE", tool_calls: [{ name: "ask_question", args: { questions: JSON.stringify([{ question: "Qual?", options: ["X", "Y"], is_multi_select: false }]) } }] },
  ]);
  assert.deepEqual(kinds(s), ["user", "tool", "question"]);
  assert.equal(s.items[0].text, "ola");
  assert.equal(s.items[0].images, 1);
  assert.equal(s.items[1].label, "Run zn list");
  assert.equal(s.items[2].answered, false);
  PARSERS.antigravity(s, { step_index: 4, type: "GENERIC", status: "DONE", content: "A1: X" });
  PARSERS.antigravity(s, { step_index: 5, type: "PLANNER_RESPONSE", status: "DONE", content: "Feito." });
  assert.equal(s.items[2].answered, true);
  assert.equal(s.working, false);
});

test("Leitura incremental: só linhas completas, e recomeça se o arquivo encolher", () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-"));
  const file = join(dir, "s.jsonl");
  const line = (o) => JSON.stringify(o) + "\n";
  writeFileSync(file, line({ type: "user", message: { content: "um" } }) + '{"type":"assis');
  const r = new TranscriptReader();
  assert.equal(r.read("t", "claude", file).items.length, 1);
  appendFileSync(file, 'tant","message":{"content":[{"type":"text","text":"dois"}]}}\n');
  assert.deepEqual(r.read("t", "claude", file).items.map((i) => i.text), ["um", "dois"]);
  writeFileSync(file, line({ type: "user", message: { content: "novo" } }));
  assert.deepEqual(r.read("t", "claude", file).items.map((i) => i.text), ["novo"]);
});

test("Localizar: Claude pelo pid, Codex pela pasta sem pegar o de outro terminal, Antigravity pelo mapa de pastas", () => {
  const home = mkdtempSync(join(tmpdir(), "chat-home-"));
  const cwd = "C:\\Proj";
  // Claude
  mkdirSync(join(home, "claude", "sessions"), { recursive: true });
  mkdirSync(join(home, "claude", "projects", "C--Proj"), { recursive: true });
  writeFileSync(join(home, "claude", "sessions", "42.json"), JSON.stringify({ sessionId: "abc", cwd }));
  writeFileSync(join(home, "claude", "projects", "C--Proj", "abc.jsonl"), "");
  assert.equal(claudeFile(join(home, "claude"), [7, 42], cwd, 0), join(home, "claude", "projects", "C--Proj", "abc.jsonl"));
  // Codex
  const d = new Date();
  const day = join(home, "codex", "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
  mkdirSync(day, { recursive: true });
  const meta = (dir) => JSON.stringify({ type: "session_meta", payload: { cwd: dir } }) + "\n";
  writeFileSync(join(day, "rollout-a.jsonl"), meta("c:\\proj\\"));
  writeFileSync(join(day, "rollout-b.jsonl"), meta("C:\\Outra"));
  assert.equal(codexFile(join(home, "codex"), cwd, 0, new Set()), join(day, "rollout-a.jsonl"));
  assert.equal(codexFile(join(home, "codex"), cwd, 0, new Set([join(day, "rollout-a.jsonl")])), undefined);
  // Antigravity
  const agy = join(home, "agy");
  const t = join(agy, "brain", "conv1", ".system_generated", "logs");
  mkdirSync(t, { recursive: true });
  mkdirSync(join(agy, "cache"), { recursive: true });
  writeFileSync(join(t, "transcript.jsonl"), "");
  writeFileSync(join(agy, "cache", "last_conversations.json"), JSON.stringify({ "C:\\Proj": "conv1" }));
  assert.equal(antigravityFile(agy, cwd, 0, new Set()), join(t, "transcript.jsonl"));
});

test("Imagens: o marcador [Image #N] sai do texto e cada imagem vira uma referência", () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-img-"));
  const file = join(dir, "s.jsonl");
  writeFileSync(file, [
    { type: "user", message: { content: [{ type: "text", text: "[Image #2]Descreva esta imagem." }, { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } }] } },
  ].map((o) => JSON.stringify(o)).join("\n") + "\n");
  const r = new TranscriptReader();
  const [msg] = r.read("t", "claude", file).items;
  assert.equal(msg.text, "Descreva esta imagem.");
  assert.equal(msg.images, 1);
  assert.deepEqual(r.image("t", msg.imageRefs[0]), { mime: "image/png", data: "QUJD" });
});

test("Imagens: Codex em data URL e Antigravity em arquivo", () => {
  const codex = run("codex", [{ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "veja" }, { type: "input_image", image_url: "data:image/jpeg;base64,/9j/AA" }] } }]);
  assert.deepEqual(codex.images.get(codex.items[0].imageRefs[0]), { mime: "image/jpeg", data: "/9j/AA" });
  const agy = run("antigravity", [{ step_index: 0, type: "USER_INPUT", status: "DONE", content: "<USER_REQUEST>veja</USER_REQUEST>", media: [{ mime_type: "image/png", uri: "file:///C:/tmp/print.png" }] }]);
  assert.deepEqual(agy.images.get(agy.items[0].imageRefs[0]), { mime: "image/png", file: "C:/tmp/print.png" });
});

test("Claude: interrupção vira nota, fecha a pergunta e para o 'trabalhando'", () => {
  const s = run("claude", [
    { type: "assistant", message: { content: [{ type: "tool_use", id: "q", name: "AskUserQuestion", input: { questions: [{ question: "Posso?", options: [{ label: "Sim" }] }] } }] } },
    { type: "user", message: { content: [{ type: "text", text: "[Request interrupted by user for tool use]" }] } },
  ]);
  assert.deepEqual(s.items.map((i) => i.kind), ["question", "note"]);
  assert.equal(s.items[0].answered, true);
  assert.equal(s.items[1].text, "Interrompido");
  assert.equal(s.working, false);
});
