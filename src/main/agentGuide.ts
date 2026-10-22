import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const START = "<!-- Zenite:inicio (gerado pelo Zênite; apague este bloco para remover) -->";
const END = "<!-- Zenite:fim -->";
/** Bloco das versões antigas (quando o app se chamava O): é trocado pelo novo. */
const OLD_START = "<!-- O:inicio (gerado pelo app O; apague este bloco para remover) -->";
const OLD_END = "<!-- O:fim -->";

/**
 * Regras de trabalho com git que valem para todo agente (Claude Code e Codex).
 * Vai no CLAUDE.md / AGENTS.md global, por isso é escrita para funcionar também fora do Zênite.
 */
export const GIT_GUIDE = `## Dentro do Zênite: canvas primeiro

Quando a variável \`O_TERMINAL_ID\` existir, comece por \`zn list\` para identificar os elementos ligados ao seu terminal e consulte \`zn help\`. Use os comandos do canvas para ler notas, tabelas, arquivos, pastas e sites. O diretório de trabalho não é uma autorização para procurar elementos pelo disco. Pedidos genéricos de análise começam pelo canvas; se faltar conexão ou escopo, peça ao usuário para ligar ou indicar o material. Não leia arquivos internos do Zênite para contornar suas APIs. A função de Sol não amplia as permissões globais.
Fora do Zênite, esta orientação de canvas não se aplica.

## Git como memória do projeto

O histórico do git é a memória compartilhada entre sessões e entre agentes. Use-o em vez de reler o projeto inteiro.

**Ao começar uma tarefa**
- Dentro do Zênite (variável \`O_TERMINAL_ID\` existe): rode \`zn history\` — últimos commits de todos os universos e o que está sem commit.
- Fora do Zênite: \`git log --oneline -15\`.

**Para descobrir algo, busque no git antes de ler arquivos inteiros**
| Quero achar | Comando |
|---|---|
| commits que falam de um assunto | \`git log --oneline -i --grep="frete"\` |
| commits que mexeram num arquivo/pasta | \`git log --oneline -- src/frete.ts\` |
| quando um trecho de código entrou ou saiu | \`git log --oneline -S "calcularFrete"\` |
| história de uma função | \`git log -L :calcularFrete:src/frete.ts\` |
| quem/quando mudou umas linhas | \`git blame -L 40,60 src/frete.ts\` |
| o que um commit fez | \`git show <id> --stat\` (só arquivos) ou \`git show <id>\` |
| em todos os universos/branches | acrescente \`--all\` |

**Ao terminar cada parte do trabalho, commite — pequeno e com o porquê**
- No Zênite: \`zn commit "Título curto do que mudou" --why "por que mudou" [--todo "o que ficou pendente"]\`.
  O Zênite monta a mensagem padrão, registra qual agente fez e recusa commitar .env.
- Fora do Zênite: \`git commit -m "Título" -m "Por quê: ..." -m "Pendente: ..."\`.
- Nunca commite segredos (.env, chaves). Nunca escreva "ajustes" ou "fix" sem dizer o quê e por quê.
`;

/** Posição [início, fim) do bloco marcado, ou null. */
function findBlock(text: string, start: string, end: string): [number, number] | null {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a);
  return a >= 0 && b > a ? [a, b + end.length] : null;
}

/**
 * Coloca (ou atualiza) o bloco do Zênite no arquivo de instruções, sem tocar no resto.
 * Um bloco antigo (do tempo em que o app se chamava O) é trocado no mesmo lugar.
 * `create`: cria o arquivo se ele não existir (desde que a pasta exista).
 */
export function installGuide(file: string, create = true, extra = ""): "instalado" | "atualizado" | "ignorado" {
  if (!existsSync(dirname(file))) return "ignorado";
  const exists = existsSync(file);
  if (!exists && !create) return "ignorado";
  const current = exists ? readFileSync(file, "utf8") : "";
  const block = `${START}\n${GIT_GUIDE}${extra ? `\n${extra.trim()}\n` : ""}${END}\n`;
  const at = findBlock(current, START, END) ?? findBlock(current, OLD_START, OLD_END);
  let next: string;
  if (at) next = current.slice(0, at[0]) + block + current.slice(at[1]).replace(/^\n/, "");
  else next = current ? `${current.replace(/\s*$/, "")}\n\n${block}` : block;
  // Se sobrou um bloco antigo além do novo, ele sai.
  const old = findBlock(next, OLD_START, OLD_END);
  if (old) next = next.slice(0, old[0]).replace(/\s*$/, "\n") + next.slice(old[1]).replace(/^\s*/, "");
  if (next === current) return "atualizado";
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, next, "utf8");
  return exists ? "atualizado" : "instalado";
}

/** Remove o bloco do Zênite (e o antigo, do O) do arquivo, se existir. */
export function uninstallGuide(file: string): void {
  if (!existsSync(file)) return;
  let next = readFileSync(file, "utf8");
  const before = next;
  for (const [start, end] of [
    [START, END],
    [OLD_START, OLD_END],
  ]) {
    const at = findBlock(next, start, end);
    if (at) next = (next.slice(0, at[0]).replace(/\s*$/, "") + "\n" + next.slice(at[1]).replace(/^\s*/, "")).replace(/^\n$/, "");
  }
  if (next === before) return;
  writeFileSync(file, next.trim() ? next : "", "utf8");
}
