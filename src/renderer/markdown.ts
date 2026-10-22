import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Markdown -> HTML seguro. O texto pode ter vindo de um agente ou de um arquivo: sem a
 * limpeza do DOMPurify, um <img onerror> ou <script> rodaria dentro do app, que tem
 * acesso aos terminais.
 */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "button", "iframe", "select", "textarea"], FORBID_ATTR: ["style"] });
  // Só sobra <input> das listas de tarefas ("- [x]"), e sempre desativado.
  return clean.replace(/<input(?![^>]*type="checkbox")[^>]*>/g, "").replace(/<input /g, '<input disabled ');
}

/** Links abrem no navegador padrão, nunca dentro do app. */
export function openLinkFromMarkdown(e: React.MouseEvent): void {
  const a = (e.target as HTMLElement).closest("a");
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href") ?? "";
  if (/^https:\/\//i.test(href)) window.o.system.openUrl(href);
}
