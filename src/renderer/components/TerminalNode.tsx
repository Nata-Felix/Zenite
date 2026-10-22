import { memo, useEffect, useState } from "react";
import { Sun, X } from "lucide-react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { resizeGuard } from "../interaction";
import { presetFor } from "../agents";
import type { CanvasFlowNode } from "../nodes";
import { EditableTitle } from "./EditableTitle";
import { ProcessChip } from "./ProcessChip";
import { UsageChip } from "./UsageChip";
import { TaskChip } from "./TaskChip";
import { TerminalView } from "./TerminalView";
import { useAttention } from "../attentionBus";
import { terminalPrefs } from "../terminalPrefs";
import { ZoomControl } from "./ZoomControl";
import { ScreenFrame } from "./ScreenFrame";

function TerminalNodeImpl({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const terminal = data.terminal!;
  const { actions } = data;
  const preset = presetFor(terminal.command, terminal.provider);
  const [alive, setAlive] = useState(true);
  const attention = useAttention(id);
  const [isolated, setIsolated] = useState(false);
  useEffect(() => {
    let active = true;
    const update = () => void window.o.pty.runtime(id).then(info => { if (active) setIsolated(info.isolated); }).catch(() => { if (active) setIsolated(false); });
    update(); const timer = setInterval(update, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [id]);

  return (
    <div className={`terminal-node${selected ? " selected" : ""}${attention ? ` attention attention-${attention.reason}` : ""}`} style={{ "--agent": terminal.appearance?.color ?? preset.color } as React.CSSProperties}>
      <NodeResizer minWidth={320} minHeight={180} isVisible={selected} lineClassName="resize-line" handleClassName="resize-handle" {...resizeGuard()} />
      {terminal.sun && (
        <div className="sun-crown" title="Sol: o orquestrador desta galáxia">
          <Sun size={18} />
        </div>
      )}
      <Handle type="target" position={Position.Left} />
      <div className="terminal-header drag-handle">
        <span className="agent-chip">
          <preset.icon size={13} />
        </span>
        <EditableTitle value={terminal.title} onChange={(t) => actions.rename(id, t)} />
        <span className={`status-dot${alive ? " alive" : ""}`} title={alive ? "Em execução" : "Encerrado"} />
        {attention && (
          <button
            className="attention-chip nodrag"
            title={`${attention.message ?? (attention.reason === "request" ? "Pediu sua atenção" : "Terminou e está esperando você")} · clique para dispensar`}
            onClick={() => window.o.attention.clear(id)}
          >
            {attention.reason === "request" ? "Pede atenção" : "Esperando você"}
            {attention.message && <span className="truncate">: {attention.message}</span>}
          </button>
        )}
        <TaskChip terminalId={id} />
        {terminal.accountName && (
          <span className="account-chip" title={`Conta: ${terminal.accountName}`}>
            {terminal.accountName}
          </span>
        )}
        {(terminal.cwd || isolated) && <span className="terminal-cwd" title={isolated ? `Ambiente isolado. Pasta de referência no computador: ${terminal.cwd}. Os arquivos dessa pasta não estão montados no terminal.` : terminal.cwd}>{isolated ? "Isolado · /workspace" : terminal.cwd}</span>}
        <ZoomControl
          percent={((terminal.appearance?.fontSize ?? terminalPrefs().fontSize) / terminalPrefs().fontSize) * 100}
          what="a letra"
          onStep={(d) => actions.terminalFontSize(id, Math.min(32, Math.max(8, (terminal.appearance?.fontSize ?? terminalPrefs().fontSize) + d)))}
          onReset={() => actions.terminalFontSize(id, undefined)}
        />
        <UsageChip terminalId={id} />
        <ProcessChip terminalId={id} />
        <button className="icon-button terminal-close nodrag" title="Fechar terminal" onClick={() => actions.close(id)}>
          <X size={14} />
        </button>
      </div>
      <div className="terminal-screen">
        <ScreenFrame>
          <TerminalView spec={terminal} reloadVersion={data.reloadVersion} onAliveChange={setAlive} onLoadingChange={(loading) => actions.terminalLoading(id, loading)} />
        </ScreenFrame>
      </div>
      {/* Com Alt apertado, cobre o terminal: arrastar de qualquer ponto move o elemento. */}
      <div className="move-shield drag-handle" />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const TerminalNode = memo(TerminalNodeImpl);
