// Gera o pacote da atualização leve depois do electron-builder: dist/app-<versão>.tar.gz com
// resources/app.asar e resources/app.asar.unpacked de dist/win-unpacked, e dist/app-update.json
// dizendo para qual Electron ele serve. Os dois vão para o Release junto com o instalador.
import { build } from "esbuild";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "scripts", "appUpdate.mjs");
await build({ entryPoints: ["src/main/appUpdate.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { APP_FILES, packDir, sha512 } = await import(pathToFileURL(outfile).href);

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const electron = JSON.parse(readFileSync(join("node_modules", "electron", "package.json"), "utf8")).version;
const resources = join("dist", "win-unpacked", "resources");
for (const f of APP_FILES) if (!existsSync(join(resources, f))) throw new Error(`falta ${join(resources, f)}: rode o electron-builder antes`);

const name = `app-${version}.tar.gz`;
const data = packDir(resources, APP_FILES);
writeFileSync(join("dist", name), data);
const manifest = { version, electron, platform: "win32", arch: "x64", sha512: sha512(data), size: data.length, url: name };
writeFileSync(join("dist", "app-update.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`atualização leve: dist/${name} (${(data.length / 1024 / 1024).toFixed(1)} MB, Electron ${electron})`);
