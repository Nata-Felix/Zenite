import { ipcRenderer } from "electron";
import { installPasskeyGuard } from "./passkeyGuard";

/*
 * Roda dentro de cada site do canvas (<webview>), isolado da página.
 * Ctrl + rodinha vira zoom do site, avisando o canvas, que aplica e salva (o Electron não faz
 * esse zoom sozinho em <webview>). E chave de acesso só com clique (passkeyGuard.ts).
 */
installPasskeyGuard();

window.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    ipcRenderer.sendToHost("zenite:zoom", e.deltaY < 0 ? "in" : "out");
  },
  { passive: false, capture: true },
);
