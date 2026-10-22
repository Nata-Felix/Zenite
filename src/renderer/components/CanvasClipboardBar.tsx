import { ClipboardPaste, Copy, Scissors, X } from "lucide-react";
import type { CanvasClipboardState } from "../../shared/types";

interface Props {
  clipboard: CanvasClipboardState | null;
  notice: string;
  busy: boolean;
  onPaste(): void;
  onClear(): void;
}

export function CanvasClipboardBar({ clipboard, notice, busy, onPaste, onClear }: Props) {
  if (!clipboard && !notice) return null;
  const Icon = clipboard?.mode === "cut" ? Scissors : Copy;
  return <section className="canvas-clipboard nodrag nopan nowheel" aria-label="Área de transferência do canvas">
    {clipboard && <>
      <div className="canvas-clipboard-label"><Icon size={15} /><span>{clipboard.count} {clipboard.count === 1 ? "elemento" : "elementos"} {clipboard.mode === "cut" ? "para mover" : "para copiar"}</span><kbd>Ctrl+V</kbd></div>
      <div className="canvas-clipboard-actions">
        <button className="ghost small" disabled={busy} onClick={onPaste}><ClipboardPaste size={14} />Colar aqui</button>
        {clipboard.mode === "cut" ? <button className="ghost small" disabled={busy} onClick={onClear}>Desfazer recorte</button> : <button className="icon-button" title="Limpar cópia" aria-label="Limpar cópia" disabled={busy} onClick={onClear}><X size={14} /></button>}
      </div>
    </>}
    {notice && <p role="status" aria-live="polite">{notice}</p>}
  </section>;
}
