import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ChatItem, ChatQuestion } from "../shared/types";
import { replyOptions } from "./composer";

/**
 * Aba Chat dos terminais: a conversa vem dos arquivos que os próprios CLIs gravam a cada passo,
 * não da tela. A tela corta linhas e perde o que rolou; o arquivo traz o markdown inteiro e cada
 * ferramenta em separado.
 *  - Claude Code: <config>/projects/<pasta>/<sessão>.jsonl; <config>/sessions/<pid>.json diz a sessão de cada processo.
 *  - Codex: <CODEX_HOME>/sessions/AAAA/MM/DD/rollout-*.jsonl; a 1ª linha (session_meta) traz a pasta.
 *  - Antigravity: ~/.gemini/antigravity-cli/brain/<conversa>/.system_generated/logs/transcript.jsonl;
 *    cache/last_conversations.json diz a conversa aberta em cada pasta.
 * São formatos internos dos CLIs: o que não for reconhecido é ignorado, nunca quebra a aba.
 */
export type ChatAgent = "claude" | "codex" | "antigravity";

export interface ParseState {
  items: ChatItem[];
  working: boolean;
  /** Chamadas de ferramenta por id, para marcar a pergunta respondida quando chega o resultado. */
  calls: Map<string, ChatItem>;
  seq: number;
}

export const newState = (): ParseState => ({ items: [], working: false, calls: new Map(), seq: 0 });

const MAX_ITEMS = 400;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const json = (v: unknown): any => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return v; } };
const short = (s: string, n = 90) => { const one = s.replace(/\s+/g, " ").trim(); return one.length > n ? `${one.slice(0, n - 1)}…` : one; };

type NewItem = ChatItem extends infer T ? (T extends ChatItem ? Omit<T, "id"> : never) : never;

function push(state: ParseState, item: NewItem): ChatItem {
  const last = state.items[state.items.length - 1];
  // Texto do agente partido em vários registros seguidos vira um balão só.
  if (item.kind === "assistant" && last?.kind === "assistant") { last.text = `${last.text}\n\n${item.text}`.trim(); return last; }
  const full = { id: String(++state.seq), ...item } as ChatItem;
  state.items.push(full);
  if (state.items.length > MAX_ITEMS) state.items.splice(0, state.items.length - MAX_ITEMS);
  return full;
}

