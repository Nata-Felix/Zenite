import { useMemo } from "react";
import { Sun, TerminalSquare } from "lucide-react";
import type { CanvasFlowNode } from "../nodes";
import { presetFor } from "../agents";
import { requestFocus, useAttentionAll } from "../attentionBus";
import { useTasks } from "./TaskChip";
import { CollapseButton, CollapsedTab, useCollapsed } from "./Collapsible";

const STATE: Record<string, string> = { trabalhando: "trabalhando", bloqueado: "bloqueado", pronto: "pronto para revisão" };

/**
 * Painel à esquerda do canvas só com os terminais: um clique vai até o agente (na visão
 * resumida, abre ele). Mostra quem pede atenção, quem está trabalhando e o Sol.
 */
export function AgentRail({ nodes }: { nodes: CanvasFlowNode[] }) {
  const [collapsed, setCollapsed] = useCollapsed("agents");
  const attention = useAttentionAll();
  const tasks = useTasks();
  const terminals = useMemo(() => nodes.filter((n) => n.data.terminal).sort((a, b) => Number(!!b.data.terminal!.sun) - Number(!!a.data.terminal!.sun) || a.position.y - b.position.y || a.position.x - b.position.x), [nodes]);
  if (!terminals.length) return null;
  if (collapsed) {
    const waiting = terminals.filter((n) => attention[n.id]).length;
    return (
      <div className="agent-rail collapsed">
        <CollapsedTab side="left" label="os terminais" onClick={() => setCollapsed(false)}>
          <TerminalSquare size={15} />{waiting > 0 && <span className="agent-rail-count">{waiting}</span>}
        </CollapsedTab>
      </div>
    );
  }
  return (
    <nav className="agent-rail" aria-label="Terminais do canvas">
      <CollapseButton side="left" label="os terminais" onClick={() => setCollapsed(true)} />
      <div className="agent-rail-list">
      {terminals.map((n) => {
        const t = n.data.terminal!;
        const preset = presetFor(t.command, t.provider);
        const Icon = preset.icon ?? TerminalSquare;
        const asks = attention[n.id];
        const task = tasks[n.id];
        const info = [t.title, t.role, t.sun ? "Sol" : null, asks ? (asks.reason === "request" ? "pede sua atenção" : "esperando você") : task && STATE[task.state] ? `${STATE[task.state]}${task.note ? `: ${task.note}` : ""}` : null].filter(Boolean).join(" · ");
        return (
          <button key={n.id} className={`agent-rail-item${asks ? " asks" : ""}${task?.state === "trabalhando" ? " busy" : ""}${t.sun ? " sun" : ""}`}
            style={{ "--agent": t.appearance?.color ?? preset.color } as React.CSSProperties} title={info} aria-label={info} onClick={() => requestFocus(n.id)}>
            <span className="agent-rail-icon"><Icon size={18} />{t.sun && <Sun size={11} className="agent-rail-sun" />}</span>
            <span className="agent-rail-name">{t.role || t.title}</span>
          </button>
        );
      })}
      </div>
    </nav>
  );
}
