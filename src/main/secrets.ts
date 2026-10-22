import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** O que usamos do safeStorage do Electron (separado para dar para testar fora do Electron). */
export interface Cipher {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(data: Buffer): string;
}

export type SecretName = "openrouter";

/**
 * Chaves de API guardadas criptografadas pelo sistema (no Windows, DPAPI: só este usuário do
 * Windows consegue abrir). Ficam em <dados>/segredos/<nome>.bin. A página do app nunca recebe o
 * valor: ela só sabe se existe; o valor vai direto para as variáveis do terminal que precisa.
 */
export class Secrets {
  constructor(
    private dir: string,
    private cipher: Cipher,
  ) {}

  private file(name: SecretName): string {
    return join(this.dir, `${name}.bin`);
  }

  available(): boolean {
    return this.cipher.isEncryptionAvailable();
  }

  has(name: SecretName): boolean {
    return existsSync(this.file(name));
  }

  set(name: SecretName, value: string): { ok: boolean; error?: string } {
    const v = value.trim();
    if (!v) return { ok: false, error: "A chave está vazia." };
    if (/\s/.test(v)) return { ok: false, error: "A chave não pode ter espaços." };
    if (!this.available()) return { ok: false, error: "A criptografia do sistema não está disponível; a chave não foi salva." };
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(name), this.cipher.encryptString(v));
    return { ok: true };
  }

  /** O valor, ou null se não existe ou não dá para abrir (ex.: outro usuário do Windows). */
  get(name: SecretName): string | null {
    if (!this.has(name) || !this.available()) return null;
    try {
      return this.cipher.decryptString(readFileSync(this.file(name)));
    } catch {
      return null;
    }
  }

  remove(name: SecretName): void {
    rmSync(this.file(name), { force: true });
  }
}

/** Claude Code falando com a OpenRouter (endpoint compatível com a API da Anthropic). */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

export function openRouterEnv(key: string, configDir: string, model?: string): Record<string, string> {
  return {
    ANTHROPIC_BASE_URL: OPENROUTER_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: key,
    // Precisa estar vazia: senão o Claude Code tenta a API da Anthropic com ela.
    ANTHROPIC_API_KEY: "",
    // Pasta própria: o login normal da Anthropic não interfere (nem precisa de /logout).
    CLAUDE_CONFIG_DIR: configDir,
    ...(model?.trim() ? { ANTHROPIC_MODEL: model.trim() } : {}),
  };
}