/** Mensagem da pessoa ou aviso do Zênite (orientação do Sol, pedidos de outros agentes). */
function pushUser(state: ParseState, text: string, images = 0) {
  const clean = text.replace(/<\/?pasted_content[^>]*>/g, "").trim();
  if (!clean && !images) return;
  if (/^\[Zênite\b|^\[Z.nite\s/.test(clean)) push(state, { kind: "note", text: short(clean.split("\n")[0].replace(/^\[|\]$/g, ""), 120) });
  else {
    // Mensagem da pessoa: qualquer pergunta que ainda estava aberta foi respondida (ou deixada de lado).
    for (const item of state.items) if (item.kind === "question") item.answered = true;
    push(state, { kind: "user", text: clean, images });
  }
}

/** callId vazio: a pergunta não espera resultado de ferramenta e só fecha com a próxima mensagem. */
function question(state: ParseState, callId: string, questions: ChatQuestion[], answerBy: "menu" | "text" = "menu") {
  if (!questions.length) return;
  const item = push(state, { kind: "question", questions, answered: false, answerBy });
  if (callId) state.calls.set(callId, item);
}

function answered(state: ParseState, callId: string) {
  const item = state.calls.get(callId);
  if (item?.kind === "question") item.answered = true;
  state.calls.delete(callId);
}

/** Resumo curto do que a ferramenta fez: o comando, o arquivo ou a descrição que o próprio CLI dá. */
function toolLabel(input: any): string {
  if (!input || typeof input !== "object") return short(str(input));
  const v = json(input.toolSummary) || input.description || json(input.CommandLine) || input.command || input.cmd || input.file_path || json(input.Path) || input.path || input.pattern || input.url || input.query || "";
  return short(str(v));
}

// ---------- Claude Code ----------
export function parseClaude(state: ParseState, o: any) {
  if (!o || o.isSidechain) return;
  if (o.type === "system" && /turn_duration|stop_hook/.test(str(o.subtype))) { state.working = false; return; }
  if (o.type !== "user" && o.type !== "assistant") return;
  const content = o.message?.content;
  if (o.type === "user") {
    if (o.isMeta) return;
    if (typeof content === "string") {
      const cmd = content.match(/<command-name>([^<]+)<\/command-name>/);
      if (cmd) { push(state, { kind: "user", text: cmd[1].trim(), images: 0 }); return; }
      if (/^<(local-command|system-reminder|bash-)/.test(content.trim())) return;
      pushUser(state, content);
      state.working = true;
      return;
    }
    if (!Array.isArray(content)) return;
    let text = "", images = 0, human = false;
    for (const c of content) {
      if (c.type === "tool_result") answered(state, str(c.tool_use_id));
      else if (c.type === "image") { images++; human = true; }
      else if (c.type === "text" && !/^\s*<(system-reminder|local-command)/.test(str(c.text))) { text += (text ? "\n" : "") + str(c.text); human = true; }
    }
    if (human) { pushUser(state, text, images); state.working = true; }
    return;
  }
  state.working = true;
  for (const c of Array.isArray(content) ? content : []) {
    if (c.type === "text" && str(c.text).trim()) push(state, { kind: "assistant", text: str(c.text).trim() });
    else if (c.type === "tool_use") {
      if (c.name === "AskUserQuestion") {
        const qs = (c.input?.questions ?? []).map((q: any) => ({ question: str(q.question), options: (q.options ?? []).map((x: any) => str(x?.label ?? x)), multi: !!q.multiSelect }));
        question(state, str(c.id), qs);
      } else push(state, { kind: "tool", name: str(c.name), label: toolLabel(c.input) });
    }
  }
  if (o.message?.stop_reason === "end_turn") state.working = false;
}

// ---------- Codex ----------
const CODEX_NOISE = new Set(["wait", "write_stdin", "update_plan"]);
export function parseCodex(state: ParseState, o: any) {
  const p = o?.payload;
  if (!p) return;
  if (o.type === "event_msg") {
    if (p.type === "task_started") state.working = true;
    else if (p.type === "task_complete" || p.type === "turn_aborted") state.working = false;
    return;
  }
  if (o.type !== "response_item") return;
  if (p.type === "message") {
    const parts = Array.isArray(p.content) ? p.content : [];
    if (p.role === "assistant") {
      const text = parts.map((c: any) => str(c.text)).join("").trim();
      if (text) push(state, { kind: "assistant", text });
    } else if (p.role === "user") {
      // Instruções injetadas pelo próprio Codex (AGENTS.md, <environment_context>...) não são da pessoa.
      const texts = parts.filter((c: any) => c.type === "input_text" && !/^\s*(<|# AGENTS\.md)/.test(str(c.text))).map((c: any) => str(c.text));
      const images = parts.filter((c: any) => c.type === "input_image").length;
      if (texts.length || images) pushUser(state, texts.join("\n"), images);
    }
    return;
  }
  if (p.type === "function_call" || p.type === "custom_tool_call" || p.type === "local_shell_call") {
    const name = str(p.name) || "shell";
    if (CODEX_NOISE.has(name)) return;
    const args = json(p.arguments ?? p.input);
    if (/^request_user_input/.test(name)) {
      const qs = (args?.questions ?? []).map((q: any) => ({ question: str(q.title ?? q.question), options: (q.options ?? []).map((x: any) => str(x?.label ?? x)), multi: !!q.multi_select }));
      // A versão assíncrona devolve o resultado na hora e não abre menu: responde-se com uma mensagem.
      const async = name.endsWith("_async");
      question(state, async ? "" : str(p.call_id), qs, async ? "text" : "menu");
      return;
    }
    // O exec do Codex é um trecho de código: mostra o primeiro comando de dentro dele.
    const cmd = typeof args === "string" ? args.match(/cmd:\s*\\?"((?:[^"\\]|\\.)+)/)?.[1] : undefined;
    push(state, { kind: "tool", name, label: cmd ? short(cmd.replace(/\\"/g, '"')) : toolLabel(args?.command ? { command: [].concat(args.command).join(" ") } : args) });
    return;
  }
  if (p.type === "function_call_output" || p.type === "custom_tool_call_output") answered(state, str(p.call_id));
}

// ---------- Antigravity ----------
export function parseAntigravity(state: ParseState, o: any) {
  if (!o || o.step_index === undefined) return;
  if (o.type === "USER_INPUT") {
    const raw = str(o.content);
    const text = raw.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/)?.[1] ?? raw;
    pushUser(state, text, Array.isArray(o.media) ? o.media.length : 0);
    state.working = true;
    return;
  }
  if (o.type === "PLANNER_RESPONSE") {
    if (str(o.content).trim()) push(state, { kind: "assistant", text: str(o.content).trim() });
    for (const [i, t] of (Array.isArray(o.tool_calls) ? o.tool_calls : []).entries()) {
      const args = Object.fromEntries(Object.entries(t.args ?? {}).map(([k, v]) => [k, json(v)]));
      if (t.name === "ask_question") {
        const qs = [].concat(json(args.questions) ?? []).map((q: any) => ({ question: str(q.question ?? q.title), options: (q.options ?? []).map((x: any) => str(x?.label ?? x)), multi: !!q.is_multi_select }));
        question(state, `agy-${o.step_index}-${i}`, qs);
      } else push(state, { kind: "tool", name: str(t.name), label: toolLabel(args) });
    }
    // Resposta com texto e sem ferramenta: o turno acabou.
    state.working = !(str(o.content).trim() && !o.tool_calls?.length) || o.status === "RUNNING";
    return;
  }
  if (o.type === "GENERIC") {
    // Resultado de ferramenta: a pergunta anterior (se houver) foi respondida.
    for (const id of [...state.calls.keys()]) if (id.startsWith("agy-")) answered(state, id);
    state.working = true;
  }
}

export const PARSERS: Record<ChatAgent, (s: ParseState, o: any) => void> = { claude: parseClaude, codex: parseCodex, antigravity: parseAntigravity };

/** Opções numeradas no fim da última resposta viram botões (como na caixa de mensagem). */
export function withOptions(items: ChatItem[]): ChatItem[] {
  const last = items[items.length - 1];
  if (last?.kind !== "assistant") return items;
  const options = replyOptions(last.text);
  return options.length ? [...items.slice(0, -1), { ...last, options }] : items;
}

// ---------- Localizar o arquivo de cada terminal ----------
export interface ChatHomes {
  /** Pasta de configuração do Claude Code (CLAUDE_CONFIG_DIR ou ~/.claude). */
  claude: string;
  codex: string;
  /** ~/.gemini/antigravity-cli da conta. */
  antigravity: string;
}

const sameDir = (a: string, b: string) => a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase();
const mtime = (f: string) => { try { return statSync(f).mtimeMs; } catch { return 0; } };

function firstLine(file: string, max = 64 * 1024): string {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(max);
    const n = readSync(fd, buf, 0, max, 0);
    const text = buf.subarray(0, n).toString("utf8");
    const end = text.indexOf("\n");
    return end < 0 ? text : text.slice(0, end);
  } finally { closeSync(fd); }
}

/** Claude: a sessão do processo `claude` que roda dentro do terminal (sessions/<pid>.json). */
export function claudeFile(home: string, pids: number[], cwd: string, since: number): string | undefined {
  for (const pid of pids) {
    const meta = join(home, "sessions", `${pid}.json`);
    if (!existsSync(meta)) continue;
    try {
      const { sessionId, cwd: dir } = JSON.parse(readFileSync(meta, "utf8"));
      if (typeof sessionId !== "string") continue;
      const slug = join(home, "projects", String(dir ?? cwd).replace(/[^A-Za-z0-9]/g, "-"), `${sessionId}.jsonl`);
      if (existsSync(slug)) return slug;
      for (const p of readdirSync(join(home, "projects"))) {
        const f = join(home, "projects", p, `${sessionId}.jsonl`);
        if (existsSync(f)) return f;
      }
    } catch { /* arquivo sendo gravado: tenta na próxima */ }
  }
  // Sem o pid (versão antiga do CLI): a sessão mais recente da pasta, desde que o terminal abriu.
  const dir = join(home, "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"));
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => join(dir, f)).filter((f) => mtime(f) >= since).sort((a, b) => mtime(b) - mtime(a))[0];
}

/** Codex: o rollout mais recente com a pasta do terminal, sem pegar o de outro terminal. */
export function codexFile(home: string, cwd: string, since: number, taken: Set<string>): string | undefined {
  const root = join(home, "sessions");
  const found: string[] = [];
  for (const day of [0, 1]) {
    const d = new Date(Date.now() - day * 86400_000);
    const dir = join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith(".jsonl")) found.push(join(dir, f));
  }
  return found
    .filter((f) => !taken.has(f) && mtime(f) >= since)
    .filter((f) => { try { return sameDir(String(JSON.parse(firstLine(f)).payload?.cwd ?? ""), cwd); } catch { return false; } })
    .sort((a, b) => mtime(b) - mtime(a))[0];
}

