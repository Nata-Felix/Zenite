// URL que o CLI quebra em várias linhas (como o login do agy): clique e cópia pegam a URL inteira.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "wrappedLinks.mjs");
await build({ entryPoints: ["src/renderer/wrappedLinks.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { wrappedUrlAt, joinCopiedUrl } = await import(pathToFileURL(outfile).href);

const pieces = [
  "https://accounts.google.com/o/oauth2/auth?access_type=offline&client_id=1071006060591-t",
  " mhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com&code_challenge=YvxSznYawJEE9",
  " 811n_-C_Aa4dv0pb1fxgpV4hiDXD5A&code_challenge_method=S256&prompt=consent&redirect_uri=h",
  " ttps%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&scope=openid&state=CnDf ",
];
const full = pieces.map((l) => l.trim()).join("");
const screen = ["Abra este link para entrar:", "", ...pieces, "", "Aguardando o login..."];

test("qualquer pedaço da URL quebrada devolve a URL inteira", () => {
  for (let row = 2; row <= 5; row++) assert.deepEqual(wrappedUrlAt(screen, row), { url: full, first: 2, last: 5 });
  assert.equal(full.includes(" "), false);
  assert.ok(full.endsWith("state=CnDf"));
});

test("texto comum e URL de uma linha só ficam com o WebLinksAddon", () => {
  assert.equal(wrappedUrlAt(screen, 0), null);
  assert.equal(wrappedUrlAt(screen, 6), null);
  assert.equal(wrappedUrlAt(["veja https://x.com/a agora", "proxima"], 0), null);
  assert.equal(wrappedUrlAt(["https://x.com/a", "", "texto"], 0), null);
});

test("copiar a URL quebrada tira as quebras e os espaços; outros textos ficam iguais", () => {
  assert.equal(joinCopiedUrl(pieces.join("\r\n")), full);
  // A seleção que passa do fim pega o rodapé de rolagem do agy.
  assert.equal(joinCopiedUrl(`${pieces.join("\r\n")}\r\n  (1–17 of 29 lines)`), full);
  assert.equal(joinCopiedUrl("linha 1\nlinha 2"), "linha 1\nlinha 2");
  assert.equal(joinCopiedUrl("https://x.com/a\ncomando com espaço"), "https://x.com/a\ncomando com espaço");
});
