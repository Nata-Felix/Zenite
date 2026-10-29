import type { AgentProvider } from "../shared/types";

/**
 * O Sol comanda os CLIs dos outros terminais como uma pessoa faria: digita comandos de barra,
 * lê a tela, rola menus e escolhe opções. Tudo aqui foi conferido nas telas reais:
 *  - Codex 0.163: /status (modelo, esforço, conta, limites de 5h e semana); /model abre um menu
 *    numerado (modelo → esforço; Enter grava como padrão, "s" vale só para esta sessão).
 *  - Antigravity 1.4: /usage (cota por grupo de modelos), /model (lista + controle de esforço com
 *    ←/→), /effort (só o controle); a lista de "/" mostra 5 por vez com "↓ N more".
 *  - Claude Code: não instalado nesta máquina; /status, /usage e /model <nome> seguem a
 *    documentação dele (o comando genérico zn agent run funciona em qualquer caso).
 */

export type AgentKind = "codex" | "claude" | "antigravity" | "grok" | "shell" | "other";

/** Programa que o terminal roda (pelo comando, como o "Novo terminal" reconhece). */
export function agentOf(command: string, provider?: AgentProvider): AgentKind {
  if (provider === "openrouter") return "claude";
  const program = command.trim().split(/\s+/)[0]?.split(/[\\/]/).pop()?.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase() ?? "";
  if (!program) return "shell";
  if (program === "codex") return "codex";
  if (program === "claude") return "claude";
  if (program === "agy" || program === "antigravity") return "antigravity";
  if (program === "grok") return "grok";
  if (["pwsh", "powershell", "cmd", "bash", "sh", "zsh"].includes(program)) return "shell";
  return "other";
}

export const AGENT_LABEL: Record<AgentKind, string> = { codex: "Codex", claude: "Claude Code", antigravity: "Antigravity", grok: "Grok CLI", shell: "Shell", other: "Comando" };

/** Esforços que cada CLI aceita na linha de comando (os do Codex dependem do modelo). */
export const EFFORTS: Partial<Record<AgentKind, string[]>> = {
  codex: ["minimal", "low", "medium", "high", "xhigh"],
  antigravity: ["low", "medium", "high", "xhigh", "max"],
  claude: ["low", "medium", "high", "xhigh", "max"],
};

