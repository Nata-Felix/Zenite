import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { AgentKind } from "./agentControl";

/**
 * Caixa de mensagem (Ctrl+K): texto e anexos entram direto no CLI escolhido, sem passar
 * pelo canvas. Cada CLI recebe anexo de um jeito:
 * - Codex e Claude Code transformam o caminho de uma imagem colado sozinho em anexo
 *   ([Image #1]); outros arquivos vão citados no texto.
 * - Antigravity (Gemini) lê qualquer arquivo citado com @caminho.
 * - Shell e outros recebem os caminhos entre aspas no texto.
 */
export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
export const MAX_ATTACHMENT = 50 * 1024 * 1024;

export type ComposerStep = { paste: string } | { submit: true };

const isImage = (file: string) => IMAGE_EXTENSIONS.has(extname(file).toLowerCase());

/** Os passos de colagem para um CLI: cada imagem sozinha (quando o CLI anexa assim) e depois o texto. */
export function composeSteps(agent: AgentKind, text: string, files: string[]): ComposerStep[] {
  const steps: ComposerStep[] = [];
  const message = text.trim();
  if (agent === "codex" || agent === "claude") {
    const images = files.filter(isImage);
    const others = files.filter((f) => !isImage(f));
    for (const image of images) steps.push({ paste: image });
    const cited = others.length ? `${others.map((f) => `"${f}"`).join(" ")}\n` : "";
    if (cited || message) steps.push({ paste: `${cited}${message}` });
  } else if (agent === "antigravity") {
    const cited = files.map((f) => `@${f}`).join(" ");
    steps.push({ paste: [cited, message].filter(Boolean).join(" ") });
  } else {
    const cited = files.map((f) => `"${f}"`).join(" ");
    steps.push({ paste: [cited, message].filter(Boolean).join(" ") });
  }
  steps.push({ submit: true });
  return steps;
}

/**
 * Copia o anexo para a pasta de anexos do Zênite com um nome sem espaços nem acentos: os
 * CLIs reconhecem o caminho sem precisar de aspas, e o original pode mudar ou sumir depois.
 */
export function stashAttachment(dir: string, file: string, now = Date.now()): string {
  const size = statSync(file).size;
  if (size > MAX_ATTACHMENT) throw new Error(`${basename(file)} passa de 50 MB.`);
  mkdirSync(dir, { recursive: true });
  const safe = basename(file).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-80);
  const target = join(dir, `${now}-${safe}`);
  copyFileSync(file, target);
  return target;
}

/**
 * A tela pede uma decisão (termos, confiar na pasta, permissões, menu aberto)? Nesse caso a
 * mensagem não é enviada: o Enter do envio confirmaria a opção marcada sem a pessoa ver.
 */
export function waitingForChoice(screen: string, hasMenu: boolean): boolean {
  return hasMenu || /Terms of Service|Trust this folder|Do you trust|Press enter to confirm|Enable full access\?|\[Done\]|\[Previous\]|enter (to )?select/i.test(screen);
}

/** Linhas que são moldura do CLI, não resposta: rodapés, dicas, réguas, status, caixa de digitação. */
const CHROME = /(\? for shortcuts|esc to (cancel|interrupt)|ctrl\+[a-z]|for agents|Ask Codex to do anything|Worked for \d|context left|tokens used|bypass permissions|accept edits|shift\+tab|^\s*[─━═╭╮╰╯]{3,}|^\s*[│┃]\s*[›>❯]?\s*[│┃]?\s*$)/i;
// Linha de status: itens separados por " · " com caminho ou nível de esforço (modelo · pasta · …).
const STATUS = /^(?=.*\s·\s)(?=.*(\b[A-Z]:[\\/]|~[\\/]|\b(low|medium|high|xhigh)\b))/i;
const USER_LINE = /^\s*[│┃]?\s*[›>❯]\s+\S/;

/**
 * A última resposta do agente na tela: o que vem depois da última mensagem da pessoa
 * (linha que começa com › > ❯) até antes da caixa de digitação e do rodapé.
 */
export function lastReply(screen: string): string {
  const lines = screen.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  let end = lines.length;
  // De baixo para cima: rodapé, status, caixa de digitação vazia e linhas em branco.
  while (end > 0) {
    const l = lines[end - 1];
    if (!l.trim() || CHROME.test(l) || STATUS.test(l) || /^\s*[│┃]?\s*[›>❯]\s*([│┃]\s*)?$/.test(l) || /^\s*[›>❯]\s+(Ask|Type|Write)\b/i.test(l)) end--;
    else break;
  }
  let start = end;
  while (start > 0 && !USER_LINE.test(lines[start - 1])) start--;
  // Os marcadores de bloco dos CLIs (• ● ⏺) valem como recuo; depois tira o recuo comum.
  const body = lines.slice(start, end).filter((l) => !CHROME.test(l)).map((l) => l.replace(/^(\s*)[•●⏺]\s/, "$1  "));
  const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
  return body.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join("\n").trim();
}

/** Opções numeradas no fim da resposta ("1. …", "2) …"), quando o agente pergunta algo. */
export function replyOptions(reply: string): { key: string; label: string }[] {
  const lines = reply.split("\n");
  const found: { key: string; label: string }[] = [];
  for (let i = lines.length - 1; i >= 0 && found.length < 12; i--) {
    const m = lines[i].match(/^\s*(?:[-*]\s*)?(\d{1,2}|[a-e])[.)]\s+(.+)$/i);
    if (m) found.unshift({ key: m[1], label: m[2].replace(/\*\*/g, "").trim() });
    else if (found.length && lines[i].trim() && !/^\s{2,}\S/.test(lines[i])) break; // fim do bloco de opções
  }
  return found.length >= 2 && /\?/.test(reply) ? found : [];
}
