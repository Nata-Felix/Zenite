import { CollapseButton, CollapsedTab, useCollapsed } from "./Collapsible";
import { useEffect, useRef, useState } from "react";
import { ChevronUp, KeyRound, Map as MapIcon, Maximize, Minus, Network, Orbit, Plus, RotateCcw, Workflow, Eclipse } from "lucide-react";
import { runCommand } from "../commands";
import { FLOW_TYPES } from "./FlowNode";
import { Panel, useReactFlow, useViewport } from "@xyflow/react";
import type { ElementSpec } from "../../shared/types";
import { fromCustom, PRESETS, type AgentPreset } from "../agents";
import { useCustomPresets } from "../presets";
import { ELEMENT_STYLE } from "../nodes";
import { ParallelUniverseIcon } from "./ParallelUniverseIcon";

const ELEMENT_KINDS: ElementSpec["kind"][] = ["note", "table", "image", "video", "file", "folder", "web", "skill", "service"];
/** Tempo para o mouse ir do botão até o menu sem ele fechar. */
const CLOSE_DELAY_MS = 220;

interface Props {
  onNew(preset?: AgentPreset): void;
  onNewElement(kind: ElementSpec["kind"]): void;
  minimap: boolean;
  onToggleMinimap(): void;
  canAutoLayout: boolean;
  canUndoLayout: boolean;
  onAutoLayout(): void;
  onUndoLayout(): void;
  onFitCanvas(): void;
  /** Visão resumida (cartões estilo n8n) ligada. */
  summary: boolean;
  onToggleSummary(): void;
}

export function Dock({ onNew, onNewElement, minimap, onToggleMinimap, canAutoLayout, canUndoLayout, onAutoLayout, onUndoLayout, onFitCanvas, summary, onToggleSummary }: Props) {
  const [collapsed, setCollapsed] = useCollapsed("dock");
  const { zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  const agents = [...PRESETS, ...useCustomPresets().map(fromCustom)];
  const [menu, setMenu] = useState<"hover" | "keys" | null>(null);
  const [flowMenu, setFlowMenu] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);

  const show = () => { clearTimeout(closeTimer.current); setMenu((m) => m ?? "hover"); };
  const hide = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setMenu(null), CLOSE_DELAY_MS); };
  const pick = (preset?: AgentPreset) => { clearTimeout(closeTimer.current); setMenu(null); onNew(preset); };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  // Aberto pelo teclado: o foco vai para o primeiro agente.
  useEffect(() => { if (menu === "keys") menuRef.current?.querySelector("button")?.focus(); }, [menu]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); setMenu(null); newButton.current?.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };

  if (collapsed) return (
    <Panel position="bottom-center" className="dock-panel">
      <CollapsedTab side="bottom" label="a barra de ferramentas" onClick={() => setCollapsed(false)} />
    </Panel>
  );
  return (
    <Panel position="bottom-center" className="dock-panel">
      {menu && (
        <div ref={menuRef} className="dock-new-menu" role="menu" aria-label="Novo terminal" onMouseEnter={show} onMouseLeave={hide} onKeyDown={onMenuKey}>
          {agents.map((p) => (
            <button key={p.id ?? p.kind} role="menuitem" style={{ "--agent": p.color } as React.CSSProperties} onClick={() => pick(p)}>
              <p.icon size={16} />
              <span>{p.title}</span>
              {p.description && <small>{p.description}</small>}
            </button>
          ))}
        </div>
      )}
      {/* Fora do .dock (que corta o que passa da borda), como o menu do Novo: senão o clique cai no canvas. */}
      {flowMenu && (
        <div className="dock-new-menu dock-flow-menu" role="menu" onMouseLeave={() => setFlowMenu(false)}>
          {FLOW_TYPES.map((f) => (
            <button key={f.type} role="menuitem" style={{ "--agent": f.color } as React.CSSProperties} onClick={() => { setFlowMenu(false); runCommand(`new-flow:${f.type}`); }}>
              <f.icon size={16} />
              <span>{f.label}</span>
              <small>{f.hint}</small>
            </button>
          ))}
          <button role="menuitem" style={{ "--agent": "#c4a5ff" } as React.CSSProperties} onClick={() => { setFlowMenu(false); onNewElement("blackhole"); }}>
            <Eclipse size={16} /><span>Buraco negro</span><small>Agrupa elementos e preserva as conexões externas</small>
          </button>
        </div>
      )}
      <div className="dock">
        <button
          ref={newButton}
          className="dock-primary"
          title="Novo terminal (Ctrl+Shift+T). Passe o mouse para escolher o agente."
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onMouseEnter={show}
          onMouseLeave={hide}
          onClick={() => pick()}
          onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); setMenu("keys"); } }}
        >
          <Plus size={16} />
          <span>Novo</span>
          <ChevronUp size={13} className="dock-new-caret" />
        </button>
        <span className="dock-sep" />
        {ELEMENT_KINDS.map((kind) => {
          const st = ELEMENT_STYLE[kind];
          return (
            <button key={kind} className="dock-agent" title={st.create} style={{ "--agent": st.color } as React.CSSProperties} onClick={() => onNewElement(kind)}>
              <st.icon size={16} />
            </button>
          );
        })}
        <div className="dock-flow-wrap">
          <button className="dock-agent" title="Astros: agentes, condições, Convergência, Cronos e Aprovação" aria-haspopup="menu" aria-expanded={flowMenu} style={{ "--agent": "#c084fc" } as React.CSSProperties} onClick={() => setFlowMenu((m) => !m)}>
            <Orbit size={16} />
          </button>
        </div>
        <span className="dock-sep" />
        <button className="dock-agent" title="Variáveis de ambiente (.env) desta pasta" aria-label="Variáveis de ambiente (.env)" onClick={() => runCommand("open-env")}>
          <KeyRound size={16} />
        </button>
        <button className="dock-agent" title="Criar universo: cópia do projeto numa branch própria" aria-label="Criar universo" onClick={() => runCommand("new-universe")}>
          <ParallelUniverseIcon size={16} />
        </button>
        <span className="dock-sep" />
        <button className="dock-arrange" title="Organizar todo o canvas pelas conexões" aria-label="Organizar todo o canvas" disabled={!canAutoLayout} onClick={onAutoLayout}>
          <Workflow size={16} /><span>Organizar</span>
        </button>
        <button title="Desfazer última organização automática" aria-label="Desfazer organização" disabled={!canUndoLayout} onClick={onUndoLayout}>
          <RotateCcw size={15} />
        </button>
        <button title="Diminuir zoom" onClick={() => zoomOut({ duration: 150 })}>
          <Minus size={15} />
        </button>
        <span className="dock-zoom">{Math.round(zoom * 100)}%</span>
        <button title="Aumentar zoom" onClick={() => zoomIn({ duration: 150 })}>
          <Plus size={15} />
        </button>
        <button title="Enquadrar tudo" onClick={onFitCanvas}>
          <Maximize size={15} />
        </button>
        <button title="Visão resumida: só cartões e ligações; clique num cartão para abrir (Alt+S)" aria-pressed={summary} className={summary ? "on" : ""} onClick={onToggleSummary}>
          <Network size={15} />
        </button>
        <button title="Minimapa" className={minimap ? "on" : ""} onClick={onToggleMinimap}>
          <MapIcon size={15} />
        </button>
        <CollapseButton side="bottom" label="a barra de ferramentas" onClick={() => setCollapsed(true)} />
      </div>
    </Panel>
  );
}