/** Como pôr modelo e esforço na linha de comando (vale ao abrir ou reiniciar o terminal). */
export function withModelAndEffort(kind: AgentKind, command: string, model?: string, effort?: string): string {
  let c = command.trim();
  const drop = (re: RegExp) => (c = c.replace(re, " ").replace(/\s+/g, " ").trim());
  const arg = (v: string) => (/^[\w.:/-]+$/.test(v) ? v : `"${v.replace(/"/g, "")}"`);
  if (kind === "codex") {
    if (model) {
      drop(/\s(-m|--model)\s+("[^"]*"|\S+)/g);
      c += ` -m ${arg(model)}`;
    }
    if (effort) {
      drop(/\s-c\s+model_reasoning_effort=\S+/g);
      c += ` -c model_reasoning_effort=${effort}`;
    }
    return c;
  }
  if (kind === "antigravity" || kind === "claude") {
    if (model) {
      drop(/\s--model\s+("[^"]*"|\S+)/g);
      c += ` --model ${arg(model)}`;
    }
    if (effort) {
      drop(/\s--effort\s+\S+/g);
      c += ` --effort ${effort}`;
    }
    return c;
  }
  throw new Error(`${AGENT_LABEL[kind]} não tem modelo/esforço que o Zênite saiba pôr na linha de comando.`);
}

/** Modelo e esforço que a linha de comando pede (o que vale de fato aparece no zn agent status). */
export function modelAndEffortOf(kind: AgentKind, command: string): { model?: string; effort?: string } {
  const m = command.match(kind === "codex" ? /\s(?:-m|--model)\s+("[^"]*"|\S+)/ : /\s--model\s+("[^"]*"|\S+)/);
  const e = command.match(kind === "codex" ? /model_reasoning_effort=(\S+)/ : /\s--effort\s+(\S+)/);
  return { ...(m ? { model: m[1].replace(/"/g, "") } : {}), ...(e ? { effort: e[1] } : {}) };
}

/** Qual comando de barra mostra cada coisa, por agente. */
export const SLASH: Partial<Record<AgentKind, { status?: string; usage?: string; model?: string; effort?: string }>> = {
  codex: { status: "/status", usage: "/status", model: "/model", effort: "/model" },
  antigravity: { status: "/usage", usage: "/usage", model: "/model", effort: "/effort" },
  claude: { status: "/status", usage: "/usage", model: "/model", effort: "/effort" },
};

// ---- leitura da tela ----

/** Marcadores de "esta opção está selecionada" nos menus dos CLIs. */
const MARK = /^\s*([›>❯▶●])\s/;
const ITEM = /^(\s*[›>❯▶●]\s+|\s{2,})\S/;
const FOOTER = /(enter\s+(?:to\s+)?(select|confirm|default)|↑\/↓|esc\s+(back|go back|to cancel|close))/i;

export interface MenuItem {
  text: string;
  selected: boolean;
}

/** Menu aberto na tela: as linhas logo acima do rodapé ("enter select · esc back"...). */
export function parseMenu(screen: string): { items: MenuItem[]; footer: string } | null {
  const lines = screen.split("\n").map((l) => l.replace(/\s+$/, ""));
  let foot = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (FOOTER.test(lines[i])) { foot = i; break; }
  if (foot < 0) return null;
  const items: MenuItem[] = [];
  const NUMBERED = /^(\s*[›>❯▶●]\s+|\s{2,})\d+\.\s/;
  let wrapped = "";
  for (let i = foot - 1; i >= 0; i--) {
    let line = lines[i];
    if (!line.trim()) continue;
    // Opção numerada longa que quebrou a linha sem recuo ("…(Persist to" / "settings.json)").
    if (!ITEM.test(line) && NUMBERED.test(lines[i - 1] ?? "")) { wrapped = `${line.trim()} ${wrapped}`.trim(); continue; }
    if (!ITEM.test(line)) break;
    if (wrapped) { line = `${line} ${wrapped}`; wrapped = ""; }
    // Linhas de dica do próprio menu ("↓ 35 more", "Search:", réguas, o controle de esforço e os
    // rótulos embaixo dele) não são opções.
    const slider = (l?: string) => !!l && /[◂▸]/.test(l);
    if (/^\s*[↑↓]\s+\d+\s+more/i.test(line) || /^\s*search:/i.test(line) || /^[\s─━]+$/.test(line) || slider(line) || slider(lines[i - 1])) continue;
    // Réguas de desenho de caixa coladas na opção ("4. Type something. ────") não fazem parte do texto.
    items.unshift({ text: line.replace(MARK, "").replace(/\s*[─━═│┃╭╮╰╯]{2,}.*$/, "").trim(), selected: MARK.test(line) });
    if (items.length > 60) break;
  }
  // Nos menus numerados, descrições podem quebrar em outra linha recuada. Elas não são opções.
  const numbered = items.filter((item) => /^\d+\.\s/.test(item.text));
  const choices = numbered.length ? numbered : items;
  return choices.length ? { items: choices, footer: lines[foot].trim() } : null;
}

/** Comandos de barra visíveis na lista do "/" (nome e descrição). */
export function parseSlashList(screen: string): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = [];
  for (const raw of screen.split("\n")) {
    const m = raw.match(/^\s*(?:[›>❯▶●]\s*)?(\/[\w-]+)(\s+\([^)]*\))?\s{2,}(\S.*)$/);
    if (m) out.push({ name: m[1], description: `${m[2] ? `${m[2].trim()} ` : ""}${m[3].trim()}` });
  }
  return out;
}

/** O agente está no meio de um trabalho? (os CLIs mostram "esc to interrupt" enquanto trabalham) */
export function looksBusy(screen: string): boolean {
  return /esc to interrupt|working \(|thinking…|\bWorking\b.*\d+s/i.test(screen);
}

/** Controle de esforço de deslizar (Antigravity): rótulos e a posição atual (◉). */
export function parseSlider(screen: string): { labels: string[]; current: number } | null {
  const lines = screen.split("\n");
  const at = lines.findIndex((l) => /[◂▸]/.test(l) && /[●◉○]/.test(l));
  if (at < 0) return null;
  // Antes do atual (◉) as marcas são cheias (●); depois dele, vazias (○).
  const marks = [...lines[at]].filter((ch) => ch === "●" || ch === "◉" || ch === "○");
  const current = marks.indexOf("◉");
  const labels = (lines[at + 1] ?? "").trim().split(/\s+/).filter(Boolean);
  return labels.length ? { labels, current: current < 0 ? 0 : current } : null;
}

/** Campos do /status do Codex ("Model:", "5h limit:", ...), sem a barra de progresso. */
export function parseStatusFields(screen: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of screen.split("\n")) {
    const m = raw.match(/^\s*([A-Za-z0-9][\w .()/-]{1,30}):\s{2,}(.+?)\s*$/);
    if (m) out[m[1].trim()] = m[2].replace(/\[[█░▓▒ ]+\]\s*/g, "").trim();
  }
  return out;
}

// ---- ações sobre um terminal ----

export interface AgentTerm {
  write(data: string): void;
  snapshot(lines?: number): Promise<string | null>;
  quiet(): { open: number; idle: number } | null;
}

const DOWN = "\x1b[B";
const UP = "\x1b[A";
const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
export const ESC = "\x1b";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera a tela parar de mudar (o CLI terminou de desenhar). */
export async function settle(t: AgentTerm, opts: { min?: number; quiet?: number; max?: number } = {}): Promise<void> {
  const { min = 400, quiet = 900, max = 15_000 } = opts;
  await sleep(min);
  const end = Date.now() + max;
  while (Date.now() < end) {
    const q = t.quiet();
    if (!q || q.idle >= quiet) return;
    await sleep(150);
  }
}

async function screen(t: AgentTerm, lines = 80): Promise<string> {
  const s = await t.snapshot(lines);
  if (s === null) throw new Error("O terminal está encerrado.");
  return s;
}

/** Espera o agente ficar livre antes de mexer (ou recusa, para não atrapalhar um trabalho). */
export async function whenIdle(t: AgentTerm, force: boolean, waitMs = 10_000): Promise<void> {
  const end = Date.now() + waitMs;
  while (true) {
    const s = await screen(t, 40);
    const q = t.quiet();
    if (force || (!looksBusy(s) && (q?.idle ?? 0) >= 800)) return;
    if (Date.now() > end) throw new Error("O agente está trabalhando agora. Espere terminar, interrompa (zn agent interrupt) ou use --force.");
    await sleep(400);
  }
}

/** Digita um comando de barra (ou qualquer texto), aperta Enter e devolve a tela quando ela para. */
export async function runSlash(t: AgentTerm, text: string, opts: { max?: number } = {}): Promise<string> {
  t.write(text);
  await settle(t, { min: 300, quiet: 500, max: 3000 });
  t.write("\r");
  await settle(t, { min: 700, quiet: 1200, max: opts.max ?? 20_000 });
  return screen(t);
}

/** Lista os comandos de barra do CLI: digita "/", rola a lista inteira e apaga o "/". */
export async function listCommands(t: AgentTerm): Promise<{ name: string; description: string }[]> {
  t.write("/");
  await settle(t, { min: 500, quiet: 600, max: 4000 });
  const seen = new Map<string, string>();
  let still = 0;
  for (let i = 0; i < 40 && still < 2; i++) {
    const before = seen.size;
    for (const c of parseSlashList(await screen(t))) if (!seen.has(c.name)) seen.set(c.name, c.description);
    still = seen.size === before ? still + 1 : 0;
    t.write(DOWN.repeat(5));
    await settle(t, { min: 150, quiet: 300, max: 2000 });
  }
  t.write(ESC);
  await settle(t, { min: 200, quiet: 300, max: 2000 });
  // O Codex e o Claude Code (prompt ❯) fecham a lista mas deixam o "/" escrito.
  if (/^\s*[│┃]?\s*[›>❯]\s*\/\s*([│┃]\s*)?$/m.test(await screen(t, 30))) t.write("\x7f");
  return [...seen].map(([name, description]) => ({ name, description }));
}

/** Escolhe no menu aberto a opção que contém `wanted` (anda com as setas até ela). */
export async function pick(t: AgentTerm, wanted: string, confirm: string | null = "\r"): Promise<string> {
  const want = wanted.trim().toLowerCase();
  const menu = parseMenu(await screen(t));
  if (!menu) throw new Error("Não há menu aberto na tela desse terminal.");
  // Começa com o texto (sem o "2." da frente) ganha de só conter: "GPT-6-Sol" não para em "GPT-6.1-Sol".
  const plain = (i: MenuItem) => i.text.toLowerCase().replace(/^\d+\.\s*/, "");
  let target = menu.items.findIndex((i) => plain(i).startsWith(want));
  if (target < 0) target = menu.items.findIndex((i) => plain(i).includes(want));
  if (target < 0) throw new Error(`Opção "${wanted}" não está no menu. Opções: ${menu.items.map((i) => `"${i.text.replace(/\s{2,}.*/, "")}"`).join(", ")}.`);
  const from = Math.max(0, menu.items.findIndex((i) => i.selected));
  const steps = target - from;
  if (steps) t.write((steps > 0 ? DOWN : UP).repeat(Math.abs(steps)));
  await settle(t, { min: 200, quiet: 350, max: 3000 });
  const now = parseMenu(await screen(t));
  const on = now?.items.find((i) => i.selected);
  if (!on || !plain(on).includes(want)) throw new Error(`Não consegui parar em "${wanted}" (o menu mudou). Veja a tela com zn check.`);
  if (confirm !== null) {
    t.write(confirm);
    await settle(t, { min: 500, quiet: 900, max: 10_000 });
  }
  return screen(t);
}

/** Ajusta o controle de esforço de deslizar (Antigravity) e confirma. */
export async function slide(t: AgentTerm, wanted: string, confirm = true): Promise<string> {
  const s = parseSlider(await screen(t));
  if (!s) throw new Error("Não há controle de esforço na tela.");
  const target = s.labels.findIndex((l) => l.toLowerCase() === wanted.toLowerCase());
  if (target < 0) throw new Error(`Esforço "${wanted}" não está disponível aqui. Opções: ${s.labels.join(", ")}.`);
  const steps = target - s.current;
  if (steps) t.write((steps > 0 ? RIGHT : LEFT).repeat(Math.abs(steps)));
  await settle(t, { min: 200, quiet: 350, max: 3000 });
  if (confirm) {
    t.write("\r");
    await settle(t, { min: 500, quiet: 900, max: 10_000 });
  }
  return screen(t);
}

const CODEX_EFFORT_LABEL: Record<string, string> = { minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "extra high", max: "more reasoning" };

/**
 * Troca modelo e/ou esforço com o agente aberto, pelo menu dele. Sem `save`, vale só para esta
 * sessão quando o CLI deixa escolher (Codex: "s session"); com `save`, vira o padrão da conta.
 */
export async function setModelEffort(kind: AgentKind, t: AgentTerm, opts: { model?: string; effort?: string; save?: boolean }): Promise<string> {
  const { model, effort, save } = opts;
  if (kind === "codex") {
    await runSlash(t, "/model");
    let s = await pick(t, model ?? "(current)");
    const menu = parseMenu(s);
    // Segundo passo: o esforço. Modelo sem esforço configurável já fecha o menu.
    if (menu && /reasoning|effort/i.test(s)) {
      if (effort) await pick(t, CODEX_EFFORT_LABEL[effort] ?? effort, null);
      t.write(!save && /\bs session\b/i.test(menu.footer) ? "s" : "\r");
      await settle(t, { min: 500, quiet: 900, max: 10_000 });
      s = await screen(t);
    } else if (effort) {
      throw new Error("Este modelo do Codex não tem escolha de esforço.");
    }
    return s;
  }
  if (kind === "antigravity") {
    let s = "";
    if (model) {
      await runSlash(t, "/model");
      if (effort) {
        await pick(t, model, null);
        s = await slide(t, effort);
      } else s = await pick(t, model);
    } else if (effort) {
      await runSlash(t, "/effort");
      s = await slide(t, effort);
    }
    return s;
  }
  if (kind === "claude") {
    // /effort do Claude grava o padrão da conta; só esta sessão é pela linha de comando (--effort).
    if (effort && !save) throw new Error(`No Claude Code o esforço só desta sessão vai na abertura: zn terminal edit "Nome" --effort ${effort} e depois zn terminal restart "Nome". Para mudar o padrão da conta, use --save.`);
    let s = "";
    if (model) s = await runSlash(t, `/model ${model}`);
    if (effort) s = await runSlash(t, `/effort ${effort}`);
    return s;
  }
  throw new Error(`${AGENT_LABEL[kind]}: o Zênite não sabe trocar modelo neste programa. Use zn agent run e zn agent pick.`);
}
