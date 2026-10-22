import type { AwaySummary, AwayTerminal, FlowStatus, TaskStatus } from "../shared/types";

/**
 * "Enquanto você esteve fora": junta o que aconteceu com a janela sem uso (sem foco ou o
 * computador parado) e entrega um resumo ao voltar. Tudo local, sem modelo de IA: são os
 * mesmos sinais que o app já tem (fim de turno, zn notify, zn status, Sol, astros, commits).
 */
export type AwayEvent =
  | { kind: "done"; id: string }
  | { kind: "request"; id: string; message?: string }
  | { kind: "status"; id: string; status: TaskStatus }
  | { kind: "sol"; what: string[] }
  | { kind: "flow"; status: FlowStatus };

export interface AwayNames {
  terminal(id: string): { title: string; where: string } | undefined;
  flow(nodeId: string): string | undefined;
}

export class AwayLog {
  private since: number | null = null;
  private events: AwayEvent[] = [];

  /** Começa a contar a ausência (se já não estiver contando). */
  leave(at: number): void {
    if (this.since !== null) return;
    this.since = at;
    this.events = [];
  }

  get away(): boolean {
    return this.since !== null;
  }

  record(event: AwayEvent): void {
    if (this.since !== null) this.events.push(event);
  }

  /** Volta: devolve o resumo se a ausência passou do mínimo e algo aconteceu. */
  back(at: number, minMs: number, names: AwayNames): AwaySummary | null {
    const since = this.since;
    const events = this.events;
    this.since = null;
    this.events = [];
    if (since === null || at - since < minMs) return null;
    return summarize(since, at, events, names);
  }
}

export function summarize(since: number, until: number, events: AwayEvent[], names: AwayNames): AwaySummary {
  const terminals = new Map<string, AwayTerminal>();
  const terminal = (id: string): AwayTerminal | undefined => {
    let t = terminals.get(id);
    if (!t) {
      const info = names.terminal(id);
      if (!info) return undefined; // terminal apagado enquanto isso
      terminals.set(id, (t = { id, title: info.title, where: info.where, turns: 0, requests: [] }));
    }
    return t;
  };
  const sol: string[] = [];
  const flows = new Map<string, { title: string; ok: number; errors: number; lastError?: string }>();
  for (const e of events) {
    if (e.kind === "done") { const t = terminal(e.id); if (t) t.turns++; }
    else if (e.kind === "request") { const t = terminal(e.id); if (t) t.requests.push(e.message ?? "Pediu sua atenção"); }
    else if (e.kind === "status") { const t = terminal(e.id); if (t) t.status = e.status; }
    else if (e.kind === "sol") sol.push(...e.what);
    else if (e.kind === "flow" && e.status.state !== "running") {
      const title = names.flow(e.status.nodeId) ?? "Astro";
      const f = flows.get(e.status.nodeId) ?? { title, ok: 0, errors: 0 };
      if (e.status.state === "ok") f.ok++;
      else { f.errors++; f.lastError = e.status.message; }
      flows.set(e.status.nodeId, f);
    }
  }
  // Primeiro quem pede atenção, depois quem trabalhou mais.
  const list = [...terminals.values()]
    .filter((t) => t.turns || t.requests.length || t.status)
    .sort((a, b) => b.requests.length - a.requests.length || b.turns - a.turns);
  return { since, until, terminals: list, sol: { count: sol.length, recent: sol.slice(-5) }, flows: [...flows.values()], commits: [] };
}

/** Há algo para mostrar? */
export function hasNews(s: AwaySummary): boolean {
  return s.terminals.length > 0 || s.sol.count > 0 || s.flows.length > 0 || s.commits.length > 0;
}
