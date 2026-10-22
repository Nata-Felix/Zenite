import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { mediaUrl, type CanvasFlowNode } from "../nodes";
import { ElementShell } from "./ElementShell";

function MediaNodeImpl({ data, selected }: NodeProps<CanvasFlowNode>) {
  const element = data.element!;
  const src = element.file ? mediaUrl(element.file) : "";
  return (
    <ElementShell element={element} actions={data.actions} selected={!!selected}>
      {!src ? (
        <div className="media-empty">Sem arquivo</div>
      ) : element.kind === "image" ? (
        <img className="media" src={src} alt={element.title} draggable={false} />
      ) : (
        <video className="media nodrag" src={src} controls preload="metadata" />
      )}
    </ElementShell>
  );
}

export const MediaNode = memo(MediaNodeImpl);
