import { join } from "node:path";
import { BaseWindow, WebContentsView, shell } from "electron";

/**
 * Navegador do Zênite: janela com uma barra (voltar, avançar, recarregar, endereço, "+" para pôr
 * o site no canvas, abrir no navegador externo) e a página embaixo. A barra é uma página sem
 * acesso ao Node; os botões navegam para https://zenite-browser.invalid/acao, e o processo principal intercepta.
 * (Um esquema próprio, como zenite-browser://, iria para o Windows abrir como protocolo externo.)
 */
const BAR_HEIGHT = 44;
const ACTION_PREFIX = "https://zenite-browser.invalid/";

const BAR_HTML = `<!doctype html><html><head><meta charset="utf-8">
<style>
:root { color-scheme: light dark; --bg: #f4f4f6; --fg: #1f2328; --line: #d0d4da; --field: #fff; --accent: #4f6bed; }
@media (prefers-color-scheme: dark) { :root { --bg: #1d1f24; --fg: #e6e7ea; --line: #3a3e46; --field: #13151a; --accent: #8aa0ff; } }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg); font: 13px "Segoe UI", system-ui, sans-serif; overflow: hidden; }
body { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
button { height: 30px; min-width: 30px; padding: 0 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
button:hover:not(:disabled) { background: color-mix(in srgb, var(--fg) 10%, transparent); }
button:disabled { opacity: .35; cursor: default; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
form { flex: 1; display: flex; }
input { flex: 1; height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: inherit; font: inherit; }
#add { border-color: var(--accent); color: var(--accent); font-weight: 600; }
#note { color: var(--accent); white-space: nowrap; }
</style></head><body>
<button id="back" title="Voltar (Alt+←)" aria-label="Voltar">&#8592;</button>
<button id="forward" title="Avançar (Alt+→)" aria-label="Avançar">&#8594;</button>
<button id="reload" title="Recarregar (F5)" aria-label="Recarregar">&#8635;</button>
<form id="go"><input id="url" aria-label="Endereço" spellcheck="false" autocomplete="off"></form>
<span id="note" role="status"></span>
<button id="add" title="Adicionar este site ao canvas aberto" aria-label="Adicionar ao canvas">+ Canvas</button>
<button id="external" title="Abrir no navegador externo" aria-label="Abrir no navegador externo">&#8599;</button>
<script>
const act = (name, value = "") => { location.href = "https://zenite-browser.invalid/" + name + "?v=" + encodeURIComponent(value); };
for (const id of ["back", "forward", "reload", "add", "external"]) document.getElementById(id).onclick = () => act(id);
const field = document.getElementById("url");
document.getElementById("go").onsubmit = (e) => { e.preventDefault(); act("go", field.value); field.blur(); };
let noteTimer;
window.setState = (s) => {
  if (document.activeElement !== field) field.value = s.url;
  document.getElementById("back").disabled = !s.back;
  document.getElementById("forward").disabled = !s.forward;
};
window.showNote = (text) => {
  const note = document.getElementById("note");
  note.textContent = text;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => (note.textContent = ""), 3000);
};
</script></body></html>`;

/** O que foi digitado na barra vira endereço; texto com espaço ou sem ponto vira busca. */
export function addressToUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (!/\s/.test(text) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text)) return `https://${text}`;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(text)) return `http://${text}`;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

export class ZeniteBrowser {
  /** `addToCanvas` devolve false se não há canvas aberto. */
  constructor(private addToCanvas: (url: string, title: string) => boolean) {}

  open(url: string): void {
    const win = new BaseWindow({ width: 1200, height: 820, minWidth: 480, minHeight: 320, title: "Zênite", autoHideMenuBar: true });
    const secure = { sandbox: true, contextIsolation: true, nodeIntegration: false };
    const bar = new WebContentsView({ webPreferences: secure });
    // A página ganha a trava de chave de acesso (só com clique), como os sites do canvas.
    const page = new WebContentsView({ webPreferences: { ...secure, preload: join(__dirname, "../preload/browser.js") } });
    win.contentView.addChildView(bar);
    win.contentView.addChildView(page);
    const layout = () => {
      const { width, height } = win.getContentBounds();
      bar.setBounds({ x: 0, y: 0, width, height: BAR_HEIGHT });
      page.setBounds({ x: 0, y: BAR_HEIGHT, width, height: Math.max(0, height - BAR_HEIGHT) });
    };
    layout();
    win.on("resize", layout);
    win.on("closed", () => {
      bar.webContents.close();
      page.webContents.close();
    });

    const run = (code: string) => void bar.webContents.executeJavaScript(code).catch(() => {});
    const sync = () => {
      const nav = page.webContents.navigationHistory;
      run(`setState(${JSON.stringify({ url: page.webContents.getURL(), back: nav.canGoBack(), forward: nav.canGoForward() })})`);
      win.setTitle(`${page.webContents.getTitle() || page.webContents.getURL()} — Zênite`);
    };
    page.webContents.on("did-navigate", sync);
    page.webContents.on("did-navigate-in-page", sync);
    page.webContents.on("page-title-updated", sync);
    bar.webContents.on("did-finish-load", sync);
    // Links que abririam outra janela abrem aqui mesmo.
    page.webContents.setWindowOpenHandler(({ url: next }) => {
      if (/^https?:\/\//i.test(next)) void page.webContents.loadURL(next);
      return { action: "deny" };
    });
    page.webContents.on("before-input-event", (e, input) => {
      if (input.type !== "keyDown") return;
      const nav = page.webContents.navigationHistory;
      if (input.key === "F5") page.webContents.reload();
      else if (input.alt && input.key === "ArrowLeft" && nav.canGoBack()) nav.goBack();
      else if (input.alt && input.key === "ArrowRight" && nav.canGoForward()) nav.goForward();
      else return;
      e.preventDefault();
    });

    bar.webContents.on("will-navigate", (e, target) => {
      e.preventDefault();
      if (!target.startsWith(ACTION_PREFIX)) return;
      const action = new URL(target);
      const value = action.searchParams.get("v") ?? "";
      const nav = page.webContents.navigationHistory;
      const current = page.webContents.getURL();
      switch (action.pathname.slice(1)) {
        case "back": if (nav.canGoBack()) nav.goBack(); break;
        case "forward": if (nav.canGoForward()) nav.goForward(); break;
        case "reload": page.webContents.reload(); break;
        case "go": {
          const next = addressToUrl(value);
          if (next) void page.webContents.loadURL(next);
          break;
        }
        case "external": if (/^https?:\/\//i.test(current)) void shell.openExternal(current); break;
        case "add": {
          const ok = /^https?:\/\//i.test(current) && this.addToCanvas(current, page.webContents.getTitle());
          run(`showNote(${JSON.stringify(ok ? "Adicionado ao canvas ✓" : "Abra um canvas no Zênite primeiro")})`);
          break;
        }
      }
    });

    void bar.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(BAR_HTML)}`);
    void page.webContents.loadURL(url);
  }
}
