import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { resizeGuard } from "../interaction";
import type { CanvasFlowNode } from "../nodes";
import { ShapeSvg } from "./ShapeSvg";
import { cssColor, fontFamily } from "./style";

/** Desenho no canvas: forma, traço, seta, lápis ou texto. */
function DrawNodeImpl({ id, data, selected, width, height }: NodeProps<CanvasFlowNode>) {
  const spec = data.draw!;
  const { actions } = data;
  const w = width ?? 100;
  const h = height ?? 60;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(spec.text ?? "");
  const box = useRef<HTMLTextAreaElement>(null);
  const shown = useRef<HTMLDivElement>(null);

  // A caixa do texto acompanha o conteúdo (fonte e tamanho mudam a medida).
  useLayoutEffect(() => {
    const el = shown.current;
    if (!el || editing) return;
    const fw = Math.ceil(el.offsetWidth) + 4;
    const fh = Math.ceil(el.offsetHeight) + 4;
    if (Math.abs(fw - w) > 1 || Math.abs(fh - h) > 1) actions.resizeDraw(id, fw, fh);
  });

  // Texto recém-criado já abre em edição.
  useEffect(() => {
    if (spec.shape === "text" && !spec.text) setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editing) return;
    // Espera o clique que criou o texto terminar antes de pegar o foco.
    const t = setTimeout(() => {
      box.current?.focus();
      box.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const text = draft.replace(/\s+$/, "");
    if (!text) return actions.close(id);
    if (text !== spec.text) actions.updateDraw([id], { text });
    // A caixa cresce para caber o texto.
    const el = box.current;
    if (el) actions.resizeDraw(id, Math.max(w, el.scrollWidth + 8), Math.max(h, el.scrollHeight + 4));
  };

  const textStyle: React.CSSProperties = {
    fontFamily: fontFamily(spec.font),
    fontSize: spec.fontSize,
    color: cssColor(spec.stroke),
    textAlign: spec.textAlign,
    opacity: spec.opacity / 100,
    lineHeight: 1.25,
  };

  return (
    <div className={`draw-node shape-${spec.shape}${selected ? " selected" : ""}`} onDoubleClick={() => spec.shape === "text" && setEditing(true)}>
      <NodeResizer
        isVisible={!!selected && !editing && spec.shape !== "text"}
        minWidth={8}
        minHeight={8}
        lineClassName="draw-resize-line"
        handleClassName="draw-resize-handle"
        {...resizeGuard(() => actions.snapshot())}
      />
      {spec.shape === "text" ? (
        editing ? (
          <textarea
            ref={box}
            className="draw-text-edit nodrag nowheel"
            style={textStyle}
            value={draft}
            placeholder="Texto"
            onChange={(e) => {
              setDraft(e.target.value);
              const el = e.target;
              actions.resizeDraw(id, Math.max(w, el.scrollWidth + 8), Math.max(h, el.scrollHeight + 4));
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") box.current?.blur();
            }}
          />
        ) : (
          <div ref={shown} className="draw-text" style={textStyle}>
            {spec.text}
          </div>
        )
      ) : (
        <ShapeSvg spec={spec} width={w} height={h} />
      )}
      {spec.shape === "frame" && <FrameLabel name={spec.text ?? ""} onRename={(text) => actions.updateDraw([id], { text })} />}
    </div>
  );
}

/** Nome do quadro, acima da borda. Duplo clique edita; Enter ou sair do campo salva. */
function FrameLabel({ name, onRename }: { name: string; onRename(text: string): void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (editing) {
    return (
      <input
        className="draw-frame-label editing nodrag"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() !== name) onRename(draft.trim());
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
        }}
      />
    );
  }
  return (
    <div className="draw-frame-label" title="Duplo clique para renomear" onDoubleClick={(e) => { e.stopPropagation(); setDraft(name); setEditing(true); }}>
      {name || "Quadro"}
    </div>
  );
}

export const DrawNode = memo(DrawNodeImpl);
