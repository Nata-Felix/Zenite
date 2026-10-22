import { useEffect, useState } from "react";
import { Clock, GitCommitHorizontal, Orbit, Sun, TerminalSquare, X } from "lucide-react";
import type { AwaySummary, TaskState } from "../../shared/types";
import "./AwayPanel.css";

const STATE_LABEL: Record<TaskState, string> = { trabalhando: "trabalhando", bloqueado: "bloqueado", pronto: "pronto", livre: "livre" };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clock = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const duration = (ms: number) => {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
};

/** "Enquanto você esteve fora": aparece ao voltar ao Zênite depois de um tempo sem uso. */
export function AwayPanel({ onJump }: { onJump: (terminalId: string) => void }) {
  const [summary, setSummary] = useState<AwaySummary | null>(null);
  useEffect(() => window.o.attention.onAwaySummary(setSummary), []);
  useEffect(() => {
    if (!summary) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSummary(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [summary]);
  if (!summary) return null;
  const { terminals, sol, flows, commits } = summary;
  const go = (id: string) => { setSummary(null); onJump(id); };

  return (
    <section className="away-panel" role="dialog" aria-label="Enquanto você esteve fora">
      <header>
        <div>
          <h2>Enquanto você esteve fora</h2>
          <p><Clock size={13} /> {duration(summary.until - summary.since)} · das {clock(summary.since)} às {clock(summary.until)}</p>
        </div>
        <button className="icon-button" title="Fechar (Esc)" aria-label="Fechar" onClick={() => setSummary(null)}><X size={15} /></button>
      </header>
      <div className="away-body">
        {terminals.length > 0 && (
          <div className="away-group">
            <h3><TerminalSquare size={14} /> Terminais</h3>
            {terminals.map((t) => (
              <button key={t.id} className={`away-row${t.requests.length ? " asks" : ""}`} onClick={() => go(t.id)} title="Ir até o terminal">
                <span className="away-title">{t.title}<small>{t.where}</small></span>
                <span className="away-facts">
                  {t.turns > 0 && <span className="away-chip">{plural(t.turns, "turno concluído", "turnos concluídos")}</span>}
                  {t.status && <span className={`away-chip state-${t.status.state}`}>{STATE_LABEL[t.status.state]}{t.status.note ? ` · ${t.status.note}` : ""}</span>}
                </span>
                {t.requests.map((r, i) => <span key={i} className="away-request">“{r}”</span>)}
              </button>
            ))}
          </div>
        )}
        {sol.count > 0 && (
          <div className="away-group">
            <h3><Sun size={14} /> Sol · {plural(sol.count, "mudança no canvas", "mudanças no canvas")}</h3>
            <ul>{sol.recent.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {flows.length > 0 && (
          <div className="away-group">
            <h3><Orbit size={14} /> Astros</h3>
            <ul>
              {flows.map((f, i) => (
                <li key={i}>
                  <strong>{f.title}</strong> · {f.ok > 0 && plural(f.ok, "passo ok", "passos ok")}{f.ok > 0 && f.errors > 0 && " · "}
                  {f.errors > 0 && <span className="away-error">{plural(f.errors, "erro", "erros")}{f.lastError ? `: ${f.lastError}` : ""}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {commits.length > 0 && (
          <div className="away-group">
            <h3><GitCommitHorizontal size={14} /> {plural(commits.length, "commit", "commits")}</h3>
            <ul className="away-commits">
              {commits.slice(0, 8).map((c) => (
                <li key={c.hash + c.galaxy}><code>{c.hash}</code> {c.title} <small>{c.galaxy}{c.branch ? ` · ${c.branch}` : ""} · {c.author}</small></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
