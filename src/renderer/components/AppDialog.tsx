import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AppDialogRequest } from "../../shared/types";

/**
 * Perguntas no visual do Zênite, no lugar das caixas do Windows: as do processo principal
 * (permissões, aprovações de fluxo, erros) e as da própria interface (confirmDialog).
 * Uma de cada vez; as outras esperam na fila.
 */
type Item = AppDialogRequest & { reply: (ok: boolean, checked: boolean) => void };

let queue: Item[] = [];
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
const push = (item: Item) => {
  queue = [...queue, item];
  changed();
};
const drop = (id: number) => {
  queue = queue.filter((i) => i.id !== id);
  changed();
};

let localSeq = 0;
/** Confirmação da interface; resolve true quando a pessoa aceita. */
export function confirmDialog(o: Omit<AppDialogRequest, "id">): Promise<boolean> {
  return new Promise((resolve) => push({ ...o, id: --localSeq, reply: (ok) => resolve(ok) }));
}

export function AppDialog() {
  const [items, setItems] = useState(queue);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const sync = () => setItems(queue);
    listeners.add(sync);
    const offAsk = window.o.dialogs.onAsk((req) => {
      window.o.dialogs.shown(req.id);
      push({ ...req, reply: (ok, c) => window.o.dialogs.answer(req.id, ok, c) });
    });
    const offClose = window.o.dialogs.onClose(drop);
    return () => {
      listeners.delete(sync);
      offAsk();
      offClose();
    };
  }, []);

  const current = items[0];
  useEffect(() => setChecked(false), [current?.id]);
  if (!current) return null;
  const reply = (ok: boolean) => {
    drop(current.id);
    current.reply(ok, ok && checked);
  };
  const cancel = () => reply(!current.cancel);

  return createPortal(
    <div className="dialog-backdrop app-dialog-backdrop" onMouseDown={cancel}>
      <div className="dialog app-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && cancel()}>
        <h2>{current.title}</h2>
        {current.message !== current.title && <p className="dialog-text app-dialog-message">{current.message}</p>}
        {current.detail && <p className="dialog-text app-dialog-detail">{current.detail}</p>}
        {current.checkbox && (
          <label className="toggle">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>{current.checkbox}</span>
          </label>
        )}
        <div className="dialog-actions">
          {current.cancel && (
            <button className="ghost" autoFocus onClick={() => reply(false)}>
              {current.cancel}
            </button>
          )}
          <button className={`primary${current.danger ? " danger" : ""}`} autoFocus={!current.cancel} onClick={() => reply(true)}>
            {current.ok}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
