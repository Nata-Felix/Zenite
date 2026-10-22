import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { TerminalSpec } from "../../shared/types";
import { attach } from "../ptyBus";
import { joinCopiedUrl, wrappedUrlAt } from "../wrappedLinks";
import { focusHandled, onFocusRequest } from "../attentionBus";
import { onThemeChange } from "../theme";
import { canvasPrefs } from "../canvasPrefs";
import { colorsOf, fontFamilyOf, onTerminalPrefs, prefsForTerminal, terminalPrefs, type TerminalPrefs } from "../terminalPrefs";

interface Props {
  spec: TerminalSpec;
  reloadVersion?: number;
  onAliveChange?(alive: boolean): void;
  onLoadingChange?(loading: boolean): void;
}

export function TerminalView({ spec, reloadVersion = 0, onAliveChange, onLoadingChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appearanceRef = useRef(spec.appearance);
  appearanceRef.current = spec.appearance;
  const previousVersion = useRef(reloadVersion);
  const applyStyle = useRef(() => {});
  const callbacks = useRef({ onAliveChange, onLoadingChange });
  callbacks.current = { onAliveChange, onLoadingChange };

  useEffect(() => {
    const host = hostRef.current!;
    const restarting = previousVersion.current !== reloadVersion;
    previousVersion.current = reloadVersion;
    const prefs = prefsForTerminal(terminalPrefs(), appearanceRef.current);
    const term = new Terminal({
      fontFamily: fontFamilyOf(prefs),
      fontSize: prefs.fontSize,
      cursorBlink: prefs.cursorBlink,
      cursorStyle: prefs.cursorStyle,
      scrollback: prefs.scrollback,
      allowProposedApi: false,
      lineHeight: prefs.lineHeight,
      theme: colorsOf(prefs),
      // Links OSC 8 (o agy imprime o login assim): sem isto o xterm abre um confirm() próprio.
      linkHandler: {
        activate: (_e, text) => window.o.system.openUrl(text),
        hover: (_e, text, range) => {
          hoveredLink = text;
          underlineWrapped(range.start.y);
        },
        leave: () => {
          hoveredLink = null;
          clearUnderline();
        },
      },
    });
    // Tema de cores próprio (ex.: Dracula) pinta o fundo do terminal inteiro, não só o texto.
    // Tema do próprio CLI (lido da configuração dele), para "auto" não pôr um CLI escuro em fundo claro.
    let cliScheme: string | null = null;
    const paint = (p: TerminalPrefs) => {
      host.style.background = p.colors === "auto" && !cliScheme ? "" : (colorsOf(p, undefined, cliScheme).background ?? "");
    };
    paint(prefs);
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Links: clique abre no navegador; com o mouse em cima, o botão direito oferece "Copiar link".
    let hoveredLink: string | null = null;
    // O xterm sublinha um link OSC 8 só na linha do mouse. Para a URL quebrada em várias linhas
    // parecer um link só, cada linha dela ganha um sublinhado próprio enquanto o mouse está em cima.
    let underline: { dispose(): void }[] = [];
    function clearUnderline() {
      underline.forEach((d) => d.dispose());
      underline = [];
    }
    function underlineWrapped(y: number) {
      clearUnderline();
      const buf = term.buffer.active;
      const from = Math.max(0, y - 41);
      const to = Math.min(buf.length - 1, y + 39);
      const lines: string[] = [];
      for (let i = from; i <= to; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? "");
      const hit = wrappedUrlAt(lines, y - 1 - from);
      if (!hit) return;
      const cursor = buf.baseY + buf.cursorY;
      const color = term.options.theme?.foreground ?? "currentColor";
      for (let i = hit.first; i <= hit.last; i++) {
        const start = lines[i].length - lines[i].trimStart().length;
        const width = lines[i].trimEnd().length - start;
        if (width <= 0) continue;
        const marker = term.registerMarker(from + i - cursor);
        const deco = term.registerDecoration({ marker, x: start, width, layer: "top" });
        deco?.onRender((el) => {
          el.style.borderBottom = `1px solid ${color}`;
          el.style.boxSizing = "border-box";
          el.style.pointerEvents = "none";
        });
        underline.push(deco ?? marker, marker);
      }
    }
    // Antes do WebLinksAddon, para ter a vez: URL que o CLI quebrou em várias linhas abre inteira.
    const wrappedLinks = term.registerLinkProvider({
      provideLinks(y, callback) {
        const buf = term.buffer.active;
        const from = Math.max(0, y - 41);
        const to = Math.min(buf.length - 1, y + 39);
        const lines: string[] = [];
        for (let i = from; i <= to; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? "");
        const hit = wrappedUrlAt(lines, y - 1 - from);
        if (!hit) return callback(undefined);
        const head = lines[hit.first];
        const tail = lines[hit.last];
        const url = hit.url;
        // O link cobre todas as linhas da URL: o sublinhado do hover mostra o link inteiro.
        callback([
          {
            range: {
              start: { x: head.length - head.trimStart().length + 1, y: from + hit.first + 1 },
              end: { x: tail.trimEnd().length, y: from + hit.last + 1 },
            },
            text: url,
            activate: () => window.o.system.openUrl(url),
            hover: () => (hoveredLink = url),
            leave: () => (hoveredLink = null),
          },
        ]);
      },
    });
    term.loadAddon(
      new WebLinksAddon((_e, uri) => window.o.system.openUrl(uri), {
        hover: (_e, uri) => (hoveredLink = uri),
        leave: () => (hoveredLink = null),
      }),
    );
    term.open(host);
    loadWebgl(term);
    safeFit(fit);
    const offZoomFix = fixMouseForZoom(host);

    const copySelection = () => {
      const text = term.getSelection();
      if (!text) return false;
      void window.o.system.writeClipboard(joinCopiedUrl(text));
      term.clearSelection();
      return true;
    };
    const paste = async () => {
      const text = await window.o.system.readClipboard();
      if (text) term.paste(text);
    };
    // Como no Windows Terminal: Ctrl+C copia se há texto selecionado (sem seleção, interrompe o
    // processo, como sempre); Ctrl+Shift+C copia; Ctrl+V e Ctrl+Shift+V colam.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.ctrlKey || e.altKey || e.metaKey) return true;
      const key = e.key.toLowerCase();
      if (key === "c" && (e.shiftKey || term.hasSelection())) {
        e.preventDefault();
        copySelection();
        return false;
      }
      if (key === "v") {
        e.preventDefault();
        void paste();
        return false;
      }
      return true;
    });
    const onContextMenu = async (e: MouseEvent) => {
      e.preventDefault();
      const link = hoveredLink;
      const choice = await window.o.system.terminalMenu({ hasSelection: term.hasSelection(), link: !!link });
      if (choice === "copy") copySelection();
      else if (choice === "copyLink" && link) void window.o.system.writeClipboard(link);
      else if (choice === "paste") void paste();
      else if (choice === "selectAll") term.selectAll();
      else if (choice === "clear") term.clear();
      term.focus();
    };
    host.addEventListener("contextmenu", onContextMenu);

    let disposed = false;
    // Até o PTY responder, a saída fica guardada. Se a sessão já existia, o
    // histórico devolvido pelo processo principal já contém essa saída.
    let early: string[] | null = [];
    const detach = attach(
      spec.id,
      (data) => (early ? early.push(data) : term.write(data)),
      (code) => {
        callbacks.current.onAliveChange?.(false);
        term.write(`\r\n\x1b[90m[processo encerrado com código ${code}]\x1b[0m\r\n`);
      },
    );

    callbacks.current.onLoadingChange?.(true);
    const open = restarting ? window.o.pty.restart : window.o.pty.create;
    open({ id: spec.id, command: spec.command, cwd: spec.cwd, account: spec.account, provider: spec.provider, sun: spec.sun, cols: term.cols, rows: term.rows })
      .then((res) => {
        if (disposed) return;
        const buffered = early ?? [];
        early = null;
        callbacks.current.onAliveChange?.(res.ok);
        if (!res.ok) term.write(`\x1b[31m${res.error ?? "Falha ao abrir o terminal."}\x1b[0m\r\n`);
        else if (res.reused) term.write(res.backlog ?? "");
        else buffered.forEach((d) => term.write(d));
      })
      .catch((error: unknown) => {
        if (disposed) return;
        early = null;
        callbacks.current.onAliveChange?.(false);
        term.write(`\r\n\x1b[31mFalha ao abrir o terminal: ${String(error)}\x1b[0m\r\n`);
      })
      .finally(() => {
        if (!disposed) callbacks.current.onLoadingChange?.(false);
      });

    // Relê o tema do CLI ao abrir, ao focar e logo depois de um Enter (ex.: depois de /theme).
    let themeTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshCliTheme = () =>
      void window.o.pty.cliTheme(spec.command, spec.account, spec.provider).then((next) => {
        if (disposed || next === cliScheme) return;
        cliScheme = next;
        applyStyle.current();
      }, () => undefined);
    refreshCliTheme();
    const input = term.onData((data) => {
      window.o.pty.write(spec.id, data);
      if (data.includes("\r")) {
        clearTimeout(themeTimer);
        themeTimer = setTimeout(refreshCliTheme, 1500);
      }
    });
    // O desenho acompanha o arraste a cada quadro; o processo só recebe o tamanho quando o arraste
    // para. Cada aviso faz o agente redesenhar a tela inteira, e dezenas deles travavam o terminal.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const resized = term.onResize(({ cols, rows }) => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => window.o.pty.resize(spec.id, cols, rows), 120);
    });

    const updateStyle = () => {
      const p = prefsForTerminal(terminalPrefs(), appearanceRef.current);
      term.options.fontFamily = fontFamilyOf(p);
      term.options.fontSize = p.fontSize;
      term.options.lineHeight = p.lineHeight;
      term.options.cursorStyle = p.cursorStyle;
      term.options.cursorBlink = p.cursorBlink;
      term.options.scrollback = p.scrollback;
      term.options.theme = colorsOf(p, undefined, cliScheme);
      paint(p);
      safeFit(fit);
    };
    applyStyle.current = updateStyle;
    const offTheme = onThemeChange(updateStyle);
    const offPrefs = onTerminalPrefs(updateStyle);

    // O app sabe qual terminal você está olhando: olhar para ele dispensa o aviso.
    const onFocus = () => {
      window.o.attention.focus(spec.id);
      refreshCliTheme();
    };
    // "Focar ao passar o mouse" (Configurações → Canvas).
    const onEnter = () => canvasPrefs().focusOnHover && term.focus();
    host.addEventListener("mouseenter", onEnter);
    const onBlur = () => window.o.attention.focus(null);
    term.textarea?.addEventListener("focus", onFocus);
    term.textarea?.addEventListener("blur", onBlur);
    const focusReq = onFocusRequest((id) => {
      if (id !== spec.id) return;
      focusHandled(id);
      term.focus();
    });
    if (focusReq.pending === spec.id) {
      focusHandled(spec.id);
      setTimeout(() => term.focus(), 80);
    }

    // Ao redimensionar o elemento chegam dezenas de eventos por segundo: um ajuste por quadro basta.
    let fitFrame = 0;
    const observer = new ResizeObserver(() => {
      if (fitFrame) return;
      fitFrame = requestAnimationFrame(() => {
        fitFrame = 0;
        safeFit(fit);
      });
    });
    observer.observe(host);

    return () => {
      disposed = true;
      applyStyle.current = () => {};
      offTheme();
      offPrefs();
      focusReq.off();
      term.textarea?.removeEventListener("focus", onFocus);
      term.textarea?.removeEventListener("blur", onBlur);
      host.removeEventListener("mouseenter", onEnter);
      host.removeEventListener("contextmenu", onContextMenu);
      offZoomFix();
      clearTimeout(themeTimer);
      wrappedLinks.dispose();
      clearTimeout(resizeTimer);
      observer.disconnect();
      cancelAnimationFrame(fitFrame);
      input.dispose();
      resized.dispose();
      detach();
      term.dispose();
    };
    // O terminal vive enquanto o nó existir; mudar título não deve recriá-lo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, reloadVersion]);

  useEffect(() => applyStyle.current(), [spec.appearance]);

  // nodrag/nowheel/nopan: o mouse dentro do terminal é do terminal, não do canvas.
  return <div ref={hostRef} className="terminal-host nodrag nowheel nopan" />;
}

