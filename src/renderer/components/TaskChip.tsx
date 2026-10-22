import { useEffect, useState } from "react";
import type { TaskStatus } from "../../shared/types";

/** Selo de andamento de cada terminal (zn status), igual para todos os cartões. */
let latest: Record<string, TaskStatus> = {};
const listeners = new Set<() => void>();
const publish = (all: Record<string, TaskStatus>) => {
  latest = all;
  listeners.forEach((l) => l());
};
// Sem resposta (processo principal antigo ou de teste): começa sem selos.
window.o.pty.tasks().then(publish, () => {});
window.o.pty.onTasks(publish);

/** Todos os selos, atualizados (painel de terminais). */
export function useTasks(): Record<string, TaskStatus> {
  const [all, setAll] = useState(latest);
  useEffect(() => {
    const update = () => setAll(latest);
    update();
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);
  return all;
}

const LABEL: Record<TaskStatus["state"], string> = { trabalhando: "Trabalhando", bloqueado: "Bloqueado", pronto: "Pronto p/ revisão", livre: "Livre" };

/** "Trabalhando", "Bloqueado"... no cabeçalho do terminal; o detalhe aparece ao passar o mouse. */
export function TaskChip({ terminalId }: { terminalId: string }) {
  const [status, setStatus] = useState(() => latest[terminalId]);
  useEffect(() => {
    const update = () => setStatus(latest[terminalId]);
    update();
    listeners.add(update);
    return () => void listeners.delete(update);
  }, [terminalId]);
  if (!status || status.state === "livre") return null;
  const when = new Date(status.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <span className={`task-chip task-${status.state}`} title={`${LABEL[status.state]} (desde ${when})${status.note ? `: ${status.note}` : ""}`}>
      {LABEL[status.state]}
      {status.note && <span className="truncate">: {status.note}</span>}
    </span>
  );
}
