import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { plural } from "../../shared/plural";

/** "Fechar o Zênite?" no visual do app, pedido pelo processo principal ao fechar a janela. */
export function CloseDialog() {
  const [open, setOpen] = useState<number | null>(null);
  const [dontAsk, setDontAsk] = useState(false);

  useEffect(
    () =>
      window.o.system.onConfirmClose((n) => {
        setDontAsk(false);
        setOpen(n);
        window.o.system.closeShown();
      }),
    [],
  );

  if (open === null) return null;
  const reply = (close: boolean) => {
    setOpen(null);
    window.o.system.answerClose(close, dontAsk);
  };

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={() => reply(false)}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && reply(false)}>
        <h2>Fechar o Zênite?</h2>
        <p className="dialog-text">
          {plural(open, "terminal aberto vai ser encerrado", "terminais abertos vão ser encerrados")}, inclusive agentes que estejam trabalhando.
        </p>
        <label className="toggle">
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
          <span>Não perguntar de novo</span>
        </label>
        <div className="dialog-actions">
          <button className="ghost" autoFocus onClick={() => reply(false)}>
            Cancelar
          </button>
          <button className="primary danger" onClick={() => reply(true)}>
            Fechar e encerrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
