import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronUp, ListPlus, Ungroup } from "lucide-react";
import type { CanvasFlowNode } from "../nodes";
import { EditableTitle } from "./EditableTitle";

function BlackHoleNodeImpl({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const el = data.element!;
  const collapsed = el.blackHole?.collapsed !== false;
  const count = data.blackHoleCount ?? 0;
  return <div className={`black-hole-node${selected ? " selected" : ""}${data.blackHoleDrop ? " black-hole-receiving" : ""}`}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <div className="black-hole-orb drag-handle" role="button" tabIndex={0} aria-label={`${collapsed ? "Abrir" : "Recolher"} pasta ${el.title}`} aria-expanded={!collapsed}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); data.actions.toggleBlackHole(id); } }}
      title="Clique para abrir a pasta. Arraste para mover com o conteúdo.">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <ellipse cx="60" cy="60" rx="54" ry="18" transform="rotate(-28 60 60)" className="black-hole-disk outer" />
        <ellipse cx="60" cy="60" rx="45" ry="13" transform="rotate(-28 60 60)" className="black-hole-disk" />
        <circle cx="60" cy="60" r="28" className="black-hole-horizon" />
        <path d="M19 77 Q60 38 102 43" className="black-hole-light" />
      </svg>
      <span className="black-hole-count">{count}</span>
    </div>
    <strong className="black-hole-title drag-handle"><EditableTitle value={el.title} onChange={title => data.actions.rename(id, title)} /></strong>
    <small role="status">{data.blackHoleDrop ? "Solte para guardar" : `${count === 1 ? "1 elemento" : `${count} elementos`} · ${collapsed ? "recolhido" : "aberto"}`}</small>
    <div className="black-hole-actions nodrag">
      <button className="ghost small" onClick={() => data.actions.toggleBlackHole(id)} aria-expanded={!collapsed} title={collapsed ? "Mostrar os elementos guardados" : "Recolher os elementos no Buraco negro"}>
        {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}{collapsed ? "Abrir" : "Recolher"}
      </button>
      <button className="icon-button" title="Escolher elementos do Buraco negro" aria-label="Escolher elementos do Buraco negro" onClick={() => data.actions.manageBlackHole(id)}><ListPlus size={15} /></button>
      <button className="icon-button" title="Desagrupar: preserva todos os elementos e suas ligações" aria-label="Desagrupar Buraco negro" onClick={() => data.actions.remove([id])}><Ungroup size={15} /></button>
    </div>
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </div>;
}
export const BlackHoleNode = memo(BlackHoleNodeImpl);