/**
 * Desenha o terminal pela GPU (WebGL) em vez de milhares de elementos na página: com saída
 * contínua (agentes trabalhando) é bem mais leve. Sem WebGL, ou se o navegador tirar o contexto
 * (há um limite de contextos por página), volta para o desenho normal.
 */
function loadWebgl(term: Terminal): void {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    // Sem WebGL nesta máquina: fica o desenho padrão.
  }
}

const FIXED = Symbol("zoom-fixed");
const MOUSE_EVENTS = ["mousedown", "mousemove", "mouseup", "click", "dblclick"] as const;

/**
 * O canvas aplica o zoom com CSS (scale) e o xterm calcula a célula do mouse sem considerar a escala:
 * fora de 100% a seleção e os cliques caíam linhas acima ou abaixo do ponteiro. Aqui o evento é
 * trocado por uma cópia com as coordenadas corrigidas antes de o xterm vê-lo. Durante um arraste que
 * começou no terminal, os movimentos fora dele também são corrigidos (a seleção continua certa).
 */
function fixMouseForZoom(host: HTMLElement): () => void {
  let dragging = false;
  const handler = (e: MouseEvent) => {
    if ((e as MouseEvent & { [FIXED]?: true })[FIXED]) return;
    const inside = host.contains(e.target as Node);
    if (e.type === "mousedown") dragging = inside;
    const active = inside || dragging;
    if (e.type === "mouseup") dragging = false;
    if (!active || !host.offsetWidth) return;
    const zoom = host.getBoundingClientRect().width / host.offsetWidth;
    if (Math.abs(zoom - 1) < 0.01) return;
    const origin = (host.querySelector(".xterm-screen") ?? host).getBoundingClientRect();
    e.stopImmediatePropagation();
    const fixed = new MouseEvent(e.type, {
      bubbles: e.bubbles,
      cancelable: e.cancelable,
      composed: true,
      view: window,
      detail: e.detail,
      screenX: e.screenX,
      screenY: e.screenY,
      clientX: origin.left + (e.clientX - origin.left) / zoom,
      clientY: origin.top + (e.clientY - origin.top) / zoom,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      button: e.button,
      buttons: e.buttons,
      relatedTarget: e.relatedTarget,
    });
    (fixed as MouseEvent & { [FIXED]?: true })[FIXED] = true;
    // O xterm cancela o padrão do mousedown (senão o foco vai para o card do canvas): repassa ao original.
    if (!(e.target ?? host).dispatchEvent(fixed)) e.preventDefault();
  };
  for (const t of MOUSE_EVENTS) window.addEventListener(t, handler, true);
  return () => {
    for (const t of MOUSE_EVENTS) window.removeEventListener(t, handler, true);
  };
}

function safeFit(fit: FitAddon): void {
  try {
    fit.fit();
  } catch {
    // Acontece quando o elemento ainda não tem tamanho; o próximo resize corrige.
  }
}
