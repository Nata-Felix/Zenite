import { useEffect, useRef, useState } from "react";
import { Circle, Diamond, Eraser, Frame, Hand, Lock, LockOpen, Minus, MousePointer2, MoveRight, PaintBucket, Pencil, Pointer, Redo2, Shapes, Square, Type, Undo2, WandSparkles } from "lucide-react";
import type { Tool } from "./style";

type Icon = typeof Square;

/** Barra principal: a tecla aparece no canto de cada botão, como no Excalidraw. */
const TOOLS: { tool: Tool; label: string; key: string; icon: Icon }[] = [
  { tool: "hand", label: "Mão: arrastar o canvas vazio move a tela", key: "H", icon: Hand },
  { tool: "select", label: "Selecionar: arrastar o canvas vazio faz uma caixa de seleção", key: "V", icon: MousePointer2 },
  { tool: "rectangle", label: "Retângulo", key: "R", icon: Square },
  { tool: "diamond", label: "Losango", key: "D", icon: Diamond },
  { tool: "ellipse", label: "Elipse", key: "O", icon: Circle },
  { tool: "arrow", label: "Seta", key: "A", icon: MoveRight },
  { tool: "line", label: "Linha", key: "L", icon: Minus },
  { tool: "pen", label: "Lápis", key: "P", icon: Pencil },
  { tool: "text", label: "Texto", key: "T", icon: Type },
  { tool: "eraser", label: "Borracha: passe sobre os desenhos para apagar", key: "E", icon: Eraser },
];

/** Menu "mais ferramentas". */
const MORE: { tool: Tool; label: string; key: string; icon: Icon }[] = [
  { tool: "frame", label: "Ferramenta de quadro", key: "F", icon: Frame },
  { tool: "shape", label: "Desenho → forma", key: "Shift+X", icon: WandSparkles },
  { tool: "laser", label: "Ponteiro de laser", key: "K", icon: Pointer },
  { tool: "bucket", label: "Balde de tinta", key: "B", icon: PaintBucket },
];

interface Props {
  tool: Tool;
  onTool(t: Tool): void;
  /** Trava: a ferramenta continua ativa depois de desenhar. */
  locked: boolean;
  onLock(locked: boolean): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
}

export function DrawToolbar({ tool, onTool, locked, onLock, canUndo, canRedo, onUndo, onRedo }: Props) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const extra = MORE.find((m) => m.tool === tool);
  const ExtraIcon = extra?.icon ?? Shapes;

  // Clique fora fecha o menu.
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  return (
    <div className="draw-toolbar" role="toolbar" aria-label="Desenho">
      <button
        className={locked ? "on" : ""}
        title={`Manter ativa a ferramenta selecionada após desenhar (Q)`}
        aria-pressed={locked}
        onClick={() => onLock(!locked)}
      >
        {locked ? <Lock size={16} /> : <LockOpen size={16} />}
        <kbd className="tool-key">Q</kbd>
      </button>
      <span className="draw-sep" />
      {TOOLS.map((t) => (
        <button key={t.tool} className={tool === t.tool ? "on" : ""} title={`${t.label} (${t.key})`} aria-pressed={tool === t.tool} onClick={() => onTool(t.tool)}>
          <t.icon size={16} />
          <kbd className="tool-key">{t.key}</kbd>
        </button>
      ))}
      <div className="draw-more" ref={box}>
        <button className={extra ? "on" : ""} title="Mais ferramentas" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <ExtraIcon size={16} />
        </button>
        {menu && (
          <div className="draw-more-menu" role="menu">
            {MORE.map((m) => (
              <button
                key={m.tool}
                role="menuitemradio"
                aria-checked={tool === m.tool}
                className={tool === m.tool ? "on" : ""}
                onClick={() => {
                  onTool(m.tool);
                  setMenu(false);
                }}
              >
                <m.icon size={16} />
                <span>{m.label}</span>
                <kbd>{m.key}</kbd>
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="draw-sep" />
      <button title="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={16} />
      </button>
      <button title="Refazer (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}>
        <Redo2 size={16} />
      </button>
    </div>
  );
}
