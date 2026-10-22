// zn agent: telas anonimizadas do Codex 0.163 e do Antigravity 1.4 (capturadas em 21/10/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "agentControl.mjs");
await build({ entryPoints: ["src/main/agentControl.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const m = await import(pathToFileURL(outfile).href);

const CODEX_MODEL = `
  >_ OpenAI Codex (v0.163.0)
     C:\\projeto

  Select Model and Effort
  1. GPT-6.1-Sol            Latest workhorse model for coding and everyday work.
› 2. GPT-6-Astra (current)  Frontier intelligence for the most demanding work.
  3. GPT-6-Sol              Previous generation workhorse model.
  4. GPT-6-Luna             Fast and affordable model for easier tasks.

  enter select · esc back`;

const CODEX_EFFORT = `
  Select Reasoning Level for GPT-6-Astra
  1. Low (default)     Fast responses with lighter reasoning
› 2. Medium (current)  Balances speed and reasoning depth for everyday tasks
  3. High              Greater reasoning depth for complex problems
  4. Extra high        Extra high reasoning depth for complex problems
  5. More reasoning…   Max and Ultra consume usage limits faster
  enter default · s session · esc back`;

const AGY_MODEL = `
>
Switch Model
  Search:
          ────────────────────
> Gemini 3.8 Flash             (current)
  Claude Sonnet 4.6 (Thinking)
  Claude Opus 4.6 (Thinking)
  Gemini 4 Argon
  Effort  ◂        ●━━━━━━━━━━━━━━●━━━━━━━━━━━━━━◉        ▸
                  low          medium          high
            Deepest reasoning for complex problems — slower but strongest
Keyboard: ↑/↓ Navigate  ←/→ Effort  enter Select  esc Go Back`;

const CODEX_STATUS = `
  Model:               GPT-6-Astra (reasoning medium)
  Permissions:         Workspace (Ask for approval)
  Account:             conta@example.com (Plus)
  5h limit:            [███████████████░░░░░] 77% left (resets 13:56)
  Weekly limit:        [███████████████████░] 94% left (resets 08:08 on 27 Oct)`;

const AGY_SLASH = `
> /
   ↑ 6 more
  /codesearch (cs)     Search code in the workspace (usage: /codesearch <query>)
  /config (settings)   Open settings panel
> /context             Visualize current context usage
   ↓ 35 more
  ↑/↓ Navigate · enter Select · tab Complete`;

test("menu de permissões não conta descrições quebradas como opções", () => {
  const parsed = m.parseMenu(`
Update Model Permissions
› 1. Ask for approval (current)  Read and edit workspace files, with approval for internet or edits outside
                                 the workspace
  2. Approve for me              Only ask for potentially unsafe actions
  3. Full Access                 Read and edit files outside the workspace
  4. Read Only                   Read workspace files
enter select · esc back`);
  assert.equal(parsed.items.length, 4);
  assert.equal(parsed.items.findIndex((item) => /Full Access/.test(item.text)), 2);
  assert.equal(parsed.items[0].selected, true);
});

test("reconhece o agente pelo comando", () => {
  assert.equal(m.agentOf("codex -m gpt"), "codex");
  assert.equal(m.agentOf("C:\\Users\\x\\AppData\\Local\\agy\\bin\\agy.exe --effort high"), "antigravity");
  assert.equal(m.agentOf("claude"), "claude");
  assert.equal(m.agentOf("claude", "openrouter"), "claude");
  assert.equal(m.agentOf(""), "shell");
  assert.equal(m.agentOf("npm run dev"), "other");
});

test("menu numerado do Codex: opções e a selecionada", () => {
  const menu = m.parseMenu(CODEX_MODEL);
  const options = menu.items.filter((i) => /^\d\./.test(i.text));
  assert.equal(options.length, 4);
  assert.ok(options[1].selected && options[1].text.includes("GPT-6-Astra"));
  assert.match(m.parseMenu(CODEX_EFFORT).footer, /s session/);
});

test("menu do Antigravity ignora régua, controle de esforço e rótulos", () => {
  const texts = m.parseMenu(AGY_MODEL).items.map((i) => i.text);
  assert.ok(!texts.some((t) => /─|◂|^low\s+medium/.test(t)), texts.join(" | "));
  assert.equal(m.parseMenu(AGY_MODEL).items.find((i) => i.selected).text.replace(/\s+/g, " "), "Gemini 3.8 Flash (current)");
  assert.deepEqual(m.parseSlider(AGY_MODEL), { labels: ["low", "medium", "high"], current: 2 });
});

test("controle de esforço no meio: depois do atual as marcas são vazias", () => {
  const mid = AGY_MODEL.replace("●━━━━━━━━━━━━━━●━━━━━━━━━━━━━━◉", "●━━━━━━━━━━━━━━◉──────────────○");
  assert.deepEqual(m.parseSlider(mid), { labels: ["low", "medium", "high"], current: 1 });
  const low = AGY_MODEL.replace("●━━━━━━━━━━━━━━●━━━━━━━━━━━━━━◉", "◉──────────────○──────────────○");
  assert.equal(m.parseSlider(low).current, 0);
});

test("lista de comandos de barra com apelidos e descrição", () => {
  assert.deepEqual(m.parseSlashList(AGY_SLASH).map((c) => c.name), ["/codesearch", "/config", "/context"]);
  assert.match(m.parseSlashList(AGY_SLASH)[1].description, /^\(settings\) Open settings panel/);
});

test("campos do /status do Codex, sem a barra de progresso", () => {
  const f = m.parseStatusFields(CODEX_STATUS);
  assert.equal(f.Model, "GPT-6-Astra (reasoning medium)");
  assert.equal(f["5h limit"], "77% left (resets 13:56)");
  assert.equal(f["Weekly limit"], "94% left (resets 08:08 on 27 Oct)");
});

test("modelo e esforço na linha de comando de cada agente", () => {
  assert.equal(m.withModelAndEffort("codex", "codex -c model_reasoning_effort=low", "gpt-6-sol", "high"), "codex -m gpt-6-sol -c model_reasoning_effort=high");
  assert.equal(m.withModelAndEffort("antigravity", "agy --effort low", undefined, "max"), "agy --effort max");
  assert.equal(m.withModelAndEffort("claude", "claude", "opus"), "claude --model opus");
  assert.equal(m.withModelAndEffort("claude", "claude --effort low", undefined, "high"), "claude --effort high");
  assert.throws(() => m.withModelAndEffort("shell", "", "x"), /não tem modelo/);
  assert.deepEqual(m.modelAndEffortOf("codex", "codex -m gpt-6-sol -c model_reasoning_effort=high"), { model: "gpt-6-sol", effort: "high" });
  assert.deepEqual(m.modelAndEffortOf("antigravity", "agy --model x --effort low"), { model: "x", effort: "low" });
});

test("trabalhando ou livre", () => {
  assert.ok(m.looksBusy("• Working (12s • esc to interrupt)"));
  assert.ok(!m.looksBusy("› Ask Codex to do anything"));
});

/** Terminal de mentira: cada tecla muda a tela como o CLI faria. */
function fakeTerm(screens, onKey) {
  let screen = screens;
  const keys = [];
  return {
    keys,
    set(s) { screen = s; },
    write(d) { keys.push(d); onKey?.(d, this); },
    snapshot: async () => screen,
    quiet: () => ({ open: 10_000, idle: 10_000 }),
  };
}

test("pick anda com as setas até a opção e confirma", async () => {
  const t = fakeTerm(CODEX_MODEL, (d, self) => {
    if (d === "\x1b[B") self.set(CODEX_MODEL.replace("› 2.", "  2.").replace("  3. GPT-6-Sol", "› 3. GPT-6-Sol"));
  });
  await m.pick(t, "GPT-6-Sol");
  assert.deepEqual(t.keys, ["\x1b[B", "\r"], "uma seta para baixo e Enter (e não parou no GPT-6.1-Sol)");
  await assert.rejects(m.pick(t, "Modelo que não existe"), /não está no menu/);
});

test("slide anda com ←/→ até o esforço", async () => {
  const t = fakeTerm(AGY_MODEL, (d, self) => {
    if (d === "\x1b[D\x1b[D") self.set(AGY_MODEL.replace("●━━━━━━━━━━━━━━●━━━━━━━━━━━━━━◉", "◉━━━━━━━━━━━━━━●━━━━━━━━━━━━━━●"));
  });
  await m.slide(t, "low");
  assert.deepEqual(t.keys, ["\x1b[D\x1b[D", "\r"]);
  await assert.rejects(m.slide(t, "ultra"), /não está disponível/);
});