/** Antigravity: a conversa aberta na pasta (last_conversations.json), ou a mais recente desde a abertura. */
export function antigravityFile(home: string, cwd: string, since: number, taken: Set<string>): string | undefined {
  const transcript = (id: string) => join(home, "brain", id, ".system_generated", "logs", "transcript.jsonl");
  try {
    const map = JSON.parse(readFileSync(join(home, "cache", "last_conversations.json"), "utf8")) as Record<string, string>;
    const id = Object.entries(map).find(([dir]) => sameDir(dir, cwd))?.[1];
    if (id && existsSync(transcript(id)) && mtime(transcript(id)) >= since && !taken.has(transcript(id))) return transcript(id);
  } catch { /* ainda sem conversa */ }
  const brain = join(home, "brain");
  if (!existsSync(brain)) return undefined;
  return readdirSync(brain).map(transcript).filter((f) => existsSync(f) && !taken.has(f) && mtime(f) >= since).sort((a, b) => mtime(b) - mtime(a))[0];
}

// ---------- Leitura incremental ----------
interface Tail { file: string; offset: number; state: ParseState; agent: ChatAgent }

/** Lê só o que foi acrescentado desde a última vez; recomeça se o arquivo trocar ou encolher. */
export class TranscriptReader {
  private tails = new Map<string, Tail>();

