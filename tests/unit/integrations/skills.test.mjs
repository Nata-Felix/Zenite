// Biblioteca de skills: distribuir para todos os agentes sem pisar nas skills do usuário.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "skills.mjs");
await build({ entryPoints: ["src/main/skills.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { SkillLibrary, readSkill, safeSkillName } = await import(pathToFileURL(outfile).href);

const skill = (dir, name, description, body = "corpo") => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
  return dir;
};

function setup() {
  const base = mkdtempSync(join(tmpdir(), "o-skills-"));
  const targets = [
    { label: "Claude Code", root: join(base, "home", ".claude", "skills") },
    { label: "Codex, Gemini e outros", root: join(base, "home", ".agents", "skills") },
    { label: "Claude · conta Trabalho", root: join(base, "contas", "c1", "skills") },
  ];
  const lib = new SkillLibrary(join(base, "lib"), () => targets, () => [{ name: "zenite", content: "---\nname: zenite\ndescription: Usa o zn\n---\n\n<!-- gerado pelo Zênite -->\n" }]);
  return { base, targets, lib };
}

test("a skill do Zênite e as da biblioteca vão para todos os agentes e contas", () => {
  const { base, targets, lib } = setup();
  const added = lib.add(skill(join(base, "src", "Revisão PT"), "Revisão PT", "Revisa textos em português"));
  assert.equal(added.ok, true);
  assert.equal(added.skill.name, "revisao-pt");
  const results = lib.sync();
  for (const t of targets) {
    assert.ok(existsSync(join(t.root, "zenite", "SKILL.md")), t.label);
    assert.match(readFileSync(join(t.root, "revisao-pt", "SKILL.md"), "utf8"), /Revisa textos/);
  }
  assert.deepEqual(results.map((r) => r.installed.sort()), targets.map(() => ["revisao-pt", "zenite"]));
  assert.deepEqual(lib.list().map((s) => [s.name, !!s.builtin]), [["zenite", true], ["revisao-pt", false]]);
  assert.match(lib.index(), /revisao-pt\*\*: Revisa textos em português → leia `.*SKILL\.md`/);
});

test("skill do usuário com o mesmo nome não é substituída; remover só apaga cópias do Zênite", () => {
  const { base, targets, lib } = setup();
  skill(join(targets[0].root, "deploy"), "deploy", "A minha, feita à mão");
  lib.add(skill(join(base, "src", "deploy"), "deploy", "A da biblioteca"));
  const r = lib.sync();
  assert.deepEqual(r[0].conflicts, ["deploy"]);
  assert.match(readFileSync(join(targets[0].root, "deploy", "SKILL.md"), "utf8"), /feita à mão/);
  assert.match(readFileSync(join(targets[1].root, "deploy", "SKILL.md"), "utf8"), /da biblioteca/);
  lib.remove("deploy");
  lib.sync();
  assert.ok(existsSync(join(targets[0].root, "deploy")), "a do usuário fica");
  assert.equal(existsSync(join(targets[1].root, "deploy")), false, "a cópia do Zênite sai");
});

test("encontra skills que só um agente vê, e migra a skill antiga o-canvas", () => {
  const { base, targets, lib } = setup();
  skill(join(targets[0].root, "minha"), "minha", "Só o Claude padrão vê");
  skill(join(targets[2].root, "o-canvas"), "o-canvas", "antiga\n\n<!-- gerado pelo app O -->");
  writeFileSync(join(targets[2].root, "o-canvas", "SKILL.md"), "---\nname: o-canvas\ndescription: antiga\n---\n<!-- gerado pelo app O -->\n");
  const found = lib.discover();
  assert.deepEqual(found.map((s) => [s.name, s.source]), [["minha", "Claude Code"]]);
  lib.sync();
  assert.equal(existsSync(join(targets[2].root, "o-canvas")), false);
  assert.equal(lib.add(found[0].dir).ok, true);
  lib.sync();
  assert.ok(existsSync(join(targets[1].root, "minha", "SKILL.md")), "agora o Codex/Gemini também vê");
  assert.equal(lib.discover().length, 0);
  assert.deepEqual(lib.sync()[0].conflicts, [], "a original igual à da biblioteca não é conflito");
});

test("pasta sem SKILL.md é recusada; nomes ficam seguros", () => {
  const { base, lib } = setup();
  mkdirSync(join(base, "vazia"));
  assert.equal(lib.add(join(base, "vazia")).ok, false);
  assert.equal(lib.add(skill(join(base, "z"), "zenite", "x")).ok, false, "não sobrescreve a do Zênite");
  assert.equal(safeSkillName("../../Ção Ótima!"), "cao-otima");
  assert.equal(readSkill(join(base, "nao-existe")), null);
});
