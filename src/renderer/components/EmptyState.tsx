import { PRESETS, type AgentPreset } from "../agents";

interface Props {
  workspaceName: string;
  onPick(preset: AgentPreset): void;
}

export function EmptyState({ workspaceName, onPick }: Props) {
  return (
    <div className="empty-state">
      <h1>{workspaceName}</h1>
      <p>Comece um terminal. Dica: dê duplo clique em qualquer ponto do canvas para criar um ali.</p>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p.kind} className="preset-card" style={{ "--agent": p.color } as React.CSSProperties} onClick={() => onPick(p)}>
            <span className="agent-chip large">
              <p.icon size={18} />
            </span>
            <strong>{p.title}</strong>
            <small>{p.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
