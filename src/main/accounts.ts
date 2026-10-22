import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AccountMeta } from "../shared/types";
import { installGuide, uninstallGuide } from "./agentGuide";

/**
 * Cada conta tem uma pasta própria com o login e a configuração do agente:
 * Claude Code lê CLAUDE_CONFIG_DIR, Codex lê CODEX_HOME. O Antigravity (agy) não tem variável
 * própria: veja env().
 */
export class Accounts {
  constructor(
    private root: string,
    /** Pasta curta para os atalhos do Codex (veja codexHome). */
    private shortRoot = join(homedir(), ".zenite"),
  ) {}

  dir(account: AccountMeta): string {
    return join(this.root, account.id);
  }

  /** Cria a pasta da conta e põe (ou tira) o guia. As skills vêm da biblioteca (skills.ts). */
  prepare(account: AccountMeta, withGuide = true, guideExtra = ""): void {
    const dir = this.dir(account);
    mkdirSync(dir, { recursive: true });
    if (account.agent === "codex") {
      keepCodexLoginInFolder(dir);
      allowZnOutsideSandbox(dir);
      this.codexHome(account);
    }
    const guide = this.guideFile(account);
    if (withGuide) installGuide(guide, true, guideExtra);
    else uninstallGuide(guide);
  }

  /** Pasta de skills da conta (só Claude: o Codex lê ~/.agents/skills, que vale para todas). */
  skillsDir(account: AccountMeta): string | null {
    return account.agent === "claude" ? join(this.dir(account), "skills") : null;
  }

  /** Arquivo de instruções globais do agente dentro da pasta da conta. */
  guideFile(account: AccountMeta): string {
    return join(this.dir(account), account.agent === "claude" ? "CLAUDE.md" : "AGENTS.md");
  }

  env(account: AccountMeta): Record<string, string> {
    if (account.agent === "claude") return { CLAUDE_CONFIG_DIR: this.dir(account) };
    if (account.agent === "codex") return { CODEX_HOME: this.codexHome(account) };
    // Antigravity: o agy guarda o login numa entrada fixa do cofre do Windows, uma só por usuário.
    // Com SSH_CONNECTION ele passa a guardar em arquivo, dentro de ~/.gemini; e ~ vem de USERPROFILE.
    // HOME continua sendo a pasta real, para o git e as ferramentas do shell acharem a configuração.
    return { USERPROFILE: this.dir(account), HOME: homedir(), SSH_CONNECTION: "127.0.0.1 0 127.0.0.1 0" };
  }

  /** Já tem login guardado na pasta? Claude: .credentials.json; Codex: auth.json; Antigravity: o token do agy. */
  loggedIn(account: AccountMeta): boolean {
    if (account.agent === "antigravity") return existsSync(join(this.dir(account), ".gemini", "antigravity-cli", "antigravity-oauth-token"));
    // Codex: o login fica na pasta curta (~/.zenite/<id>); contas/<id> é só um atalho para ela.
    if (account.agent === "codex" && existsSync(join(this.codexHomePath(account), "auth.json"))) return true;
    return existsSync(join(this.dir(account), account.agent === "claude" ? ".credentials.json" : "auth.json"));
  }

  /**
   * O Codex cria um socket dentro do CODEX_HOME, e no Windows o caminho de um socket tem limite
   * (~108 caracteres): com %APPDATA%\Zenite\contas\<id> ele passava disso e o Codex não abria
   * ("path must be shorter than SUN_LEN"). Um atalho curto não resolve, porque o Codex segue o
   * atalho até o caminho real. Então a pasta de verdade fica em ~/.zenite/<8 primeiros do id> e
   * contas/<id> vira o atalho (junction) para ela; uma pasta antiga é movida para lá uma vez.
   */
  codexHome(account: AccountMeta): string {
    const home = join(this.shortRoot, account.id.slice(0, 8));
    const dir = this.dir(account);
    try {
      if (!existsSync(home) || lstatSync(home).isSymbolicLink()) {
        rmSync(home, { force: true }); // atalho de uma versão anterior: some sem tocar no conteúdo
        mkdirSync(this.shortRoot, { recursive: true });
        if (existsSync(dir) && !lstatSync(dir).isSymbolicLink()) renameSync(dir, home);
        else mkdirSync(home, { recursive: true });
      }
      if (!existsSync(dir)) symlinkSync(home, dir, "junction");
      return home;
    } catch {
      // Pasta em uso (um Codex aberto por outro app): fica onde está; a mudança sai na próxima vez.
      return existsSync(home) && !lstatSync(home).isSymbolicLink() ? home : dir;
    }
  }

  /** Pasta curta do Codex (CODEX_HOME), sem criar nada: para ler os arquivos da conta. */
  codexHomePath(account: AccountMeta): string {
    return join(this.shortRoot, account.id.slice(0, 8));
  }

  /** Apaga a pasta da conta, com o login guardado nela (no Codex, a pasta curta e o atalho). */
  remove(account: AccountMeta): void {
    if (account.agent === "codex") rmSync(join(this.shortRoot, account.id.slice(0, 8)), { recursive: true, force: true });
    rmSync(this.dir(account), { recursive: true, force: true });
  }
}

/**
 * Codex: login em auth.json dentro da pasta da conta, e não no cofre do Windows.
 * Assim cada conta fica com o login à vista, no lugar dela. A chave vai no topo do
 * config.toml: depois de um [cabeçalho] ela passaria a pertencer àquela tabela.
 */
function keepCodexLoginInFolder(dir: string): void {
  const file = join(dir, "config.toml");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (/^\s*cli_auth_credentials_store\s*=/m.test(current)) return;
  writeFileSync(file, `cli_auth_credentials_store = "file"\n${current}`);
}

/**
 * Codex: o zn fala com o Zênite por um named pipe, e a sandbox do Codex no Windows bloqueia a
 * conexão ("connect EPERM \\.\pipe\o-..."). Uma regra "allow" faz o Codex rodar o zn sem pedir
 * e fora da sandbox, como quando o usuário aprova "sempre rodar zn ...".
 */
function allowZnOutsideSandbox(dir: string): void {
  const rules = join(dir, "rules");
  const file = join(rules, "default.rules");
  const rule = 'prefix_rule(pattern=["zn"], decision="allow")';
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (current.includes(rule)) return;
  mkdirSync(rules, { recursive: true });
  writeFileSync(file, `${current}${current && !current.endsWith("\n") ? "\n" : ""}${rule}\n`);
}
