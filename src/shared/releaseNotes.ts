// Notas da versão mostradas na janela "O Zênite X está disponível". Chegam em Markdown (do
// build/release-notes.md, via latest.yml) ou em HTML (feed do GitHub Releases). As duas formas
// viram blocos simples, desenhados sem innerHTML.

export type Inline = { kind: "text" | "bold" | "italic" | "code"; text: string };
export type NoteBlock =
  | { kind: "heading"; level: number; content: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "paragraph"; content: Inline[] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/** HTML do GitHub para o mesmo Markdown simples que o release-notes.md usa. */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/\r/g, "")
    .replace(/<h([1-6])[^>]*>/gi, (_m, n: string) => `\n${"#".repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/?(strong|b)>/gi, "**")
    .replace(/<\/?(em|i)>/gi, "*")
    .replace(/<\/?code>/gi, "`")
    .replace(/<\/(p|li|h\d|ul|ol|div)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, e: string) => ENTITIES[e])
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Dentro de uma linha: **negrito** (ou __negrito__), *itálico* (ou _itálico_) e `código`.
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[1] ?? m[2]) out.push({ kind: "bold", text: (m[1] ?? m[2])! });
    else if (m[3]) out.push({ kind: "code", text: m[3] });
    else out.push({ kind: "italic", text: (m[4] ?? m[5])! });
    last = re.lastIndex;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
}

/** Títulos (#), listas (-, *, •, 1.) e parágrafos. Linhas seguidas viram um parágrafo só. */
export function parseNotes(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", content: parseInline(para.join(" ")) });
    para = [];
    if (list) blocks.push({ kind: "list", items: list });
    list = null;
  };
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const item = line.match(/^(?:[-*•+]|\d+[.)])\s+(.*)$/);
    if (!line) {
      // Linha em branco fecha o parágrafo; a lista continua se o próximo for outro item.
      if (para.length) blocks.push({ kind: "paragraph", content: parseInline(para.join(" ")) });
      para = [];
    } else if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length, content: parseInline(heading[2].replace(/\s*#+$/, "")) });
    } else if (item) {
      if (para.length) {
        blocks.push({ kind: "paragraph", content: parseInline(para.join(" ")) });
        para = [];
      }
      (list ??= []).push(parseInline(item[1]));
    } else if (list && /^\s{2,}/.test(raw)) {
      // Continuação do item anterior (linha recuada).
      const last = list[list.length - 1];
      last.push({ kind: "text", text: " " }, ...parseInline(line));
    } else {
      if (list) {
        blocks.push({ kind: "list", items: list });
        list = null;
      }
      para.push(line);
    }
  }
  flush();
  return blocks;
}
