import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  LayoutGrid,
  Scan,
  Workflow,
  Eclipse,
} from "lucide-react";
import type { Align } from "../layout";

interface Props {
  count: number;
  onAlign(a: Align): void;
  onDistribute(axis: "x" | "y"): void;
  onGrid(): void;
  onFit(): void;
  onGroup(): void;
  canAutoLayout: boolean;
  onAutoLayout(): void;
}

/** Aparece com 2 ou mais elementos selecionados (Ctrl + clique, ou Shift + arrastar uma caixa). */
export function SelectionBar({ count, onAlign, onDistribute, onGrid, onFit, onGroup, canAutoLayout, onAutoLayout }: Props) {
  const b = (title: string, icon: React.ReactNode, run: () => void, disabled = false) => (
    <button title={title} aria-label={title} disabled={disabled} onClick={run}>
      {icon}
    </button>
  );
  return (
    <div className="selection-bar" role="toolbar" aria-label="Organizar seleção">
      <span className="selection-count">{count} selecionados</span>
      {b("Guardar seleção em Buraco negro", <Eclipse size={16} />, onGroup)}
      <span className="draw-sep vertical" />
      {b("Alinhar à esquerda", <AlignStartVertical size={15} />, () => onAlign("left"))}
      {b("Centralizar na horizontal", <AlignCenterVertical size={15} />, () => onAlign("center"))}
      {b("Alinhar à direita", <AlignEndVertical size={15} />, () => onAlign("right"))}
      {b("Alinhar ao topo", <AlignStartHorizontal size={15} />, () => onAlign("top"))}
      {b("Centralizar na vertical", <AlignCenterHorizontal size={15} />, () => onAlign("middle"))}
      {b("Alinhar embaixo", <AlignEndHorizontal size={15} />, () => onAlign("bottom"))}
      <span className="draw-sep vertical" />
      <button className="selection-auto" title="Organizar a seleção pelas conexões" aria-label="Organizar seleção automaticamente" disabled={!canAutoLayout} onClick={onAutoLayout}>
        <Workflow size={15} /><span>Automático</span>
      </button>
      {b("Distribuir na horizontal (3 ou mais)", <AlignHorizontalDistributeCenter size={15} />, () => onDistribute("x"), count < 3)}
      {b("Distribuir na vertical (3 ou mais)", <AlignVerticalDistributeCenter size={15} />, () => onDistribute("y"), count < 3)}
      {b("Organizar em grade (Ctrl+Alt+G)", <LayoutGrid size={15} />, onGrid)}
      {b("Enquadrar a seleção (Ctrl+Alt+\\)", <Scan size={15} />, onFit)}
    </div>
  );
}
