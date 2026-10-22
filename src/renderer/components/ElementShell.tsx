import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import type { ElementSpec } from "../../shared/types";
import { ELEMENT_STYLE, type NodeActions } from "../nodes";
import { EditableTitle } from "./EditableTitle";
import { noteColorCss } from "../itemPrefs";
import { resizeGuard } from "../interaction";
import { clampZoom, ZoomControl } from "./ZoomControl";
import { ScreenFrame } from "./ScreenFrame";

interface Props {
  element: ElementSpec;
  actions: NodeActions;
  selected: boolean;
  /** Conteúdo extra no cabeçalho, à direita do título. */
  header?: ReactNode;
  children: ReactNode;
  minWidth?: number;
  minHeight?: number;
  /** Avisos de início e fim do redimensionamento (o site congela o tamanho enquanto isso). */
  onResizeStart?(): void;
  onResizeEnd?(): void;
}

/** Moldura comum de notas, imagens, vídeos e sites. */
export function ElementShell({ element, actions, selected, header, children, minWidth = 200, minHeight = 120, onResizeStart, onResizeEnd }: Props) {
  const style = ELEMENT_STYLE[element.kind];
  // A nota pode ter a cor que o usuário escolheu.
  const color = element.kind === "note" && element.color ? noteColorCss(element.color) : style.color;
  const zoom = element.zoom ?? 1;
  return (
    <div className={`element-node kind-${element.kind}${selected ? " selected" : ""}`} style={{ "--agent": color } as React.CSSProperties}>
      <NodeResizer minWidth={minWidth} minHeight={minHeight} isVisible={selected} lineClassName="resize-line" handleClassName="resize-handle" {...resizeGuard(onResizeStart, onResizeEnd)} />
      <Handle type="target" position={Position.Left} />
      <div className="element-header drag-handle">
        <span className="agent-chip">
          <style.icon size={13} />
        </span>
        <EditableTitle value={element.title} onChange={(t) => actions.rename(element.id, t)} />
        {header}
        {/* O site tem o próprio zoom (da página), no header dele. */}
        {element.kind !== "web" && (
          <ZoomControl percent={zoom * 100} what="o zoom" onStep={(d) => actions.updateElement(element.id, { zoom: clampZoom(zoom + d * 0.1) })} onReset={() => actions.updateElement(element.id, { zoom: undefined })} />
        )}
        <button className="icon-button element-close nodrag" title={`Remover ${style.label.toLowerCase()}`} onClick={() => actions.close(element.id)}>
          <X size={14} />
        </button>
      </div>
      <div className="element-body" style={element.kind !== "web" && zoom !== 1 ? { zoom } : undefined}>
        <ScreenFrame>{children}</ScreenFrame>
      </div>
      {/* Com Alt apertado, cobre o conteúdo (site, nota, tabela...): arrastar de qualquer ponto move. */}
      <div className="move-shield drag-handle" />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
