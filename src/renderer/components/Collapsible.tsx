import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { readPref, writePref } from "../prefs";

export type BarSide = "top" | "bottom" | "left" | "right";

/** Barra recolhida ou não, lembrada entre aberturas (uma chave por barra). */
export function useCollapsed(id: string): [boolean, (v: boolean) => void] {
  const [collapsed, set] = useState(() => readPref(`bar.${id}.collapsed`, false));
  return [collapsed, (v) => { set(v); writePref(`bar.${id}.collapsed`, v); }];
}

// A seta aponta para onde a barra vai: recolher a de baixo aponta para baixo.
const HIDE = { top: ChevronUp, bottom: ChevronDown, left: ChevronLeft, right: ChevronRight };
const SHOW = { top: ChevronDown, bottom: ChevronUp, left: ChevronRight, right: ChevronLeft };

/** Botão de recolher que fica na própria barra. */
export function CollapseButton({ side, label, onClick }: { side: BarSide; label: string; onClick: () => void }) {
  const Icon = HIDE[side];
  return <button type="button" className="bar-collapse" title={`Recolher ${label}`} aria-label={`Recolher ${label}`} onClick={onClick}><Icon size={14} /></button>;
}

/** O que sobra da barra recolhida: uma aba pequena para mostrar de novo. */
export function CollapsedTab({ side, label, onClick, children }: { side: BarSide; label: string; onClick: () => void; children?: React.ReactNode }) {
  const Icon = SHOW[side];
  return (
    <button type="button" className={`bar-tab bar-tab-${side}`} title={`Mostrar ${label}`} aria-label={`Mostrar ${label}`} onClick={onClick}>
      {children}<Icon size={14} />
    </button>
  );
}
