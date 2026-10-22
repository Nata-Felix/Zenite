import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** O pedaço do WebContents do Electron que usamos (facilita testar sem Electron). */
export interface WebTarget {
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  sendInputEvent(event: Record<string, unknown>): void;
  insertText(text: string): Promise<void>;
  capturePage(): Promise<{ toPNG(): Buffer }>;
  loadURL(url: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  canGoBack?(): boolean;
  goBack?(): void;
  reload(): void;
  isDestroyed(): boolean;
}

export class WebError extends Error {}

/**
 * Marca os elementos interativos da página com refs (@e1, @e2...) e devolve texto e lista.
 * Roda dentro da página.
 */
const SNAPSHOT_JS = `(() => {
  document.querySelectorAll('[data-o-ref]').forEach(e => e.removeAttribute('data-o-ref'));
  const sel = 'a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=textbox],[role=checkbox],[role=tab],[role=menuitem],[contenteditable=""],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"])';
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const label = el => (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.innerText || el.value || el.getAttribute('name') || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
  const lines = []; let n = 0;
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el) || n >= 300) continue;
    const ref = 'e' + (++n);
    el.setAttribute('data-o-ref', ref);
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? '[' + (el.type || 'text') + ']' : '';
    const role = el.getAttribute('role') ? '(' + el.getAttribute('role') + ')' : '';
    const val = (tag === 'input' || tag === 'textarea') && el.value ? ' = "' + String(el.value).slice(0, 60) + '"' : '';
    lines.push('@' + ref + ' ' + tag + type + role + ' "' + label(el) + '"' + val);
  }
  const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 12000);
  return { url: location.href, title: document.title, text, elements: lines };
})()`;

/** Acha o elemento por ref (@e3), seletor CSS ou coordenadas "x,y" e devolve o centro na tela. */
function locateJs(target: string): string {
  return `(() => {
    const t = ${JSON.stringify(target)};
    const m = /^\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*$/.exec(t);
    if (m) return { x: +m[1], y: +m[2] };
    const el = t.startsWith('@') ? document.querySelector('[data-o-ref="' + t.slice(1) + '"]') : document.querySelector(t);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`;
}

function focusJs(target: string, selectAll: boolean): string {
  return `(() => {
    const t = ${JSON.stringify(target)};
    const el = t.startsWith('@') ? document.querySelector('[data-o-ref="' + t.slice(1) + '"]') : document.querySelector(t);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    if (${selectAll}) {
      if (typeof el.select === 'function') el.select();
      else { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
    return true;
  })()`;
}

const KEY_ALIASES: Record<string, string> = {
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  esc: "Escape",
  escape: "Escape",
  backspace: "Backspace",
  delete: "Delete",
  space: "Space",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
};

const MODIFIERS: Record<string, string> = { ctrl: "control", control: "control", shift: "shift", alt: "alt", cmd: "meta", meta: "meta" };

export class WebDriver {
  constructor(private target: WebTarget) {
    if (target.isDestroyed()) throw new WebError("O site foi fechado.");
  }

  async snapshot(): Promise<{ url: string; title: string; text: string; elements: string[] }> {
    return (await this.target.executeJavaScript(SNAPSHOT_JS)) as { url: string; title: string; text: string; elements: string[] };
  }

  info(): { url: string; title: string } {
    return { url: this.target.getURL(), title: this.target.getTitle() };
  }

  async navigate(raw: string): Promise<{ url: string; title: string }> {
    const url = normalizeUrl(raw);
    try {
      await this.target.loadURL(url);
    } catch (err) {
      // loadURL rejeita em redirecionamentos abortados; a página pode ter carregado mesmo assim.
      if (!this.target.getURL()) throw new WebError(`Não consegui abrir ${url}: ${(err as Error).message}`);
    }
    return this.info();
  }

  async click(target: string): Promise<void> {
    const point = (await this.target.executeJavaScript(locateJs(target))) as { x: number; y: number } | null;
    if (!point) throw new WebError(`Elemento ${target} não encontrado. Rode o snapshot de novo para refs atualizadas.`);
    await new Promise((r) => setTimeout(r, 60));
    const base = { x: point.x, y: point.y, button: "left", clickCount: 1 };
    this.target.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
    this.target.sendInputEvent({ type: "mouseDown", ...base });
    this.target.sendInputEvent({ type: "mouseUp", ...base });
  }

  /** Digita no elemento (ou no que estiver focado). `replace` apaga o conteúdo antes. */
  async type(text: string, target?: string, replace = false): Promise<void> {
    if (target) {
      const ok = await this.target.executeJavaScript(focusJs(target, replace));
      if (!ok) throw new WebError(`Elemento ${target} não encontrado. Rode o snapshot de novo para refs atualizadas.`);
    }
    await this.target.insertText(text);
  }

  /** Pressiona uma tecla, com modificadores opcionais: "Enter", "ctrl+a", "shift+Tab". */
  key(combo: string): void {
    const parts = combo.split("+").map((p) => p.trim()).filter(Boolean);
    const keyName = parts.pop() ?? "";
    const modifiers = parts.map((m) => MODIFIERS[m.toLowerCase()]).filter(Boolean);
    const keyCode = KEY_ALIASES[keyName.toLowerCase()] ?? keyName;
    this.target.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") this.target.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    else if (keyCode.length === 1 && modifiers.length === 0) this.target.sendInputEvent({ type: "char", keyCode, modifiers });
    this.target.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  }

  async evaluate(code: string): Promise<string> {
    const result = await this.target.executeJavaScript(code, true);
    return typeof result === "string" ? result : JSON.stringify(result, null, 2) ?? "undefined";
  }

  /** Salva um print da página e devolve o caminho do PNG. */
  async screenshot(name: string): Promise<string> {
    const image = await this.target.capturePage();
    const dir = join(tmpdir(), "o-screenshots");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name.replace(/[^\w\-]/g, "_")}-${Date.now()}.png`);
    writeFileSync(file, image.toPNG());
    return file;
  }

  back(): void {
    if (this.target.canGoBack?.()) this.target.goBack?.();
  }

  reload(): void {
    this.target.reload();
  }
}

export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) throw new WebError("Informe um endereço.");
  // localhost:3000 parece um esquema ("localhost:"), por isso vem antes.
  if (/^localhost(:\d+)?(\/|$)/i.test(url) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(url)) return `http://${url}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return `https://${url}`;
}
