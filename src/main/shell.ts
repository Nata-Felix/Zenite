import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ShellChoice } from "../shared/types";

export interface ShellLaunch {
  file: string;
  args: string[];
}

type Exists = (path: string) => boolean;

/**
 * Decide qual shell abrir. Com `command`, o shell executa o comando e continua
 * aberto depois que ele termina, para o usuário ver a saída e poder rodar de novo.
 * `choice` só vale no Windows (em outros sistemas, usa o $SHELL).
 */
export function resolveShell(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  choice: ShellChoice = "auto",
  exists: Exists = existsSync,
): ShellLaunch {
  const trimmed = command.trim();
  if (platform === "win32") {
    if (choice === "cmd") return { file: env.ComSpec || "cmd.exe", args: trimmed ? ["/K", trimmed] : [] };
    if (choice === "gitbash") {
      const bash = findGitBash(env, exists);
      // Sem "--login": o perfil de login reescreve o PATH e apagaria o atalho do `zn`.
      if (bash) return trimmed ? { file: bash, args: ["-ic", `${trimmed}; exec bash -i`] } : { file: bash, args: ["-i"] };
    }
    const file = choice === "powershell" ? "powershell.exe" : (findPwsh(env, exists) ?? "powershell.exe");
    const args = ["-NoLogo"];
    if (trimmed) args.push("-NoExit", "-Command", trimmed);
    return { file, args };
  }
  const file = env.SHELL || "/bin/bash";
  // `exec $SHELL` mantém um shell interativo vivo após o comando. Sem "-l" (login):
  // o /etc/profile de várias distros reescreve o PATH e apagaria o atalho do `zn`.
  return trimmed ? { file, args: ["-ic", `${trimmed}; exec "${file}" -i`] } : { file, args: ["-i"] };
}

function findPwsh(env: NodeJS.ProcessEnv, exists: Exists): string | undefined {
  const candidates = [
    env.ProgramFiles && join(env.ProgramFiles, "PowerShell", "7", "pwsh.exe"),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Microsoft", "WindowsApps", "pwsh.exe"),
  ];
  return candidates.find((p): p is string => !!p && exists(p));
}

function findGitBash(env: NodeJS.ProcessEnv, exists: Exists): string | undefined {
  const candidates = [
    env.ProgramFiles && join(env.ProgramFiles, "Git", "bin", "bash.exe"),
    env["ProgramFiles(x86)"] && join(env["ProgramFiles(x86)"]!, "Git", "bin", "bash.exe"),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
  ];
  return candidates.find((p): p is string => !!p && exists(p));
}

/** Shells disponíveis neste computador (para a tela de configurações). */
export function availableShells(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, exists: Exists = existsSync): { value: ShellChoice; label: string; available: boolean }[] {
  if (platform !== "win32") return [{ value: "auto", label: `Padrão do sistema (${env.SHELL || "/bin/bash"})`, available: true }];
  return [
    { value: "auto", label: "Automático (PowerShell 7 se houver)", available: true },
    { value: "pwsh", label: "PowerShell 7", available: !!findPwsh(env, exists) },
    { value: "powershell", label: "Windows PowerShell", available: true },
    { value: "cmd", label: "Prompt de Comando (cmd)", available: true },
    { value: "gitbash", label: "Git Bash", available: !!findGitBash(env, exists) },
  ];
}
