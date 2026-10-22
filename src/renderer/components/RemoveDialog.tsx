import { createPortal } from "react-dom";
import type { CanvasFlowNode } from "../nodes";
import { ELEMENT_STYLE } from "../nodes";
import { plural } from "../../shared/plural";

interface Props {
  nodes: CanvasFlowNode[];
  onConfirm(): void;
  onCancel(): void;
}

function titleOf(n: CanvasFlowNode): string {
  return n.data.terminal?.title || n.data.element?.title || "sem nome";
}

/** O que se perde ao remover, por tipo. */
function consequence(nodes: CanvasFlowNode[]): string {
  const terminals = nodes.filter((n) => n.data.terminal).length;
  const notes = nodes.filter((n) => n.data.element?.kind === "note").length;
  const tables = nodes.filter((n) => n.data.element?.kind === "table").length;
  const parts: string[] = [];
  if (terminals) parts.push(terminals === 1 ? "O terminal é encerrado, inclusive um agente que esteja trabalhando nele." : "Os terminais são encerrados, inclusive agentes que estejam trabalhando.");
  if (notes) parts.push(notes === 1 ? "O texto da nota vai junto." : "O texto das notas vai junto.");
  if (tables) parts.push(tables === 1 ? "O conteúdo da tabela vai junto." : "O conteúdo das tabelas vai junto.");
  if (!parts.length) parts.push(nodes.length === 1 ? "O elemento sai do canvas." : "Os elementos saem do canvas.");
  parts.push(terminals ? "Ctrl+Z traz de volta (o terminal volta com um shell novo)." : "Ctrl+Z traz de volta.");
  return parts.join(" ");
}

/** Confirmação antes de remover terminais e elementos (tecla Del ou botão X). */
export function RemoveDialog({ nodes, onConfirm, onCancel }: Props) {
  if (!nodes.length) return null;
  const one = nodes.length === 1 ? nodes[0] : null;
  const kind = one ? (one.data.terminal ? "terminal" : ELEMENT_STYLE[one.data.element!.kind].label.toLowerCase()) : "";
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
        <h2>{one ? `Remover ${kind} "${titleOf(one)}"?` : `Remover ${plural(nodes.length, "item", "itens")}?`}</h2>
        {!one && (
          <ul className="remove-list">
            {nodes.map((n) => (
              <li key={n.id}>{titleOf(n)}</li>
            ))}
          </ul>
        )}
        <p className="dialog-text">{consequence(nodes)}</p>
        <div className="dialog-actions">
          <button className="ghost" onClick={onCancel}>
            Cancelar
          </button>
          {/* Foco aqui: Enter confirma, Esc cancela. */}
          <button className="primary danger" autoFocus onClick={onConfirm}>
            Remover
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
