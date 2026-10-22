import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { SquareTerminal } from "lucide-react";
import { presetFor } from "../agents";
import { useAttention } from "../attentionBus";
import { ELEMENT_STYLE, type CanvasFlowNode } from "../nodes";
import type { AnyIcon } from "../presets";
import { flowType, useFlowStatus } from "./FlowNode";
export { SUMMARY_SIZE, SUN_SIZE } from "../roundConnections";

function lastPart(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Ícone, cor, nome e uma linha de descrição de um elemento, para o cartão resumido. */
export function summaryOf(n: CanvasFlowNode): { icon: AnyIcon; color: string; title: string; subtitle: string; sun: boolean } {
  const t = n.data.terminal;
  if (t) {
    const preset = presetFor(t.command, t.provider);
    const role = t.sun ? "Orquestrador" : preset.title;
    return { icon: preset.icon ?? SquareTerminal, color: t.appearance?.color ?? preset.color, title: t.title, subtitle: t.accountName ? `${role} · ${t.accountName}` : role, sun: !!t.sun };
  }
  const e = n.data.element!;
  const style = ELEMENT_STYLE[e.kind];
  // Astro: ícone, cor e nome do tipo (Torre de controle, Satélite...).
  const astro = e.kind === "flow" && e.flow ? flowType(e.flow.type) : undefined;
  if (astro) return { icon: astro.icon, color: astro.color, title: e.title, subtitle: astro.label, sun: false };
  const detail = e.kind === "web" && e.url ? hostOf(e.url) : (e.kind === "file" || e.kind === "folder") && e.path ? lastPart(e.path) : style.label;
  return { icon: style.icon, color: style.color, title: e.title, subtitle: detail, sun: false };
}

/**
 * Elemento circular da visão resumida: ícone, nome abaixo e borda inteira conectável.
 * O centro permite mover e abrir o conteúdo; o Sol mantém seus raios.
 */
function SummaryNodeImpl({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const s = summaryOf({ id, data } as CanvasFlowNode);
  const attention = useAttention(id);
  const flowStatus = useFlowStatus(id);
  const Icon = s.icon;
  return (
    <div
      className={`summary-node${s.sun ? " sun" : ""}${selected ? " selected" : ""}${attention ? " attention" : ""}`}
      style={{ "--agent": s.color } as React.CSSProperties}
      title={`${s.title} · ${s.subtitle} (clique para abrir)`}
    >
      <Handle type="target" position={Position.Left} className="summary-round-target" />
      {s.sun ? (
        <>
          <div className="sun-orb" aria-hidden="true">
            <span className="sun-rays" />
            <span className="sun-core">
              <Icon size={30} />
            </span>
          </div>
          <strong className="summary-title">{s.title}</strong>
          <small className="summary-sub">{s.subtitle}</small>
        </>
      ) : (
        <>
          <span className="summary-icon">
            <Icon size={32} />
          </span>
          <span className="summary-text">
            <strong className="summary-title">{s.title}</strong>
            <small className="summary-sub">{s.subtitle}</small>
            {data.element?.kind === "flow" && flowStatus && <small className={`flow-status ${flowStatus.state}`} role="status" title={flowStatus.message}>{flowStatus.message || (flowStatus.state === "running" ? "Rodando" : flowStatus.state === "ok" ? "Feito" : "Erro")}</small>}
          </span>
          {attention && <span className="summary-dot" title="Precisa de você" />}
        </>
      )}
      <Handle type="source" position={Position.Right} className="summary-link-ring" title="Arraste a borda para ligar a outro elemento" aria-label="Criar ligação pela borda" />
    </div>
  );
}

export const SummaryNode = memo(SummaryNodeImpl);
