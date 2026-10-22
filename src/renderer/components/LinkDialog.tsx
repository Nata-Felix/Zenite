import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AppWindow, Copy, ExternalLink } from "lucide-react";

/** "Como abrir este link?" — aparece quando a configuração de links é "Perguntar". */
export function LinkDialog() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => window.o.system.onLinkAsk(setUrl), []);
  if (!url) return null;

  const close = () => setUrl(null);
  const open = (how: "external" | "zenite") => {
    window.o.system.openLink(url, how);
    close();
  };

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={close}>
      <div className="dialog link-dialog" role="dialog" aria-labelledby="link-title" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && close()}>
        <h2 id="link-title">Abrir link</h2>
        <p className="link-url" title={url}>{url}</p>
        <div className="link-choices">
          <button className="primary" autoFocus onClick={() => open("external")}><ExternalLink size={15} />Abrir no navegador externo</button>
          <button className="ghost" onClick={() => open("zenite")}><AppWindow size={15} />Abrir no navegador do Zênite</button>
          <button className="ghost" onClick={() => { void window.o.system.writeClipboard(url); close(); }}><Copy size={15} />Copiar link</button>
          <button className="ghost" onClick={close}>Cancelar</button>
        </div>
        <p className="dialog-hint">Para não perguntar mais, escolha o padrão em Configurações → Geral → Links.</p>
      </div>
    </div>,
    document.body,
  );
}
