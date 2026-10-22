import { useEffect, useRef, useState } from "react";
import { getBezierPath, Position, useReactFlow, useViewport, type Edge } from "@xyflow/react";
import { connectionError } from "../connections";
import { setInteracting } from "../interaction";
import type { CanvasFlowNode } from "../nodes";

interface Props {
  source: CanvasFlowNode;
  nodes: CanvasFlowNode[];
  edges: Edge[];
  initialPoint: { x: number; y: number };
  onConnect(target: string): void;
  onCancel(): void;
}

/** Camada temporária: um clique em qualquer parte do destino conclui a ligação. */
export function QuickConnection({ source, nodes, edges, initialPoint, onConnect, onCancel }: Props) {
  const flow = useReactFlow<CanvasFlowNode>();
  const viewport = useViewport();
  const overlay = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState(initialPoint);
  const [hovered, setHovered] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    // Os sites rodam em outro processo: deixam de capturar o mouse durante a conexão.
    setInteracting("connect", true);
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", escape, true);
    return () => { setInteracting("connect", false); window.removeEventListener("keydown", escape, true); };
  }, [onCancel]);

  const nodeAt = (x: number, y: number) => {
    for (const el of document.elementsFromPoint(x, y)) {
      const wrapper = el.closest<HTMLElement>(".react-flow__node");
      if (wrapper && overlay.current?.parentElement?.contains(wrapper)) return wrapper.dataset.id ?? null;
    }
    return null;
  };
  const target = nodes.find((n) => n.id === hovered);
  const error = target ? connectionError(source.id, target.id, nodes, edges) : null;
  const screen = (n: CanvasFlowNode, right: boolean) => ({
    x: n.position.x * viewport.zoom + viewport.x + (right ? (n.measured?.width ?? n.width ?? 0) * viewport.zoom : 0),
    y: (n.position.y + (n.measured?.height ?? n.height ?? 0) / 2) * viewport.zoom + viewport.y,
  });
  const from = screen(source, true);
  const pointerFlow = flow.screenToFlowPosition(pointer, { snapToGrid: false });
  const to = target && !error ? screen(target, false) : { x: pointerFlow.x * viewport.zoom + viewport.x, y: pointerFlow.y * viewport.zoom + viewport.y };
  const [path] = getBezierPath({ sourceX: from.x, sourceY: from.y, sourcePosition: Position.Right, targetX: to.x, targetY: to.y, targetPosition: Position.Left });

  return <div ref={overlay} className={`quick-connection${error ? " invalid" : ""}`} data-testid="quick-connection"
    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    onMouseMove={(e) => { setPointer({ x: e.clientX, y: e.clientY }); setHovered(nodeAt(e.clientX, e.clientY)); setNotice(""); }}
    onContextMenu={(e) => { e.preventDefault(); onCancel(); }}
    onClick={(e) => {
      e.stopPropagation();
      const id = nodeAt(e.clientX, e.clientY);
      if (!id) { onCancel(); return; }
      const invalid = connectionError(source.id, id, nodes, edges);
      if (invalid) setNotice(invalid);
      else onConnect(id);
    }}
    onWheel={(e) => { e.stopPropagation(); void flow.zoomTo(Math.min(2, Math.max(0.2, viewport.zoom * Math.exp(-e.deltaY * 0.002)))); }}>
    <svg aria-hidden="true"><path d={path} /><circle cx={from.x} cy={from.y} r={5} /><circle cx={to.x} cy={to.y} r={5} />{target && !error && <rect x={target.position.x * viewport.zoom + viewport.x - 4} y={target.position.y * viewport.zoom + viewport.y - 4} width={(target.measured?.width ?? target.width ?? 0) * viewport.zoom + 8} height={(target.measured?.height ?? target.height ?? 0) * viewport.zoom + 8} rx={16} />}</svg>
    <span className="quick-connection-hint" role="status">{notice || error || (target ? "Clique para conectar" : "Clique em outro elemento · Esc cancela")}</span>
  </div>;
}
