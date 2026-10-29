import * as pty from "@lydell/node-pty";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { CreatePtyRequest, CreatePtyResult, ShellChoice } from "../shared/types";
import { resolveShell } from "./shell";

/** Quantos caracteres de saída guardar por terminal para repintar após reload. */
const BACKLOG_LIMIT = 200_000;

interface Session {
  close?(): void;
  proc: pty.IPty;
  backlog: string;
  /** Segredo que o CLI apresenta para provar que fala em nome deste terminal. */
  token: string;
  /** Cópia invisível da tela, para o CLI ler o que o terminal mostra. */
  screen: HeadlessTerminal;
  /** Quando abriu e quando escreveu na tela pela última vez (ms). */
  started: number;
  lastData: number;
}

export interface PtyEvents {
  onData(id: string, data: string): void;
  /** Algo foi escrito no terminal (usuário ou agente). */
  onInput?(id: string): void;
  onExit(id: string, exitCode: number): void;
}

/** Variáveis extras para o ambiente de um terminal novo. */
export type EnvProvider = (id: string, token: string, req: CreatePtyRequest) => Record<string, string>;

export class PtyManager {
  private sessions = new Map<string, Session>();

  constructor(
    private events: PtyEvents,
    private extraEnv: EnvProvider = () => ({}),
    /** Shell escolhido nas configurações (só no Windows). */
    private shellChoice: () => ShellChoice = () => "auto",
    private isolatedLaunch?: (req: CreatePtyRequest, token: string) => { file: string; args: string[]; cwd: string; env: Record<string, string>; close(): void } | undefined,
  ) {}

  create(req: CreatePtyRequest): CreatePtyResult {
    const existing = this.sessions.get(req.id);
    if (existing) {
      this.resize(req.id, req.cols, req.rows);
      return { ok: true, reused: true, backlog: existing.backlog };
    }

    const cwd = req.cwd && existsSync(req.cwd) ? req.cwd : homedir();
    let launch: ReturnType<NonNullable<PtyManager["isolatedLaunch"]>> = undefined;
    const token = randomBytes(24).toString("hex");
    const cols = clampSize(req.cols);
    const rows = clampSize(req.rows);
    let proc: pty.IPty;
    try {
      launch = this.isolatedLaunch?.(req, token);
      const { file, args } = launch ?? resolveShell(req.command, process.platform, process.env, this.shellChoice());
      proc = pty.spawn(file, args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd: launch?.cwd ?? cwd,
        env: launch ? mergeEnv(process.env, launch.env) : mergeEnv(process.env, { O_TERMINAL_ID: req.id, ...this.extraEnv(req.id, token, req) }),
      });
    } catch (err) {
      launch?.close();
      return { ok: false, error: `Falha ao abrir terminal: ${(err as Error).message}` };
    }

    const screen = new HeadlessTerminal({ cols, rows, scrollback: 2000, allowProposedApi: true });
    const session: Session = { proc, backlog: "", token, screen, started: Date.now(), lastData: Date.now(), close: launch?.close };
    this.sessions.set(req.id, session);
    proc.onData((data) => {
      if (this.sessions.get(req.id) !== session) return;
      session.backlog = (session.backlog + data).slice(-BACKLOG_LIMIT);
      session.lastData = Date.now();
      screen.write(data);
      this.events.onData(req.id, data);
    });
    proc.onExit(({ exitCode }) => {
      session.close?.();
      // Só remove se ainda é a mesma sessão (o id pode ter sido recriado).
      const current = this.sessions.get(req.id);
      if (current === session) this.sessions.delete(req.id);
      screen.dispose();
      // O encerramento atrasado da sessão anterior não encerra a nova na interface.
      if (!current || current === session) this.events.onExit(req.id, exitCode);
    });
    return { ok: true };
  }

  restart(req: CreatePtyRequest): CreatePtyResult {
    this.kill(req.id);
    return this.create(req);
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.proc.write(data);
    this.events.onInput?.(id);
  }

  /** Quantos terminais estão abertos. */
  count(): number {
    return this.sessions.size;
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.proc.resize(clampSize(cols), clampSize(rows));
    session.screen.resize(clampSize(cols), clampSize(rows));
  }

  kill(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    session.close?.();
    session.proc.kill();
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }

  /** Quando o terminal abriu (ms), ou undefined se não está aberto. */
  startedAt(id: string): number | undefined {
    return this.sessions.get(id)?.started;
  }

  /** Id e pid do processo raiz (o shell) de cada terminal aberto. */
  roots(): { id: string; pid: number }[] {
    return [...this.sessions].map(([id, s]) => ({ id, pid: s.proc.pid }));
  }

  /** Há quanto tempo o terminal abriu e há quanto tempo está sem escrever nada (null se fechado). */
  quiet(id: string): { open: number; idle: number } | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    const now = Date.now();
    return { open: now - s.started, idle: now - s.lastData };
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  /** O programa no terminal ativou a colagem "entre colchetes" (bracketed paste)? */
  acceptsPaste(id: string): boolean {
    return this.sessions.get(id)?.screen.modes.bracketedPasteMode ?? false;
  }

  /** Confere se o token pertence ao terminal (comparação em tempo constante). */
  verify(id: string, token: string): boolean {
    const expected = this.sessions.get(id)?.token;
    if (!expected || !/^[a-f0-9]{48}$/.test(token)) return false;
    return timingSafeEqual(Buffer.from(expected, "ascii"), Buffer.from(token, "ascii"));
  }

  /**
   * Texto que o terminal mostra agora: as últimas `lines` linhas (tela + histórico),
   * sem cores nem códigos de controle e sem as linhas vazias do fim.
   */
  snapshot(id: string, lines = 60): Promise<string | null> {
    const session = this.sessions.get(id);
    if (!session) return Promise.resolve(null);
    // write("") espera o terminal invisível processar tudo que já chegou.
    return new Promise((resolve) =>
      session.screen.write("", () => {
        const buf = session.screen.buffer.active;
        const out: string[] = [];
        for (let i = 0; i < buf.length; i++) out.push(buf.getLine(i)?.translateToString(true) ?? "");
        while (out.length && !out[out.length - 1].trim()) out.pop();
        resolve(out.slice(-Math.max(1, lines)).join("\n"));
      }),
    );
  }
}

function clampSize(n: number): number {
  return Math.max(2, Math.min(1000, Math.floor(n) || 2));
}

/**
 * Junta variáveis ao ambiente. PATH é tratado à parte: o valor extra vai na frente
 * do PATH existente, respeitando a grafia da chave no Windows ("Path").
 */
export function mergeEnv(base: NodeJS.ProcessEnv, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined) env[k] = v;
  for (const [k, v] of Object.entries(extra)) {
    if (k.toUpperCase() === "PATH") {
      const key = Object.keys(env).find((e) => e.toUpperCase() === "PATH") ?? "PATH";
      const sep = process.platform === "win32" ? ";" : ":";
      env[key] = env[key] ? `${v}${sep}${env[key]}` : v;
    } else {
      env[k] = v;
    }
  }
  return env;
}
