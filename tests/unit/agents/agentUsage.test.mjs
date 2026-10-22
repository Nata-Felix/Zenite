// Limite de uso dos agentes: números do Codex (arquivo da sessão) e aviso de limite na tela.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "agentUsage.mjs");
await build({ entryPoints: ["src/main/agentUsage.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { parseCodexLimits, codexUsage, limitMessage } = await import(pathToFileURL(outfile).href);

const NOW = 1_792_500_000_000;
const limitsLine = (primary, secondary, reachedType = null) =>
  JSON.stringify({
    timestamp: "2026-10-20T11:10:58Z",
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        limit_id: "codex",
        primary: { used_percent: primary, window_minutes: 300, resets_at: NOW / 1000 + 3600 },
        secondary: { used_percent: secondary, window_minutes: 10080, resets_at: NOW / 1000 + 86400 },
        plan_type: "plus",
        rate_limit_reached_type: reachedType,
      },
    },
  });

test("lê o último registro de limites da sessão", () => {
  const text = [limitsLine(5, 1), '{"type":"response_item"}', limitsLine(11, 2), '{"type":"other"}'].join("\n");
  const u = parseCodexLimits(text, NOW);
  assert.equal(u.source, "codex");
  assert.equal(u.primary.usedPercent, 11);
  assert.equal(u.primary.windowMinutes, 300);
  assert.equal(u.primary.resetsAt, NOW + 3600 * 1000);
  assert.equal(u.secondary.usedPercent, 2);
  assert.equal(u.reached, false);
});

test("esgotado: aviso do Codex ou 100%, enquanto a janela não zerou", () => {
  assert.equal(parseCodexLimits(limitsLine(100, 40), NOW).reached, true);
  assert.equal(parseCodexLimits(limitsLine(60, 40, "primary"), NOW).reached, true);
  // Depois que as duas janelas zeram, o número antigo não vale mais.
  const later = NOW + 2 * 86400 * 1000;
  const u = parseCodexLimits(limitsLine(100, 40, "primary"), later);
  assert.equal(u.reached, false);
  assert.equal(u.primary.usedPercent, 0);
});

test("linha cortada no começo do trecho lido é ignorada", () => {
  const cut = limitsLine(30, 3).slice(20);
  assert.equal(parseCodexLimits(cut, NOW), null);
  assert.equal(parseCodexLimits(`${limitsLine(7, 1)}\n${cut}`, NOW).primary.usedPercent, 7);
});

test("acha a sessão mais recente na pasta da conta", () => {
  const home = mkdtempSync(join(tmpdir(), "o-codex-home-"));
  const day = join(home, "sessions", "2026", "10", "20");
  mkdirSync(day, { recursive: true });
  writeFileSync(join(day, "rollout-a.jsonl"), limitsLine(9, 1));
  const u = codexUsage(home, NOW);
  assert.equal(u.primary.usedPercent, 9);
  assert.equal(codexUsage(join(home, "nada"), NOW), null);
});

test("aviso de limite na tela de cada CLI", () => {
  assert.match(limitMessage("■ You've hit your usage limit. Upgrade to Pro or try again at 3:05 PM."), /usage limit/);
  assert.match(limitMessage("  5-hour limit reached ∙ resets 2pm\n> "), /limit reached/);
  assert.match(limitMessage("Error: RESOURCE_EXHAUSTED: Quota exceeded for model"), /RESOURCE_EXHAUSTED/);
  assert.equal(limitMessage("PS C:\\projeto> npm run build\n✓ built in 3s"), null);
});
