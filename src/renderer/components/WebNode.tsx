import { createElement, memo, useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCw } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CanvasFlowNode } from "../nodes";
import { ElementShell } from "./ElementShell";
import { ZoomControl } from "./ZoomControl";

/** O que usamos do elemento <webview> do Electron. */
interface WebviewElement extends HTMLElement {
  getWebContentsId(): number;
  loadURL(url: string): Promise<void>;
  getURL(): string;
  canGoBack(): boolean;
  goBack(): void;
  reload(): void;
}

function normalize(raw: string): string {
  const url = raw.trim();
  if (!url) return "about:blank";
  // localhost:3000 parece um esquema ("localhost:"), por isso vem antes.
  if (/^localhost(:\d+)?(\/|$)/i.test(url) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(url)) return `http://${url}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (!url.includes(".") || /\s/.test(url)) return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
  return `https://${url}`;
}

function WebNodeImpl({ data, selected }: NodeProps<CanvasFlowNode>) {
  const element = data.element!;
  const { actions } = data;
  const view = useRef<WebviewElement | null>(null);
  // Os métodos do <webview> só podem ser chamados depois do primeiro dom-ready.
  const ready = useRef(false);
  const [address, setAddress] = useState(element.url ?? "");
  const [loading, setLoading] = useState(false);
  // O endereço inicial é usado uma vez; depois o webview navega sozinho.
  const [initialUrl] = useState(() => normalize(element.url ?? ""));
  // Zoom da página: Ctrl + rodinha dentro do site ou os botões −/+. Fica salvo no elemento.
  const zoom = element.zoom ?? 1;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const wcId = useRef<number | null>(null);
  // Durante o redimensionamento o site mantém o tamanho de antes e só se ajusta ao soltar:
  // refazer o layout da página a cada pixel do arraste travava o app.
  const host = useRef<HTMLDivElement | null>(null);
  const freeze = () => {
    const wv = view.current;
    const h = host.current;
    if (!wv || !h) return;
    wv.style.flex = "none";
    wv.style.width = `${h.clientWidth}px`;
    wv.style.height = `${h.clientHeight}px`;
  };
  const unfreeze = () => {
    const wv = view.current;
    if (!wv) return;
    wv.style.flex = "";
    wv.style.width = "";
    wv.style.height = "";
  };

  useEffect(() => {
    const wv = view.current;
    if (!wv) return;
    const onReady = () => {
      const first = !ready.current;
      ready.current = true;
      wcId.current = wv.getWebContentsId();
      window.o.elements.registerWeb(element.id, wcId.current);
      // Cada página nova volta ao zoom padrão do domínio: reaplica o do elemento.
      window.o.elements.setWebZoom(wcId.current, zoomRef.current);
      // O site nasce em branco: o depurador (F12 dos agentes) liga e só então o endereço carrega,
      // para o zn web console/network verem também o carregamento inicial.
      if (first && initialUrl) {
        const id = wcId.current;
        void window.o.elements
          .inspectReady(id)
          .catch(() => {}) // sem depurador o site carrega do mesmo jeito
          .then(() => wv.loadURL(initialUrl))
          .catch(() => {});
      }
    };
    const onNavigate = () => {
      const url = wv.getURL();
      if (url === "about:blank") return;
      setAddress(url);
      if (url !== element.url) actions.updateElement(element.id, { url });
    };
    // Ctrl + rodinha dentro do site (avisado pelo script do webview).
    const onMessage = (e: Event) => {
      const { channel, args } = e as Event & { channel: string; args: unknown[] };
      if (channel === "zenite:zoom") setZoomRef.current(zoomRef.current + (args[0] === "in" ? 0.1 : -0.1));
    };
    const onStart = () => setLoading(true);
    const onStop = () => setLoading(false);
    wv.addEventListener("dom-ready", onReady);
    wv.addEventListener("ipc-message", onMessage);
    wv.addEventListener("did-navigate", onNavigate);
    wv.addEventListener("did-navigate-in-page", onNavigate);
    wv.addEventListener("did-start-loading", onStart);
    wv.addEventListener("did-stop-loading", onStop);
    return () => {
      wv.removeEventListener("dom-ready", onReady);
      wv.removeEventListener("ipc-message", onMessage);
      wv.removeEventListener("did-navigate", onNavigate);
      wv.removeEventListener("did-navigate-in-page", onNavigate);
      wv.removeEventListener("did-start-loading", onStart);
      wv.removeEventListener("did-stop-loading", onStop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id]);

  const setZoom = (factor: number) => {
    const f = Math.min(3, Math.max(0.25, Math.round(factor * 100) / 100));
    actions.updateElement(element.id, { zoom: f });
    if (wcId.current !== null && ready.current) window.o.elements.setWebZoom(wcId.current, f);
  };
  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;

  // Um agente mudou o endereço com `zn web navigate` enquanto o site estava fechado/aberto.
  useEffect(() => {
    const wv = view.current;
    if (!element.url) return;
    if (!wv || !ready.current || element.url !== wv.getURL()) setAddress(element.url);
  }, [element.url]);

  /** Chama o <webview> só quando ele está pronto; antes disso, ignora. */
  const withView = (fn: (wv: WebviewElement) => void) => {
    const wv = view.current;
    if (wv && ready.current) fn(wv);
  };

  const go = (raw: string) => {
    const url = normalize(raw);
    setAddress(url);
    withView((wv) => void wv.loadURL(url).catch(() => {}));
  };

  const header = (
    <form
      className="web-bar nodrag"
      onSubmit={(e) => {
        e.preventDefault();
        go(address);
      }}
    >
      <button type="button" className="icon-button" title="Voltar" onClick={() => withView((wv) => wv.canGoBack() && wv.goBack())}>
        <ArrowLeft size={13} />
      </button>
      <button type="button" className={`icon-button${loading ? " spinning" : ""}`} title="Recarregar" onClick={() => withView((wv) => wv.reload())}>
        <RotateCw size={13} />
      </button>
      <input
        value={address}
        placeholder="Digite um endereço ou pesquisa"
        autoFocus={!element.url}
        onChange={(e) => setAddress(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <ZoomControl percent={zoom * 100} what="o zoom da página (Ctrl + rodinha)" onStep={(d) => setZoom(zoom + d * 0.1)} onReset={() => setZoom(1)} />
    </form>
  );

  return (
    <ElementShell element={element} actions={actions} selected={!!selected} header={header} minWidth={360} minHeight={240} onResizeStart={freeze} onResizeEnd={unfreeze}>
      <div ref={host} className="web-host nodrag nowheel nopan">
        {createElement("webview", {
          ref: view,
          src: "about:blank",
          partition: "persist:o-web",
          // window.open: o processo principal abre o pop-up numa janela filha (login do Google etc.).
          allowpopups: "true",
          preload: window.o.elements.webviewPreload,
          className: "webview",
          webpreferences: "contextIsolation=yes",
        })}
      </div>
    </ElementShell>
  );
}

export const WebNode = memo(WebNodeImpl);
