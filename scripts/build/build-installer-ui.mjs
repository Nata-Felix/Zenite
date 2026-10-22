// Compila o instalador visual (installer-ui) com o setup do electron-builder dentro.
// Roda depois do electron-builder: dist/Zenite-Setup-<versão>.exe -> dist/Zenite-Instalador-<versão>.exe
import { execFileSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const setup = join(root, 'dist', `Zenite-Setup-${version}.exe`);
statSync(setup);

// Tamanho do app instalado, para a barra de progresso acompanhar a cópia.
const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
const ui = join(root, 'installer-ui');
writeFileSync(join(ui, 'build-info.txt'), `${version}|${size(join(root, 'dist', 'win-unpacked'))}`);

execFileSync('dotnet', ['build', ui, '-c', 'Release', '-nologo', '-v', 'q', `-p:SetupExe=${setup}`, `-p:Version=${version}`], { stdio: 'inherit' });
const out = join(root, 'dist', `Zenite-Instalador-${version}.exe`);
copyFileSync(join(ui, 'bin', 'Release', 'net48', 'Zenite-Instalador.exe'), out);
console.log(`instalador visual: ${out} (${(statSync(out).size / 1e6).toFixed(0)} MB)`);
