import type { AgentPermissions } from "../shared/types";

/**
 * Permissões dos agentes, escolhidas nas configurações e aplicadas ao abrir o terminal (o "Full
 * Access" escolhido dentro do CLI vale só para aquela conversa e some no Reload):
 *  - "ask": como o CLI vem; pergunta antes de comandos e edições.
 *  - "sandbox": trabalha sem perguntar, mas preso à área protegida (pasta do projeto).
 *    O Claude Code é recusado nesse modo no Windows, onde não oferece sandbox.
 *  - "full": sem perguntar e sem sandbox.
 * Só o primeiro programa da linha de comando é olhado: um comando qualquer fica igual.
 */
const FLAGS: Record<string, Record<AgentPermissions, string>> = {
  codex: { ask: "--sandbox workspace-write --ask-for-approval on-request", sandbox: "--sandbox workspace-write --ask-for-approval never", full: "--dangerously-bypass-approvals-and-sandbox" },
  claude: { ask: "--permission-mode default", sandbox: "--permission-mode acceptEdits", full: "--dangerously-skip-permissions" },
  agy: { ask: "", sandbox: "--sandbox --dangerously-skip-permissions", full: "--dangerously-skip-permissions" },
};

/** Nome do programa sem pasta nem extensão: "C:\\x\\codex.cmd" → "codex". */
export function program(token: string): string {
  return token.replace(/^["']|["']$/g, "").split(/[\\/]/).pop()!.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
}

export function withPermissions(command: string, mode: AgentPermissions = "ask"): string {
  const trimmed = command.trim();
  const first = trimmed.match(/^("[^"]*"|'[^']*'|\S+)/)?.[0];
  const kind = first ? program(first) : "";
  if (!first || !FLAGS[kind]) return command;
  if (kind === "claude" && mode === "sandbox" && process.platform === "win32") throw new Error("Claude Code não oferece sandbox no Windows. Escolha Codex ou Antigravity para usar o modo Sandbox.");
  const flags = FLAGS[kind][mode];
  const tokens = trimmed.slice(first.length).match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^--(?:dangerously-bypass-approvals-and-sandbox|dangerously-skip-permissions|allow-dangerously-skip-permissions|full-auto|yolo)$/.test(token)) continue;
    if (/^(?:--sandbox|--ask-for-approval|--permission-mode|--approval-mode|-s|-a)$/.test(token) || (kind === "agy" && token === "--mode")) {
      if ((token !== "--sandbox" || kind === "codex") && tokens[i + 1] && !tokens[i + 1].startsWith("-")) i++;
      continue;
    }
    if (/^--(?:sandbox|ask-for-approval|permission-mode|approval-mode)=/.test(token)) continue;
    if (kind === "agy" && /^--mode=/.test(token)) continue;
    if (kind === "codex" && /^--config=(?:"|')?(?:approval_policy|sandbox_mode)=/.test(token)) continue;
    if (kind === "codex" && /^(?:-c|--config)$/.test(token) && /^(?:"|')?(?:approval_policy|sandbox_mode)=/.test(tokens[i + 1] ?? "")) { i++; continue; }
    kept.push(token);
  }
  return [first, flags, ...kept].filter(Boolean).join(" ");
}

/** Chamado só quando o usuário escolheu acesso total nas configurações globais. */
export function withSolAccess(command: string): string {
  return withPermissions(command, "full");
}

/** Programa de uma linha de comando: o primeiro item, sem pasta nem extensão ("" se vazia). */
export function programOf(command: string): string {
  const first = command.trim().match(/^("[^"]*"|'[^']*'|\S+)/)?.[0];
  return first ? program(first) : "";
}
