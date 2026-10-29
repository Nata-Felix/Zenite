import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const outfile = join(process.cwd(), 'out/test/wingetProgress.mjs');
await build({ entryPoints: ['src/main/wingetInstall.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
const { parseWingetProgress, nextProgress } = await import(pathToFileURL(outfile));

test('download com tamanho vira fase baixando e percentual', () => {
  assert.deepEqual(parseWingetProgress('  ██████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  20.0 MB /  80.0 MB'), { phase: 'baixando', percent: 25 });
  assert.deepEqual(parseWingetProgress('  ███  512 KB / 2.00 MB'), { phase: 'baixando', percent: 25 });
  assert.deepEqual(parseWingetProgress('  ███  1,5 GB / 3,0 GB'), { phase: 'baixando', percent: 50 });
});

test('a barra redesenhada com \\r e o spinner com \\b ficam com o último valor', () => {
  const chunk = '\b-\b\\\b|\r  ███▒▒▒  10 MB / 100 MB\r  ██████▒▒  60 MB / 100 MB\r\x1b[0K';
  assert.deepEqual(parseWingetProgress(chunk), { phase: 'baixando', percent: 60 });
});

test('fases em inglês e em português', () => {
  assert.deepEqual(parseWingetProgress('Downloading https://github.com/git-for-windows/Git-2.56.0-64-bit.exe\n'), { phase: 'baixando' });
  assert.deepEqual(parseWingetProgress('Baixando https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'), { phase: 'baixando' });
  assert.deepEqual(parseWingetProgress('Successfully verified installer hash\r\nStarting package install...\r\n'), { phase: 'instalando' });
  assert.deepEqual(parseWingetProgress('Hash do instalador verificado com êxito\nIniciando a instalação do pacote...'), { phase: 'instalando' });
  assert.deepEqual(parseWingetProgress('Successfully installed'), { phase: 'concluido', percent: 100 });
  assert.deepEqual(parseWingetProgress('Instalado com êxito'), { phase: 'concluido', percent: 100 });
});

test('percentual sem tamanho vale para a fase em andamento', () => {
  assert.deepEqual(parseWingetProgress('  ████████▒▒▒▒▒▒▒▒  45%'), { percent: 45 });
  assert.deepEqual(parseWingetProgress('Starting package install...\n  ████▒▒▒▒  30%'), { phase: 'instalando', percent: 30 });
});

test('linhas sem informação de progresso não mudam nada', () => {
  assert.equal(parseWingetProgress('Found Git [Git.Git] Version 2.56.0.3'), null);
  assert.equal(parseWingetProgress('This application is licensed to you by its owner.'), null);
  assert.equal(parseWingetProgress('\b-\b\\\b|\b/'), null);
  // Um "100%" solto num texto qualquer não é barra de progresso.
  assert.equal(parseWingetProgress('Microsoft is not responsible for 100% of third-party packages'), null);
});

test('trocar de fase zera o percentual e leituras repetidas não geram aviso', () => {
  const download = nextProgress({ phase: 'preparando' }, parseWingetProgress('  ███  40 MB / 80 MB'));
  assert.deepEqual(download, { phase: 'baixando', percent: 50 });
  assert.equal(nextProgress(download, parseWingetProgress('  ███  40 MB / 80 MB')), download);
  assert.equal(nextProgress(download, null), download);
  assert.deepEqual(nextProgress(download, parseWingetProgress('  ████████  45%')), { phase: 'baixando', percent: 45 });
  assert.deepEqual(nextProgress(download, parseWingetProgress('Starting package install...')), { phase: 'instalando', percent: undefined });
});
