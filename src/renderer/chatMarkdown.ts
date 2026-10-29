import { marked } from "marked";
import { renderMarkdown } from "./markdown";

/**
 * Markdown das respostas no chat: o mesmo renderMarkdown (DOMPurify) das notas, com o que os
 * agentes usam e o marked não faz sozinho:
 *  - notas de rodapé [^1] e a lista "[^1]: texto" no fim;
 *  - fórmulas $…$ e $$…$$ marcadas para o KaTeX desenhar depois (enhanceChat);
 *  - imagem externa vira link (o app não carrega imagem da internet dentro do chat).
 * Código (``` e `…`) fica intocado: lá dentro $ e [^1] são texto.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Aplica fn só fora de blocos de código e de código inline. */
function outsideCode(text: string, fn: (s: string) => string): string {
  return text
    .split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/)
    .map((block, i) => (i % 2 ? block : block.split(/(`+[^`\n]*`+)/).map((s, j) => (j % 2 ? s : fn(s))).join("")))
    .join("");
}

// $…$ inline: sem espaço logo depois do $ de abertura nem antes do de fechamento ("R$ 10 e R$ 20" não é fórmula).
const INLINE_MATH = /(^|[^\w$\\])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?![\w$])/g;
const BLOCK_MATH = /\$\$([\s\S]+?)\$\$/g;

export function renderChatMarkdown(text: string): string {
  const notes: { id: string; text: string }[] = [];
  let body = outsideCode(text, (s) => s
    // Definições "[^id]: texto" saem do corpo e vão para a lista do fim.
    .replace(/^\[\^([^\]\s]+)\]:[ \t]*(.+)$/gm, (_m, id: string, note: string) => { notes.push({ id, text: note }); return ""; })
    .replace(BLOCK_MATH, (_m, tex: string) => `\n<div class="chat-math block" data-tex="${esc(tex.trim())}">${esc(tex.trim())}</div>\n`)
    .replace(INLINE_MATH, (_m, before: string, tex: string) => `${before}<span class="chat-math" data-tex="${esc(tex)}">${esc(tex)}</span>`));
  const order = (id: string) => notes.findIndex((n) => n.id === id) + 1;
  if (notes.length) body = outsideCode(body, (s) => s.replace(/\[\^([^\]\s]+)\]/g, (m, id: string) => (order(id) ? `<sup class="chat-fn">${order(id)}</sup>` : m)));
  const foot = notes.length
    ? `<ol class="chat-footnotes">${notes.map((n) => `<li>${marked.parseInline(n.text, { async: false }) as string}</li>`).join("")}</ol>`
    : "";
  return renderMarkdown(`${body}${foot ? `\n\n${foot}` : ""}`)
    // Imagem da internet: link com o texto alternativo e o site (não carrega nada sozinho).
    .replace(/<img\b[^>]*>/g, (tag) => {
      const src = tag.match(/\ssrc="([^"]*)"/)?.[1] ?? "";
      const alt = tag.match(/\salt="([^"]*)"/)?.[1] || "imagem";
      const host = (() => { try { return new URL(src).host; } catch { return ""; } })();
      return /^https:\/\//i.test(src) ? `<a href="${src}" class="chat-image-link">Ver imagem: ${alt}${host ? ` (${host})` : ""}</a>` : `<span class="chat-image-link">Imagem: ${alt}</span>`;
    });
}

// ---------- Depois de desenhar: realce, fórmulas, diagramas e caminhos ----------

// Caminho absoluto do Windows com linha opcional: C:\pasta\arquivo.ts:42
const WIN_PATH = /\b[A-Za-z]:\\(?:[^\s\\/:*?"<>|]+\\)*[^\s\\/:*?"<>|]+\.[A-Za-z0-9]{1,8}(?::\d+(?::\d+)?)?/g;
const HAS_PATH = new RegExp(WIN_PATH.source);

let mermaidCount = 0;

/** Melhora o HTML já na tela. As bibliotecas pesadas só carregam se a resposta precisar delas. */
export async function enhanceChat(root: HTMLElement): Promise<void> {
  const codes = [...root.querySelectorAll<HTMLElement>("pre > code")];
  const diagrams = codes.filter((c) => c.classList.contains("language-mermaid"));
  const plain = codes.filter((c) => !diagrams.includes(c) && !c.dataset.highlighted);
  const math = [...root.querySelectorAll<HTMLElement>(".chat-math:not([data-done])")];
  linkPaths(root);

  if (plain.length) {
    const { default: hljs } = await import("highlight.js/lib/common");
    for (const code of plain) {
      const lang = code.className.match(/language-([\w+#-]+)/)?.[1];
      if (lang && !hljs.getLanguage(lang)) { code.dataset.highlighted = "no"; continue; }
      try { hljs.highlightElement(code); } catch { code.dataset.highlighted = "no"; }
    }
  }
  if (math.length) {
    const [{ default: katex }] = await Promise.all([import("katex"), import("katex/dist/katex.min.css")]);
    for (const el of math) {
      el.dataset.done = "1";
      try { katex.render(el.dataset.tex ?? "", el, { throwOnError: false, displayMode: el.classList.contains("block"), output: "html" }); } catch { /* fica o texto */ }
    }
  }
  if (diagrams.length) {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark", fontFamily: "inherit" });
    for (const code of diagrams) {
      const pre = code.parentElement!;
      if (pre.dataset.diagram) continue;
      pre.dataset.diagram = "1";
      try {
        const { svg } = await mermaid.render(`chat-mermaid-${++mermaidCount}`, code.textContent ?? "");
        const box = document.createElement("div");
        box.className = "chat-diagram";
        box.innerHTML = svg; // o mermaid em modo strict já limpa o SVG
        pre.hidden = true;
        pre.after(box);
      } catch {
        pre.dataset.diagram = "erro"; // diagrama inválido: fica o código
      }
    }
  }
}

/** Caminhos de arquivo no texto (fora de links e blocos de código) viram links que abrem o arquivo. */
function linkPaths(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("a, pre, .chat-path, .chat-block-bar") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) if (HAS_PATH.test((walker.currentNode as Text).data)) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of node.data.matchAll(WIN_PATH)) {
      frag.append(node.data.slice(last, m.index));
      const a = document.createElement("a");
      a.className = "chat-path";
      a.dataset.path = m[0].replace(/(?::\d+){1,2}$/, "");
      a.title = `Abrir ${a.dataset.path}`;
      a.textContent = m[0];
      frag.append(a);
      last = m.index! + m[0].length;
    }
    frag.append(node.data.slice(last));
    // `C:\…` dentro de código inline: o link fica dentro do <code>.
    node.replaceWith(frag);
  }
}
