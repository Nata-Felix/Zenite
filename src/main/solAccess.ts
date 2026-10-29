import type { AgentTerm } from "./agentControl";
import type { AgentPermissions } from "../shared/types";
import { ESC, parseMenu, parseStatusFields, pick, runSlash, settle, whenIdle } from "./agentControl";

export const SOL_ACCESS_MESSAGE = "acesso total para trabalhar, prioridade obrigatória ao canvas e controle externo somente quando solicitado";

export const SOL_CANVAS_MESSAGE = `[Zênite · orientação do Sol]
Você foi promovido a Sol pela interface do Zênite. Antes de analisar ou executar a próxima tarefa, execute zn list e consulte zn help para usar os elementos do canvas.
Seu papel é orquestrar, não executar. A cada pedido: 1) entenda o objetivo no nível macro; 2) divida em tarefas, cada uma com escopo, critério de pronto e o que deve devolver; 3) escolha quem faz cada uma: um terminal livre do agente certo, ou um recrutado quando nenhum serve; 4) acompanhe as respostas (zn ask --no-wait, zn reply) e, ao final, valide o resultado contra o critério de pronto antes de responder ao usuário.
Não implemente, não edite arquivos do projeto nem faça a pesquisa você mesmo, mesmo quando parecer mais rápido: leia só o necessário para dividir e para validar. Validar é com você (ler o que voltou, conferir o diff, rodar a checagem final); o resto vai para os planetas. Se não houver agente que sirva, pergunte ao usuário antes de fazer a tarefa você mesmo.
Quando uma parte é mecânica ou se repete, monte um astro (zn flow create) que reaproveite scripts e ferramentas existentes, em vez de gastar tokens dos agentes nela a cada vez.
Comece pelos elementos diretamente ligados a você: leia notas com zn note read, tabelas com zn table read, arquivos com zn file, pastas com zn folder e sites com zn web snapshot. Use zn canvas para consultar as operações de organização. Faça alterações no canvas pelos comandos zn, para que o usuário acompanhe pela janela.
A pasta mostrada no cabeçalho do terminal é só o diretório de trabalho. Ela não representa os elementos ligados a você nem autoriza uma varredura recursiva do disco. Um pedido genérico como "analisa todos os arquivos" deve começar pelo canvas; se os arquivos não estiverem ligados e o escopo não estiver claro, peça ao usuário para ligar os elementos ou indicar a pasta.
Não substitua a consulta ao canvas por Get-ChildItem recursivo, busca global no disco, leitura dos arquivos internos do Zênite, controle da área de trabalho ou abertura de navegador externo. Para arquivo ou pasta exposto pelo canvas, use o caminho retornado pelo zn apenas no escopo necessário à tarefa. Controle externo somente quando o usuário solicitar.
Antes de recrutar um terminal novo (zn recruit), analise o canvas com zn canvas e zn agent: se já houver um terminal parado ou sem papel definido do agente/modelo de que a tarefa precisa, reaproveite-o (zn ask, e defina o papel com zn terminal edit --role). Só recrute quando nenhum serve.
Vale o mesmo para qualquer elemento: antes de criar nota, tabela, arquivo ou site, veja o que o canvas já tem e use ou atualize o que existe (zn table set/write, zn note append). Crie um elemento novo só quando for realmente mais produtivo e fizer sentido. Lista, status ou registro por item (por exemplo, vídeos em ordem com o status de cada um) é uma única tabela com uma linha por item e uma coluna de status, nunca várias notas. Nota serve para texto corrido sobre um assunto.
Se zn falhar ou não houver elementos ligados, informe isso; não contorne a conexão por outros meios. A função de Sol permite organizar o canvas, mas não amplia as permissões: respeite Sempre perguntar, Sandbox ou Controle total. Não troque permissões por conta própria.`;

/** Orientação do canvas é independente da autorização de Full Access. */
export function solWelcomeMessage(mode?: AgentPermissions): string {
  return canGrantSolAccess(mode) ? `${SOL_ACCESS_MESSAGE}\n\n${SOL_CANVAS_MESSAGE}` : SOL_CANVAS_MESSAGE;
}

/** O papel de Sol nunca amplia a permissão escolhida nas configurações. */
export function canGrantSolAccess(mode?: AgentPermissions): boolean {
  return mode === "full";
}

export function scriptPermission(mode?: AgentPermissions): "confirm" | "deny" | "allow" {
  return mode === "sandbox" ? "deny" : mode === "full" ? "allow" : "confirm";
}

/** Os agentes de um fluxo sem diálogo de aprovação não podem ampliar a permissão global. */
export function flowPermission(mode: AgentPermissions | undefined, requested: "read" | "sandbox" | "full" = "sandbox"): "read" | "sandbox" | "full" {
  if (!mode || mode === "ask") return "read";
  if (mode === "sandbox" && requested === "full") return "sandbox";
  return requested;
}

/** Muda a sessão atual do Codex; a conversa e o processo continuam abertos. */
export async function grantCodexSolAccess(term: AgentTerm): Promise<void> {
  await whenIdle(term, false, 60_000);
  if (parseMenu((await term.snapshot(80)) ?? "")) {
    term.write(ESC);
    await settle(term, { min: 300, quiet: 500, max: 3000 });
  }
  try {
    const current = parseStatusFields(await runSlash(term, "/status"));
    if (/full access|unrestricted/i.test(current.Permissions ?? "")) return;
    const opened = await runSlash(term, "/permissions");
    if (!parseMenu(opened)?.items.some((item) => /full access/i.test(item.text))) throw new Error("O Codex não mostrou a opção Full Access. A promoção não alterou as permissões da sessão.");
    let screen = await pick(term, "Full access");
    if (/Enable full access\?/i.test(screen)) screen = await pick(term, "Yes, continue anyway");
    if (parseMenu(screen)) throw new Error("O Codex ainda está em um menu de permissões; Full Access não foi confirmado.");
    const changed = parseStatusFields(await runSlash(term, "/status"));
    if (!/full access|unrestricted/i.test(changed.Permissions ?? "")) throw new Error("O Codex não confirmou Full Access no status da sessão.");
  } catch (error) {
    term.write(ESC);
    throw error;
  }
}