  files(): Set<string> { return new Set([...this.tails.values()].map((t) => t.file)); }
  fileOf(id: string): string | undefined { return this.tails.get(id)?.file; }
  forget(id: string) { this.tails.delete(id); }

  read(id: string, agent: ChatAgent, file: string): { items: ChatItem[]; working: boolean } {
    let tail = this.tails.get(id);
    if (!tail || tail.file !== file || tail.agent !== agent) { tail = { file, offset: 0, state: newState(), agent }; this.tails.set(id, tail); }
    let size = 0;
    try { size = statSync(file).size; } catch { return { items: tail.state.items, working: tail.state.working }; }
    if (size < tail.offset) { tail.offset = 0; tail.state = newState(); }
    if (size > tail.offset) {
      const fd = openSync(file, "r");
      try {
        const buf = Buffer.alloc(size - tail.offset);
        readSync(fd, buf, 0, buf.length, tail.offset);
        // Só linhas completas: a última pode estar no meio da gravação.
        const end = buf.lastIndexOf(0x0a);
        if (end >= 0) {
          for (const line of buf.subarray(0, end).toString("utf8").split("\n")) {
            if (!line.trim()) continue;
            try { PARSERS[agent](tail.state, JSON.parse(line)); } catch { /* linha estranha: ignora */ }
          }
          tail.offset += end + 1;
        }
      } finally { closeSync(fd); }
    }
    return { items: tail.state.items, working: tail.state.working };
  }
}
