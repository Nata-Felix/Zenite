// Leitura/escrita de .env preservando o arquivo do usuário.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "env.mjs");
await build({ entryPoints: ["src/main/envFile.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { parseEnv, serializeEnv, validateEntries, formatValue } = await import(pathToFileURL(outfile).href);

const sample = `# Configuração do projeto
PORT=3000
export NODE_ENV=development

# Chaves
OPENAI_API_KEY="sk-abc 123" # chave pessoal
NOME='Maria "Mari" Silva'
URL=https://exemplo.com/a?b=1 # comentário
MULTI="linha 1
linha 2"
PORT=4000
`;

test("lê pares, aspas, export, comentários e multilinha; última ocorrência vence", () => {
  assert.deepEqual(parseEnv(sample), [
    { key: "PORT", value: "4000" },
    { key: "NODE_ENV", value: "development" },
    { key: "OPENAI_API_KEY", value: "sk-abc 123" },
    { key: "NOME", value: 'Maria "Mari" Silva' },
    { key: "URL", value: "https://exemplo.com/a?b=1" },
    { key: "MULTI", value: "linha 1\nlinha 2" },
  ]);
});

test("salvar sem mudar nada mantém o arquivo (fora a chave duplicada)", () => {
  const out = serializeEnv(sample, parseEnv(sample));
  // PORT aparecia duas vezes; fica uma linha só, com o valor que vale (o último).
  assert.match(out, /^# Configuração do projeto\nPORT=4000\n/);
  assert.match(out, /OPENAI_API_KEY="sk-abc 123" # chave pessoal/);
  assert.match(out, /MULTI="linha 1\nlinha 2"/);
  assert.equal(out.match(/^PORT=/gm).length, 1);
});

test("editar, remover e acrescentar preservando comentários", () => {
  const entries = parseEnv(sample)
    .filter((e) => e.key !== "NOME")
    .map((e) => (e.key === "PORT" ? { ...e, value: "5000" } : e))
    .concat([{ key: "NOVA", value: "valor com espaço" }]);
  const out = serializeEnv(sample, entries);
  assert.match(out, /# Configuração do projeto/);
  assert.match(out, /# Chaves/);
  assert.match(out, /^PORT=5000$/m);
  assert.doesNotMatch(out, /NOME=/);
  assert.match(out, /NOVA="valor com espaço"\n$/);
  assert.deepEqual(parseEnv(out).find((e) => e.key === "NOVA"), { key: "NOVA", value: "valor com espaço" });
});

test("valores especiais voltam iguais depois de salvar e ler", () => {
  for (const value of ['tem "aspas"', "barra \\ invertida", "linha\nquebrada", "# não é comentário", "", "simples"]) {
    assert.equal(parseEnv(serializeEnv("", [{ key: "K", value }]))[0].value, value, value);
  }
  assert.equal(formatValue("abc_123"), "abc_123");
});

test("validação de chaves", () => {
  assert.equal(validateEntries([{ key: "OK_1", value: "" }]), null);
  assert.match(validateEntries([{ key: "com espaço", value: "" }]), /Chave inválida/);
  assert.match(validateEntries([{ key: "1A", value: "" }]), /Chave inválida/);
  assert.match(validateEntries([{ key: "A", value: "" }, { key: "A", value: "" }]), /duas vezes/);
});
