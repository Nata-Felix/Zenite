import { createPortal } from "react-dom";

interface Props {
  /** Pares de nomes ligados por cada linha que vai sair. */
  pairs: [string, string][];
  onConfirm(): void;
  onCancel(): void;
}

/** Confirmação antes de desconectar (Del numa linha ou "Desvincular" na Constelação). */
export function UnlinkDialog({ pairs, onConfirm, onCancel }: Props) {
  if (!pairs.length) return null;
  const one = pairs.length === 1 ? pairs[0] : null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div className="dialog" role="dialog" aria-labelledby="unlink-title" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
        <h2 id="unlink-title">{one ? `Desconectar "${one[0]}" de "${one[1]}"?` : `Desconectar ${pairs.length} ligações?`}</h2>
        {!one && (
          <ul className="remove-list">
            {pairs.map(([a, b], i) => (
              <li key={i}>{a} ↔ {b}</li>
            ))}
          </ul>
        )}
        <p className="dialog-text">Os elementos continuam no canvas. Sem a ligação, um agente deixa de poder usar o outro elemento.</p>
        <div className="dialog-actions">
          <button className="ghost" onClick={onCancel}>Cancelar</button>
          {/* Foco aqui: Enter confirma, Esc cancela. */}
          <button className="primary danger" autoFocus onClick={onConfirm}>Desconectar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
