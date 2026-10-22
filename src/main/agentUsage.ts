import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import type { TerminalUsage, UsageWindow } from "../shared/types";

/**
 * Quanto do limite de uso cada agente já gastou. É a base para rotear e balancear entre contas.
 *  - Codex: a cada resposta, o Codex grava em sessions/AAAA/MM/DD/*.jsonl os limites da conta
 *    (janela de 5 h e semanal: % usado e quando zera). Lemos o último registro.
 *  - Todos (Claude, Antigravity, Codex): a mensagem de limite atingido aparece na tela.
 */

const TAIL_BYTES = 256 * 1024;
const cache = new Map<string, { mtime: number; size: number; usage: TerminalUsage | null }>();

/** Arquivo de sessão mais recente: olha só os últimos dias, do mais novo para o mais antigo. */
function newestSession(codexHome: string): string | null {
  const root = join(codexHome, "sessions");
  if (!existsSync(root)) return null;
  const desc = (dir: string) => {
    try {
      return readdirSync(dir).sort().reverse();
    } catch {
      return [];
    }
  };
  let best: { file: string; mtime: number } | null = null;
  let days = 0;
  for (const y of desc(root)) {
    for (const m of desc(join(root, y))) {
      for (const d of desc(join(root, y, m))) {
        for (const f of desc(join(root, y, m, d))) {
          if (!f.endsWith(".jsonl")) continue;
          const file = join(root, y, m, d, f);
          const mtime = statSync(file).mtimeMs;
          if (!best || mtime > best.mtime) best = { file, mtime };
        }
        if (++days >= 3) return best?.file ?? null;
      }
    }
  }
  return best?.file ?? null;
}

/** Fim do arquivo, sem ler sessões enormes inteiras. */
function tail(file: string, size: number): string {
  const fd = openSync(file, "r");
  try {
    const length = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, size - length);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

const window_ = (w: any, now: number): UsageWindow | undefined => {
  if (!w || typeof w.used_percent !== "number") return undefined;
  const resetsAt = typeof w.resets_at === "number" ? w.resets_at * 1000 : 0;
  // A janela já zerou desde a última resposta: o número gravado não vale mais.
  const usedPercent = resetsAt && resetsAt <= now ? 0 : Math.max(0, Math.min(100, w.used_percent));
  return { usedPercent, windowMinutes: Number(w.window_minutes) || 0, resetsAt };
};

/** Último registro de limites de uma sessão do Codex (texto .jsonl). */
export function parseCodexLimits(text: string, now = Date.now(), at = now): TerminalUsage | null {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"rate_limits"')) continue;
    try {
      const limits = JSON.parse(lines[i])?.payload?.rate_limits;
      if (!limits) continue;
      const primary = window_(limits.primary, now);
      const secondary = window_(limits.secondary, now);
      // Esgotado: o Codex avisou (rate_limit_reached_type) ou uma janela chegou a 100%, e ela ainda não zerou.
      const flagged = !!limits.rate_limit_reached_type;
      const reached = [primary, secondary].some((w) => !!w && w.resetsAt > now && (flagged || w.usedPercent >= 100));
      return { source: "codex", primary, secondary, reached, updatedAt: at };
    } catch {
      // Linha cortada no começo do trecho lido: tenta a anterior.
    }
  }
  return null;
}

/** Limites da conta do Codex que usa esta pasta (CODEX_HOME). Lê de novo só se a sessão mudou. */
export function codexUsage(codexHome: string, now = Date.now()): TerminalUsage | null {
  const file = newestSession(codexHome);
  if (!file) return null;
  const { mtimeMs, size } = statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtime === mtimeMs && hit.size === size) return hit.usage && { ...hit.usage, ...refresh(hit.usage, now) };
  const usage = parseCodexLimits(tail(file, size), now, mtimeMs);
  cache.set(file, { mtime: mtimeMs, size, usage });
  return usage;
}

/** Sem arquivo novo, só o relógio muda: uma janela que zerou volta a 0%. */
function refresh(u: TerminalUsage, now: number): Partial<TerminalUsage> {
  const fix = (w?: UsageWindow) => (w && w.resetsAt && w.resetsAt <= now ? { ...w, usedPercent: 0 } : w);
  const primary = fix(u.primary);
  const secondary = fix(u.secondary);
  return { primary, secondary, reached: u.reached && [primary, secondary].some((w) => w && w.resetsAt > now) };
}

/** Quando o limite esgotado volta (ms): a janela mais cheia que ainda não zerou. 0 se não se sabe. */
export function limitUntil(u: TerminalUsage, now = Date.now()): number {
  if (!u.reached) return 0;
  const open = [u.primary, u.secondary].filter((w): w is UsageWindow => !!w && w.resetsAt > now);
  open.sort((a, b) => b.usedPercent - a.usedPercent);
  return open[0]?.resetsAt ?? 0;
}

/** Mensagens que os CLIs mostram quando o limite de uso acaba. */
const LIMIT_MESSAGES = [
  /you'?ve hit your (usage )?limit/i,
  /usage limit (reached|exceeded|hit)/i,
  /\b(5-hour|weekly|daily|session) limit reached/i,
  /rate limit (reached|exceeded)/i,
  /quota (exceeded|exhausted)/i,
  /resource[_ ]exhausted/i,
  /exhausted your (capacity|quota)/i,
  /out of (credits|usage)/i,
];

/** A linha da tela com o aviso de limite atingido, ou null. */
export function limitMessage(screen: string): string | null {
  for (const line of screen.split(/\r?\n/)) {
    if (LIMIT_MESSAGES.some((re) => re.test(line))) return line.trim().slice(0, 200);
  }
  return null;
}
