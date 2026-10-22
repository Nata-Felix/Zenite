import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import type { TerminalUsage, UsageWindow } from "../../shared/types";

/** Último limite de uso recebido, por terminal. */
let latest: Record<string, TerminalUsage> = {};
const listeners = new Set<() => void>();
window.o.pty.onUsage((usage) => {
  latest = usage;
  listeners.forEach((l) => l());
});

function useUsage(id: string): TerminalUsage | undefined {
  const [usage, setUsage] = useState(() => latest[id]);
  useEffect(() => {
    const update = () => setUsage(latest[id]);
    listeners.add(update);
    return () => void listeners.delete(update);
  }, [id]);
  return usage;
}

/** "zera às 14:28" ou "zera em 27/10 14:28". */
function resetText(at: number): string {
  if (!at) return "";
  const d = new Date(at);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `zera às ${time}` : `zera em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${time}`;
}

const line = (label: string, w?: UsageWindow) => (w ? `${label}: ${Math.round(w.usedPercent)}% usado${w.resetsAt ? `, ${resetText(w.resetsAt)}` : ""}` : "");

function ago(at: number): string {
  const min = Math.round((Date.now() - at) / 60_000);
  return min < 1 ? "agora" : min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
}

/**
 * Limite de uso do agente no cabeçalho do terminal. Codex: "5h 11% · sem 2%" (amarelo a partir de
 * 80%). Qualquer agente: "Limite atingido" em vermelho quando o aviso aparece na tela.
 */
export function UsageChip({ terminalId }: { terminalId: string }) {
  const usage = useUsage(terminalId);
  if (!usage) return null;
  const peak = Math.max(usage.primary?.usedPercent ?? 0, usage.secondary?.usedPercent ?? 0);
  const level = usage.reached ? " reached" : peak >= 80 ? " high" : "";
  const parts = [usage.primary && `5h ${Math.round(usage.primary.usedPercent)}%`, usage.secondary && `sem ${Math.round(usage.secondary.usedPercent)}%`].filter(Boolean);
  const title = [
    usage.reached ? "Limite de uso atingido" : "Limite de uso da conta",
    line("Janela de 5 h", usage.primary),
    line("Semana", usage.secondary),
    usage.message && `Na tela: "${usage.message}"`,
    usage.source === "codex" && `Dados da última resposta do Codex (${ago(usage.updatedAt)}).`,
    usage.message && "Clique para dispensar o aviso.",
  ].filter(Boolean).join("\n");
  const text = usage.reached ? "Limite atingido" : parts.join(" · ");
  if (!text) return null;
  return (
    <button
      className={`usage-chip nodrag${level}`}
      title={title}
      aria-label={title}
      onClick={() => usage.message && window.o.pty.dismissLimit(terminalId)}
      style={{ cursor: usage.message ? "pointer" : "default" }}
    >
      <Gauge size={11} /> {text}
    </button>
  );
}
