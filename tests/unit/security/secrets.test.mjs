// Cofre de chaves (Secrets) e variáveis do Claude Code via OpenRouter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "secrets.mjs");
await build({ entryPoints: ["src/main/secrets.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { Secrets, openRouterEnv, OPENROUTER_BASE_URL } = await import(pathToFileURL(outfile).href);

// Cifra de mentira (inverte os bytes): no app é o safeStorage do Electron (DPAPI no Windows).
const fakeCipher = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(Buffer.from(s, "utf8").reverse()),
  decryptString: (b) => Buffer.from(b).reverse().toString("utf8"),
});

test("guarda cifrado, lê de volta e remove", () => {
  const dir = mkdtempSync(join(tmpdir(), "zn-secrets-"));
  try {
    const s = new Secrets(dir, fakeCipher());
    assert.equal(s.has("openrouter"), false);
    assert.deepEqual(s.set("openrouter", "  sk-or-teste-123  "), { ok: true });
    assert.equal(s.has("openrouter"), true);
    // No disco não fica o texto da chave.
    assert.doesNotMatch(readFileSync(join(dir, "openrouter.bin"), "latin1"), /sk-or-teste/);
    assert.equal(s.get("openrouter"), "sk-or-teste-123");
    s.remove("openrouter");
    assert.equal(s.has("openrouter"), false);
    assert.equal(s.get("openrouter"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recusa chave vazia, com espaços ou sem criptografia disponível", () => {
  const dir = mkdtempSync(join(tmpdir(), "zn-secrets-"));
  try {
    assert.equal(new Secrets(dir, fakeCipher()).set("openrouter", "   ").ok, false);
    assert.equal(new Secrets(dir, fakeCipher()).set("openrouter", "sk or").ok, false);
    const off = new Secrets(dir, fakeCipher(false));
    assert.equal(off.set("openrouter", "sk-or-x").ok, false);
    assert.equal(off.has("openrouter"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("variáveis do Claude Code via OpenRouter", () => {
  const env = openRouterEnv("sk-or-x", "C:\dados\contas\openrouter");
  assert.equal(env.ANTHROPIC_BASE_URL, OPENROUTER_BASE_URL);
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, "sk-or-x");
  assert.equal(env.ANTHROPIC_API_KEY, "");
  assert.equal(env.CLAUDE_CONFIG_DIR, "C:\dados\contas\openrouter");
  assert.equal("ANTHROPIC_MODEL" in env, false);
  assert.equal(openRouterEnv("k", "d", " anthropic/claude-sonnet-4.5 ").ANTHROPIC_MODEL, "anthropic/claude-sonnet-4.5");
});
