/**
 * Quem precisa da atenção do usuário.
 *
 * - "done": o terminal trabalhou (gerou saída depois de receber algo) e ficou quieto por
 *   alguns segundos, com o usuário olhando para outro lugar. É como o Maestri faz: não
 *   depende do agente; funciona com Claude Code, Codex ou qualquer programa.
 * - "request": um agente pediu de propósito (`zn notify "mensagem"`).
 *
 * A saída inicial (banner, prompt) não conta: só depois da primeira entrada o terminal
 * passa a ser observado.
 */
export type AttentionReason = "done" | "request";

export interface Attention {
  reason: AttentionReason;
  message?: string;
  /** ms desde 1970. */
  since: number;
}

export interface AttentionOptions {
  /** Silêncio que encerra um turno de trabalho. */
  quietMs: number;
  /** Saída mínima no turno para valer como trabalho (não só o eco do que foi digitado). */
  minBytes: number;
  /** Janela em que um terminal com saída conta como "trabalhando" (para impedir a suspensão). */
  busyMs: number;
}

export const DEFAULT_ATTENTION: AttentionOptions = { quietMs: 4000, minBytes: 400, busyMs: 120_000 };

interface Track {
  armed: boolean;
  burst: number;
  lastOutput: number;
  timer?: ReturnType<typeof setTimeout>;
}

export class AttentionTracker {
  private tracks = new Map<string, Track>();
  private flags = new Map<string, Attention>();
  private focused: string | null = null;
  private windowFocused = true;

  constructor(
    /** Chamado com o estado completo sempre que algo muda; `added` = acabou de pedir atenção. */
    private emit: (all: Record<string, Attention>, added?: { id: string; attention: Attention }) => void,
    private opts: AttentionOptions = DEFAULT_ATTENTION,
    private now: () => number = Date.now,
  ) {}

  private track(id: string): Track {
    let t = this.tracks.get(id);
    if (!t) this.tracks.set(id, (t = { armed: false, burst: 0, lastOutput: 0 }));
    return t;
  }

  /** O usuário (ou um agente, via `zn ask`/`zn send`) escreveu no terminal. */
  input(id: string): void {
    const t = this.track(id);
    t.armed = true;
    t.burst = 0;
    this.clear(id);
  }

  output(id: string, bytes: number): void {
    const t = this.track(id);
    t.lastOutput = this.now();
    if (!t.armed) return;
    t.burst += bytes;
    if (t.timer) clearTimeout(t.timer);
    t.timer = setTimeout(() => this.quiet(id), this.opts.quietMs);
  }

  private quiet(id: string): void {
    const t = this.tracks.get(id);
    if (!t) return;
    t.timer = undefined;
    const worked = t.burst >= this.opts.minBytes;
    t.burst = 0;
    if (!worked || this.isWatching(id) || this.flags.get(id)?.reason === "request") return;
    this.set(id, { reason: "done", since: this.now() });
  }

  /** Um agente pediu atenção de propósito. Aparece mesmo com o terminal em foco. */
  request(id: string, message: string): void {
    this.set(id, { reason: "request", message: message.trim() || undefined, since: this.now() });
  }

  /** Terminal em foco no app (null = nenhum). Olhar para ele limpa o aviso. */
  focus(id: string | null): void {
    this.focused = id;
    if (id && this.windowFocused) this.clear(id);
  }

  windowFocus(focused: boolean): void {
    this.windowFocused = focused;
    if (focused && this.focused) this.clear(this.focused);
  }

  clear(id: string): void {
    if (this.flags.delete(id)) this.emit(this.snapshot());
  }

  remove(id: string): void {
    const t = this.tracks.get(id);
    if (t?.timer) clearTimeout(t.timer);
    this.tracks.delete(id);
    this.clear(id);
  }

  /** Algum terminal gerou saída há pouco? */
  busy(): boolean {
    const limit = this.now() - this.opts.busyMs;
    return [...this.tracks.values()].some((t) => t.lastOutput >= limit);
  }

  snapshot(): Record<string, Attention> {
    return Object.fromEntries(this.flags);
  }

  private isWatching(id: string): boolean {
    return this.windowFocused && this.focused === id;
  }

  private set(id: string, a: Attention): void {
    this.flags.set(id, a);
    this.emit(this.snapshot(), { id, attention: a });
  }
}
