import { useState } from "react";
import { createPortal } from "react-dom";
import { PenTool, SquareTerminal } from "lucide-react";
import type { NodeKind } from "../../shared/types";
import { ELEMENT_STYLE } from "../nodes";

const KINDS: { kind: NodeKind; label: string; icon: typeof PenTool; hint?: string }[] = [
  { kind: "terminal", label: "Terminais", icon: SquareTerminal, hint: "nome, comando e pasta; sem conta nem chave" },
  { kind: "note", label: "Notas", icon: ELEMENT_STYLE.note.icon },
  { kind: "table", label: "Tabelas", icon: ELEMENT_STYLE.table.icon },
  { kind: "image", label: "Imagens", icon: ELEMENT_STYLE.image.icon },
  { kind: "video", label: "Vídeos", icon: ELEMENT_STYLE.video.icon },
  { kind: "web", label: "Sites", icon: ELEMENT_STYLE.web.icon },
  { kind: "file", label: "Arquivos", icon: ELEMENT_STYLE.file.icon, hint: "só o caminho" },
  { kind: "folder", label: "Pastas", icon: ELEMENT_STYLE.folder.icon, hint: "só o caminho" },
  { kind: "flow", label: "Astros", icon: ELEMENT_STYLE.flow.icon, hint: "com a configuração" },
  { kind: "skill", label: "Skills", icon: ELEMENT_STYLE.skill.icon, hint: "referência à pasta; arquivos permanecem no computador" },
  { kind: "service", label: "Serviços", icon: ELEMENT_STYLE.service.icon, hint: "configuração e nome da variável; sem o token" },
  { kind: "blackhole", label: "Buracos negros", icon: ELEMENT_STYLE.blackhole.icon, hint: "inclua também os tipos dos elementos guardados" },
  { kind: "draw", label: "Desenhos", icon: PenTool },
];

interface Props {
  counts: Partial<Record<NodeKind, number>>;
  busy: boolean;
  error: string;
  onExport(kinds: NodeKind[]): void;
  onCancel(): void;
}

/** Escolha do que vai no .zenite. Só aparecem os tipos que existem no canvas. */
export function ExportCanvasDialog({ counts, busy, error, onExport, onCancel }: Props) {
  const present = KINDS.filter((k) => (counts[k.kind] ?? 0) > 0);
  const [chosen, setChosen] = useState(() => new Set(present.map((k) => k.kind)));
  const toggle = (kind: NodeKind, on: boolean) => setChosen((s) => { const next = new Set(s); if (on) next.add(kind); else next.delete(kind); return next; });
  const total = present.filter((k) => chosen.has(k.kind)).reduce((sum, k) => sum + (counts[k.kind] ?? 0), 0);

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={() => !busy && onCancel()}>
      <div className="dialog export-dialog" role="dialog" aria-labelledby="export-title" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}>
        <h2 id="export-title">Exportar canvas</h2>
        <p className="dialog-text">Marque o que vai no arquivo. As ligações entre os itens marcados vão junto. Contas, chaves de API e .env nunca vão.</p>
        {present.length === 0 ? <p className="dialog-hint">O canvas está vazio.</p> : (
          <div className="export-kinds">
            {present.map(({ kind, label, icon: Icon, hint }) => (
              <label key={kind} className="toggle">
                <input type="checkbox" checked={chosen.has(kind)} disabled={busy} onChange={(e) => toggle(kind, e.target.checked)} />
                <Icon size={15} />
                <span>{label} <small>({counts[kind]}){hint ? ` · ${hint}` : ""}</small></span>
              </label>
            ))}
          </div>
        )}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button className="ghost" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button className="primary" autoFocus disabled={busy || total === 0} onClick={() => onExport(present.filter((k) => chosen.has(k.kind)).map((k) => k.kind))}>
            {busy ? "Exportando…" : `Exportar ${total} ${total === 1 ? "item" : "itens"}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
