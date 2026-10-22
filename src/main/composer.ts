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
