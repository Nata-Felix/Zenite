import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tema que o próprio CLI está usando, para o terminal ter o fundo que ele espera: um CLI escuro
 * num terminal claro (ou o contrário) fica ilegível. Devolve "dark", "light" ou o nome de um esquema
 * (ex.: "solarized-dark"); null quando o CLI não tem tema próprio (Codex e shell se adaptam ao fundo).
 * `configDir` é a pasta da conta, quando o terminal usa uma; senão, a pasta do usuário.
 */
export function cliTheme(command: string, configDir: string): string | null {
  const program = command.trim().split(/\s+/)[0]?.split(/[\\/]/).pop()?.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
  if (program === "claude") {
    // Claude Code: "theme" em .claude.json (light, light-daltonized, dark...). Sem valor, é escuro.
    const theme = readJson(join(configDir, ".claude.json"))?.theme;
    return typeof theme === "string" && theme.startsWith("light") ? "light" : "dark";
  }
  if (program === "agy") {
    // Antigravity: "colorScheme" em settings.json (ex.: "solarized dark"). Sem valor, é escuro.
    const scheme = readJson(join(configDir, ".gemini", "antigravity-cli", "settings.json"))?.colorScheme;
    return typeof scheme === "string" && scheme.trim() ? scheme.trim().toLowerCase().replace(/\s+/g, "-") : "dark";
  }
  return null;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
