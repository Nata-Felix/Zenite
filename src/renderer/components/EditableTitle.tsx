import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange(value: string): void;
  className?: string;
}

/** Título que vira campo de texto com duplo clique. Enter salva, Esc cancela. */
export function EditableTitle({ value, onChange, className = "" }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  if (!editing) {
    return (
      <span
        className={`node-title ${className}`}
        title="Duplo clique para renomear"
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </span>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onChange(draft.trim());
  };
  return (
    <input
      ref={input}
      className="node-title-input nodrag"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
