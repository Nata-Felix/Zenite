import { useEffect, useMemo, useRef, useState } from "react";
import { isCapturingShortcut } from "../shortcuts";
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
  const list = useRef(terminals);
  list.current = terminals;
  // Quem o seletor (Alt + setas) está marcando; null = seletor fechado.
  const [picking, setPicking] = useState<string | null>(null);
  const picked = useRef<string | null>(null);
  const choose = (id: string | null) => { picked.current = id; setPicking(id); };

  // Alt+1 abre o Sol. Alt+↑/↓ move o seletor pelos terminais e, ao soltar o Alt, abre o marcado.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || isCapturingShortcut()) return;
      const all = list.current;
      if (e.code === "Digit1") {
        const sun = all.find((n) => n.data.terminal!.sun);
        if (!sun) return;
        e.preventDefault(); e.stopPropagation();
        choose(null);
        requestFocus(sun.id);
      } else if ((e.code === "ArrowUp" || e.code === "ArrowDown") && all.length) {
        e.preventDefault(); e.stopPropagation();
        const here = picked.current ?? (document.activeElement as HTMLElement | null)?.closest?.(".react-flow__node")?.getAttribute("data-id") ?? document.querySelector(".react-flow__node.selected")?.getAttribute("data-id") ?? null;
        const at = all.findIndex((n) => n.id === here);
        const step = e.code === "ArrowDown" ? 1 : -1;
        choose(all[at < 0 ? (step > 0 ? 0 : all.length - 1) : (at + step + all.length) % all.length].id);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || picked.current === null) return;
      const id = picked.current;
      choose(null);
      if (list.current.some((n) => n.id === id)) { e.preventDefault(); requestFocus(id); }
    };
    const cancel = () => choose(null);
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", cancel);
    };
  }, []);

  if (!terminals.length) return null;
  if (collapsed && picking === null) {
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
          <button key={n.id} ref={picking === n.id ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined} className={`agent-rail-item${picking === n.id ? " picking" : ""}${asks ? " asks" : ""}${task?.state === "trabalhando" ? " busy" : ""}${t.sun ? " sun" : ""}`}
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
