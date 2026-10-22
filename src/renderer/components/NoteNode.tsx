import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { openLinkFromMarkdown, renderMarkdown } from "../markdown";
import { NOTE_COLORS } from "../itemPrefs";
import type { NodeProps } from "@xyflow/react";
import type { CanvasFlowNode } from "../nodes";
import { ElementShell } from "./ElementShell";
import { useBufferedElementWrite } from "../elementDrafts";

/** Enquanto o usuário digita, mudanças vindas de agentes esperam esse tempo. */
const TYPING_GRACE_MS = 1000;

function NoteNodeImpl({ data, selected }: NodeProps<CanvasFlowNode>) {
  const element = data.element!;
  const [text, setText] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const lastTyped = useRef(0);
  const save = useBufferedElementWrite<string>(element.id, (value) => window.o.elements.writeNote(element.id, value));

  useEffect(() => {
    let alive = true;
    window.o.elements.readNote(element.id).then((c) => alive && setText(c));
    const off = window.o.elements.onNoteChanged((id, content) => {
      if (id !== element.id) return;
      const apply = () => {
        setText(content);
        setFlash(true);
        setTimeout(() => setFlash(false), 900);
      };
      const wait = TYPING_GRACE_MS - (Date.now() - lastTyped.current);
      if (wait > 0) setTimeout(apply, wait);
      else apply();
    });
    return () => {
      alive = false;
      off();
    };
  }, [element.id]);

  const onChange = (value: string) => {
    lastTyped.current = Date.now();
    setText(value);
    save(value);
  };

  const formatted = !!element.formatted && text !== null;
  const html = useMemo(() => (formatted ? renderMarkdown(text ?? "") : ""), [formatted, text]);
  const setFormatted = (v: boolean) => data.actions.editElement(element.id, { formatted: v });
  const colorIndex = Math.max(
    0,
    NOTE_COLORS.findIndex((c) => c.value === (element.color ?? "yellow")),
  );
  const nextColor = NOTE_COLORS[(colorIndex + 1) % NOTE_COLORS.length];
  const header = (
    <>
      <button
        className="note-color nodrag"
        title={`Cor da nota: ${NOTE_COLORS[colorIndex].label}. Clique para ${nextColor.label.toLowerCase()}.`}
        style={{ background: NOTE_COLORS[colorIndex].css }}
        onClick={() => data.actions.editElement(element.id, { color: nextColor.value })}
      />
      <button
        className="icon-button nodrag"
        title={formatted ? "Editar o texto" : "Ver formatado (Markdown)"}
        aria-pressed={formatted}
        onClick={() => setFormatted(!formatted)}
      >
        {formatted ? <Pencil size={13} /> : <Eye size={13} />}
      </button>
    </>
  );

  return (
    <ElementShell element={element} actions={data.actions} selected={!!selected} header={header}>
      {formatted ? (
        <div
          className={`note-md nodrag nowheel${flash ? " flash" : ""}`}
          title="Duplo clique para editar"
          onDoubleClick={() => setFormatted(false)}
          onClick={openLinkFromMarkdown}
          // Sanitizado pelo DOMPurify em renderMarkdown.
          dangerouslySetInnerHTML={{
            __html: html || "<p class='note-md-empty'>Nota vazia. Duplo clique para escrever.</p>",
          }}
        />
      ) : (
        <textarea
          className={`note-text nodrag nowheel${flash ? " flash" : ""}`}
          value={text ?? ""}
          placeholder={text === null ? "Carregando…" : "Escreva aqui. Agentes ligados a esta nota podem ler e editar."}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      )}
    </ElementShell>
  );
}

export const NoteNode = memo(NoteNodeImpl);
