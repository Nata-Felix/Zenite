import { useEffect, useId, useState } from "react";
import { Check, Link2, Pencil, RotateCw, Sun, Unlink, Waypoints } from "lucide-react";
import type { Edge } from "@xyflow/react";
import type { TerminalAppearance } from "../../shared/types";
import { presetFor } from "../agents";
import { connectedNodes, connectionError } from "../connections";
import { ELEMENT_STYLE, type CanvasFlowNode } from "../nodes";
import { TERMINAL_COLOR_THEMES, TERMINAL_FONTS } from "../terminalPrefs";
import { setConstellationNode } from "./PulseEdge";

interface Props {
  node: CanvasFlowNode;
  nodes: CanvasFlowNode[];
  edges: Edge[];
  linking: boolean;
  onEdit(title: string, appearance: TerminalAppearance, role: string): void;
  onReload(): void;
  onFocus(id: string): void;
  onStartLine(point: { x: number; y: number }): void;
  onConnect(target: string): void;
  /** Desfazer a ligação com outro elemento (pede confirmação). */
  onUnlink(other: string): void;
  /** Promover a Sol (orquestrador) ou tirar o Sol deste terminal. */
  onToggleSun(): void;
  onCancelLine(): void;
  onClose(): void;
}

const COLORS = [
  { value: "#e8875b", label: "Laranja" }, { value: "#4fd1a5", label: "Verde" },
  { value: "#7c9cff", label: "Azul" }, { value: "#c084fc", label: "Violeta" },
  { value: "#f472b6", label: "Rosa" }, { value: "#f5c451", label: "Amarelo" },
];

function titleOf(n: CanvasFlowNode) {
  return n.data.terminal?.title ?? n.data.element?.title ?? "Sem nome";
}

function identity(n: CanvasFlowNode) {
  const t = n.data.terminal;
  if (t) {
    const preset = presetFor(t.command, t.provider);
    return { icon: preset.icon, label: preset.title, color: t.appearance?.color ?? preset.color };
  }
  return ELEMENT_STYLE[n.data.element!.kind];
}

/** Ferramentas da seleção: o terminal continua recebendo entrada enquanto a barra está aberta. */
export function NodeOptions({ node, nodes, edges, linking, onEdit, onReload, onFocus, onStartLine, onConnect, onUnlink, onToggleSun, onCancelLine, onClose }: Props) {
  const [view, setView] = useState<"edit" | "constellation" | null>(null);
  const [title, setTitle] = useState(titleOf(node));
  const [appearance, setAppearance] = useState<TerminalAppearance>({ ...node.data.terminal?.appearance });
  const [role, setRole] = useState(node.data.terminal?.role ?? "");
  const [target, setTarget] = useState("");
  const detailId = useId();
  const terminal = node.data.terminal;
  const style = identity(node);
  const linked = connectedNodes(node.id, nodes, edges);
  const available = nodes.filter((n) => !connectionError(node.id, n.id, nodes, edges));
  // Com a Constelação aberta, as linhas deste elemento piscam no canvas.
  useEffect(() => {
    setConstellationNode(view === "constellation" ? node.id : null);
    return () => setConstellationNode(null);
  }, [view, node.id]);
  const toggle = (next: "edit" | "constellation") => {
    onCancelLine();
    if (next === "edit") {
      setTitle(titleOf(node));
      setAppearance({ ...terminal?.appearance });
      setRole(terminal?.role ?? "");
    }
    setView((v) => v === next ? null : next);
  };

  return (
    <section className="node-options nodrag nopan nowheel" aria-label={`Opções de ${titleOf(node)}`} style={{ "--agent": style.color } as React.CSSProperties}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key !== "Escape") return;
        e.preventDefault();
        if (linking) onCancelLine();
        else if (view) setView(null);
        else onClose();
      }}>
      {(view || linking) && (
        <div className="node-options-detail" id={detailId}>
          {view === "edit" && terminal && (
            <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onEdit(title.trim(), appearance, role.trim()); setView(null); } }}>
              <h3>Editar terminal</h3>
              <label>Nome<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
              <label>Função<input value={role} maxLength={40} placeholder="Ex.: Frontend, Revisor, Testes" onChange={(e) => setRole(e.target.value)} /></label>
              <fieldset className="terminal-color-picker">
                <legend>Cor do terminal</legend>
                <button type="button" className={`ghost small${!appearance.color ? " on" : ""}`} aria-pressed={!appearance.color} onClick={() => setAppearance({ ...appearance, color: undefined })}>Do agente</button>
                {COLORS.map((c) => <button type="button" key={c.value} className={`swatch${appearance.color === c.value ? " on" : ""}`} style={{ background: c.value }} aria-label={c.label} title={c.label} aria-pressed={appearance.color === c.value} onClick={() => setAppearance({ ...appearance, color: c.value })}>{appearance.color === c.value && <Check size={13} color="#111317" />}</button>)}
              </fieldset>
              <div className="terminal-font-fields">
                <label>Fonte<select value={appearance.font ?? ""} onChange={(e) => setAppearance({ ...appearance, font: e.target.value || undefined })}>
                  <option value="">Configuração geral</option>{TERMINAL_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select></label>
                <label>Tamanho<select value={appearance.fontSize ?? ""} onChange={(e) => setAppearance({ ...appearance, fontSize: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Geral</option>{[11, 12, 13, 14, 15, 16, 18, 20].map((size) => <option key={size} value={size}>{size} px</option>)}
                </select></label>
              </div>
              <label>Tema do terminal<select value={appearance.colors ?? ""} onChange={(e) => setAppearance({ ...appearance, colors: e.target.value || undefined })}>
                <option value="">Configuração geral</option>{TERMINAL_COLOR_THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></label>
              <p className="node-options-hint">A aparência vale só para este terminal.</p>
              <div className="dialog-actions"><button type="button" className="ghost" onClick={() => setView(null)}>Cancelar</button><button className="primary" disabled={!title.trim()}>Salvar</button></div>
            </form>
          )}
          {view === "constellation" && (
            <>
              <h3>Constelação <span>{linked.length}</span></h3>
              {linked.length ? <ul className="constellation-list">{linked.map((n) => {
                const item = identity(n);
                return <li key={n.id}><button onClick={() => onFocus(n.id)} title={`Ir até ${titleOf(n)}`}><span className="agent-chip" style={{ "--agent": item.color } as React.CSSProperties}><item.icon size={15} /></span><span className="constellation-name"><strong>{titleOf(n)}</strong><small>{item.label}</small></span><Link2 size={14} /></button><button className="constellation-unlink" title={`Desvincular de ${titleOf(n)}`} aria-label={`Desvincular de ${titleOf(n)}`} onClick={() => onUnlink(n.id)}><Unlink size={14} /></button></li>;
              })}</ul> : <p className="node-options-empty">Nenhuma conexão ainda. Use Linhas para conectar este elemento a outro.</p>}
            </>
          )}
          {linking && (
            <>
              <h3>Conectar a outro elemento</h3>
              <p className="node-options-hint">Clique no destino no canvas. Esc cancela.</p>
              {available.length ? <form className="line-destination" onSubmit={(e) => { e.preventDefault(); if (target && available.some((n) => n.id === target)) onConnect(target); }}>
                <label>Ou escolha na lista<select value={available.some((n) => n.id === target) ? target : ""} onChange={(e) => setTarget(e.target.value)}><option value="">Selecionar destino…</option>{available.map((n) => <option key={n.id} value={n.id}>{titleOf(n)} · {identity(n).label}</option>)}</select></label>
                <button className="primary" disabled={!available.some((n) => n.id === target)}>Conectar</button>
              </form> : <p className="node-options-empty">Não há outros elementos disponíveis para conectar.</p>}
              <button className="ghost small" onClick={onCancelLine}>Cancelar linha</button>
            </>
          )}
        </div>
      )}
      <div className="node-options-caption"><style.icon size={13} /><span>{titleOf(node)}</span></div>
      <div className="node-options-actions" role="group" aria-label="Ações do elemento">
        {terminal && <button aria-expanded={view === "edit"} aria-controls={view === "edit" ? detailId : undefined} onClick={() => toggle("edit")}><Pencil size={16} />Editar</button>}
        {terminal && <button disabled={node.data.terminalLoading} title="Reiniciar a sessão e executar o comando inicial. Encerra os processos atuais e limpa a tela." onClick={onReload}><RotateCw size={16} className={node.data.terminalLoading ? "reload-spinning" : ""} />{node.data.terminalLoading ? "Recarregando…" : "Reload"}</button>}
        {terminal && (
          <button aria-pressed={!!terminal.sun} className={terminal.sun ? "on" : ""} title={terminal.sun ? "Tirar o Sol: deixa de ser o orquestrador" : "Promover a Sol: este terminal vira o orquestrador da galáxia (só um por canvas)"} onClick={onToggleSun}>
            <Sun size={16} />{terminal.sun ? "Sol" : "Promover a Sol"}
          </button>
        )}
        <button aria-expanded={view === "constellation"} aria-controls={view === "constellation" ? detailId : undefined} onClick={() => toggle("constellation")}><Waypoints size={16} />Constelação<span className="connection-count">{linked.length}</span></button>
        <button aria-pressed={linking} onClick={(e) => { setView(null); setTarget(""); if (linking) onCancelLine(); else onStartLine({ x: e.clientX, y: e.clientY }); }}><Link2 size={16} />Linhas</button>
      </div>
    </section>
  );
}
